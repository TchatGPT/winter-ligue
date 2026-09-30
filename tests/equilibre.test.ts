import { describe, expect, it } from 'vitest';
import type { Database, Game, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { CARDS, cardsOfRarity, getCard, impactMax, momentDe, PACKS } from '@/lib/domain/catalog';
import { CARD_IMPACT_CAP, GAME_LIMITS, IMPACT_PAR_RARETE } from '@/lib/domain/rules';
import { scoreGame } from '@/lib/domain/scoring';
import { RARITIES, type CardEffect, type Placement } from '@/lib/domain/types';
import { appliqueCartesEnAttente, regleCartesSansAttendre } from '@/lib/services/effects';

/**
 * Garde-fous d'équilibrage.
 *
 * Ces tests ne vérifient pas que le code marche : ils vérifient que le *jeu*
 * reste jouable. Chacun encode une décision de conception qu'on ne veut pas
 * voir disparaître au fil des rééquilibrages — parce qu'une carte trop forte
 * ne se voit pas dans un typecheck, elle se voit trois semaines plus tard
 * quand plus personne ne joue.
 */

/** Kills maximum plausibles sur une game, pour évaluer le pire cas. */
const WORST_CASE_KILLS = GAME_LIMITS.maxKills;

/** La carte à deux : ce que l'un gagne, l'autre le perd. */
const aDeux = (effect: CardEffect) => effect.kind === 'echange';

describe('le budget de chaque rareté', () => {
  it('aucune carte ne dépasse le budget de sa rareté, même au pire cas', () => {
    const offenders: string[] = [];

    for (const card of CARDS) {
      const impact = impactMax(card.effect);
      if (impact !== null && impact > IMPACT_PAR_RARETE[card.rarity]) {
        offenders.push(`${card.name} (${impact} pts pour ${IMPACT_PAR_RARETE[card.rarity]})`);
      }
    }

    // Les actions viennent des roues de la Summer Ligue, pas leur force : une
    // commune qui pèserait quinze points referait les roues.
    expect(offenders).toEqual([]);
  });

  it('monte avec la rareté, et s’arrête au plafond d’une bonne game', () => {
    for (let i = 1; i < RARITIES.length; i += 1) {
      expect(IMPACT_PAR_RARETE[RARITIES[i]]).toBeGreaterThan(IMPACT_PAR_RARETE[RARITIES[i - 1]]);
    }
    expect(IMPACT_PAR_RARETE.L).toBe(CARD_IMPACT_CAP);
    expect(CARD_IMPACT_CAP).toBeGreaterThanOrEqual(15);
    expect(CARD_IMPACT_CAP).toBeLessThanOrEqual(35);
  });

  it('garde les trois raretés du bas à moins de la moitié du plafond', () => {
    // C'est la demande : des cartes « beaucoup moins fortes », sauf en haut.
    for (const rarity of ['C', 'PC', 'R'] as const) {
      expect(IMPACT_PAR_RARETE[rarity]).toBeLessThanOrEqual(CARD_IMPACT_CAP / 2);
    }
    // Et les trois du haut pèsent vraiment.
    for (const rarity of ['SR', 'UR', 'L'] as const) {
      expect(IMPACT_PAR_RARETE[rarity]).toBeGreaterThan(CARD_IMPACT_CAP / 2);
    }
  });

  it('borne tous les multiplicateurs et toutes les copies, sans exception', () => {
    for (const card of CARDS) {
      const e = card.effect;
      if (
        e.kind === 'multiplicateur_game' ||
        e.kind === 'diviseur_game' ||
        e.kind === 'multiplie_jouee' ||
        e.kind === 'clone_kills' ||
        e.kind === 'echange' ||
        e.kind === 'releve_pire'
      ) {
        expect(e.cap).toBeGreaterThan(0);
        expect(e.cap).toBeLessThanOrEqual(IMPACT_PAR_RARETE[card.rarity]);
      }
    }
  });
});

describe('les malus ne transfèrent jamais', () => {
  const malus = CARDS.filter((c) => c.nature === 'malus');

  it('un malus ordinaire ne fait que retirer des points à sa cible', () => {
    // C'est la règle la plus importante du jeu : le vol crée un double
    // mouvement — la victime perd ET l'autre gagne — et c'est ce qui rend
    // l'interaction insupportable des deux côtés.
    for (const card of malus.filter((c) => !aDeux(c.effect))) {
      expect(['malus_points', 'diviseur_game']).toContain(card.effect.kind);
    }
  });

  it('aucun malus ne touche une game déjà jouée par sa cible', () => {
    // Un malus tombe sur la prochaine game : personne ne perd une game
    // qu'il a déjà marquée. Seuls des bonus relèvent une game jouée.
    for (const card of CARDS.filter((c) => momentDe(c.effect) === 'JOUEE')) {
      expect(card.nature).toBe('bonus');
    }
    for (const card of malus) expect(momentDe(card.effect)).toBe('PROCHAINE');
  });

  it('aucune carte ne copie, ne vole ni ne supprime la game d’autrui', () => {
    const kinds: string[] = CARDS.map((c) => c.effect.kind);
    for (const interdit of [
      'copy_best_game',
      'swap_random_game',
      'steal_points',
      'delete_worst_game',
      'delete_game',
    ]) {
      expect(kinds).not.toContain(interdit);
    }
  });

  it('ne laisse personne choisir sa victime', () => {
    // Un malus tombe sur un joueur tiré au sort ou sur la tête du classement.
    // Jamais sur tout le monde : retirer dix points à chacun ne change rien.
    // Jamais sur la queue : on n'enfonce pas les derniers.
    for (const card of malus) {
      expect(['HASARD', 'DEUX', 'TETE']).toContain(card.cible);
    }
  });

  it('ne sort jamais d’un booster ouvert pour quelqu’un', () => {
    // Ce qu'on ouvre pour soi ne peut pas se retourner contre soi.
    const pourUnJoueur = PACKS.filter((p) => p.portee === 'JOUEUR').map((p) => p.id);
    expect(pourUnJoueur.length).toBeGreaterThan(0);
    for (const card of malus) {
      for (const pack of pourUnJoueur) expect(card.packs).not.toContain(pack);
    }
  });

  it('borne la carte à deux de chaque côté, et la tire toujours au sort', () => {
    // La seule exception assumée : ce que l'un gagne, l'autre le perd. Elle
    // n'est tolérable que parce que personne ne choisit les deux joueurs.
    const paires = CARDS.filter((c) => aDeux(c.effect));
    expect(paires.length).toBeGreaterThan(0);
    for (const card of paires) expect(card.cible).toBe('DEUX');
    // Et une carte à deux ne vise que deux joueurs.
    for (const card of CARDS.filter((c) => c.cible === 'DEUX')) {
      expect(aDeux(card.effect)).toBe(true);
    }
  });
});

describe('cohérence du jeu de cartes', () => {
  it('garde tous les malus hors des communes', () => {
    // Un malus retire des points à quelqu'un : il ne doit pas être la carte
    // la plus fréquente d'un booster, sinon la ligue devient une punition.
    const malus = CARDS.filter((c) => c.nature === 'malus');
    expect(malus.length).toBeGreaterThanOrEqual(4);
    expect(malus.every((c) => c.rarity !== 'C')).toBe(true);
  });

  it('fait monter la puissance affichée avec la rareté', () => {
    let plafondPrecedent = -1;
    for (const rarity of RARITIES) {
      const powers = cardsOfRarity(rarity).map((c) => c.power);
      expect(Math.min(...powers)).toBeGreaterThan(plafondPrecedent);
      plafondPrecedent = Math.max(...powers);
    }
  });

  it('annonce son plafond dans le texte de chaque carte plafonnée', () => {
    // Un joueur doit pouvoir lire la limite sur la carte, pas la découvrir en
    // la jouant.
    const capped = CARDS.filter((c) => 'cap' in c.effect);
    expect(capped.length).toBeGreaterThan(0);
    for (const card of capped) {
      expect(card.description).toMatch(/jusqu’à [+−]?\d+/);
      expect(card.description).toContain(String((card.effect as { cap: number }).cap));
    }
  });

  it('donne à chaque carte un nom et l’intitulé de son action', () => {
    // Le nom est un mot de l'hiver ; l'intitulé est celui de l'action, tel
    // qu'on le disait sur les roues.
    for (const card of CARDS) {
      expect(card.name.trim().length).toBeGreaterThan(2);
      expect(card.subtitle.trim().length).toBeGreaterThan(2);
      expect(card.subtitle).not.toBe(card.name);
    }
    expect(new Set(CARDS.map((c) => c.name)).size).toBe(CARDS.length);
  });

  it('dit « MALUS » sur chaque malus qui retire des points', () => {
    for (const card of CARDS.filter((c) => c.nature === 'malus' && !aDeux(c.effect))) {
      expect(card.description.startsWith('MALUS')).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */

/**
 * La résolution, sur une base synthétique et sans passer par le réseau — un
 * test de bout en bout se ferait rejeter par la limitation de débit avant même
 * d'atteindre la règle qu'on veut prouver.
 */

function joueur(id: string): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes: 0,
    subsOfferts: 0,
    creneauxBonus: 0,
    immuniseJusqua: null,
    sessionsDepuis: null,
    roleManuel: false,
    joinedAt: '2027-01-01T00:00:00.000Z',
    active: true,
    role: 'joueur',
  };
}

function base(...ids: string[]): Database {
  const db = emptyDatabase();
  for (const id of ids) db.players.push(joueur(id));
  return db;
}

let compteur = 0;

/** Une game saisie, score calculé comme le serveur le calcule. */
function game(db: Database, playerId: string, kills: number, placement: Placement = null): Game {
  compteur += 1;
  const g: Game = {
    id: `g${compteur}`,
    playerId,
    kills,
    placement,
    bonusPoints: 0,
    skipped: false,
    score: scoreGame({ kills, placement, bonusPoints: 0 }).total,
    note: null,
    playedAt: `2027-01-15T20:00:${String(compteur % 60).padStart(2, '0')}.000Z`,
    createdAt: '2027-01-15T20:00:00.000Z',
    applied: [],
  };
  db.games.push(g);
  return g;
}

/** Pose une carte sur un joueur. */
function pose(db: Database, joueurId: string, cardId: string, minute: number, paireId: string | null = null) {
  compteur += 1;
  db.cartesEnAttente.push({
    id: `c${compteur}`,
    joueurId,
    cardId,
    ouvertureId: `o${compteur}`,
    creeA: `2027-01-15T19:${String(minute).padStart(2, '0')}:00.000Z`,
    consommeeA: null,
    gameId: null,
    resultat: null,
    paireId,
  });
}

const enAttente = (db: Database, joueurId: string) =>
  db.cartesEnAttente.filter((c) => c.joueurId === joueurId && c.consommeeA === null);

/** La valeur d'une carte à valeur simple, lue dans le catalogue. */
function valeur(cardId: string): number {
  const e = getCard(cardId)!.effect;
  if (!('value' in e)) throw new Error(`${cardId} n’a pas de valeur`);
  return e.value;
}

describe('une seule carte par game', () => {
  it('applique la plus ancienne, et garde les autres pour les games suivantes', () => {
    // Deux cartes empilées sur une même game feraient sauter le budget : il
    // ne vaut que game par game.
    const db = base('a');
    pose(db, 'a', 'poudreuse', 1);
    pose(db, 'a', 'etoile-du-nord', 2);

    const premiere = game(db, 'a', 5);
    const r1 = appliqueCartesEnAttente(db, premiere);
    expect(r1.cartes.map((c) => c.cardId)).toEqual(['poudreuse']);
    expect(premiere.score).toBe(5 + valeur('poudreuse'));
    expect(enAttente(db, 'a')).toHaveLength(1);

    const seconde = game(db, 'a', 5);
    const r2 = appliqueCartesEnAttente(db, seconde);
    expect(r2.cartes.map((c) => c.cardId)).toEqual(['etoile-du-nord']);
    expect(seconde.score).toBe(5 + valeur('etoile-du-nord'));
    expect(enAttente(db, 'a')).toHaveLength(0);
  });

  it('ne fait jamais bouger une game de plus que le budget de la rareté', () => {
    for (const card of CARDS) {
      if (momentDe(card.effect) !== 'PROCHAINE' || card.cible === 'DEUX') continue;
      // Le pire cas de chaque carte : la game la plus haute pour les
      // multiplicateurs, la plus basse pour les jokers et les petites games.
      for (const [kills, placement] of [
        [WORST_CASE_KILLS, 1],
        [0, null],
        [3, 3],
      ] as [number, Placement][]) {
        const db = base('a');
        pose(db, 'a', card.id, 1);
        const g = game(db, 'a', kills, placement);
        const avant = g.score;
        appliqueCartesEnAttente(db, g, { meilleurKills: WORST_CASE_KILLS });
        expect(Math.abs(g.score - avant)).toBeLessThanOrEqual(IMPACT_PAR_RARETE[card.rarity]);
      }
    }
  });

  it('journalise le delta exact dans la game', () => {
    const db = base('a');
    pose(db, 'a', 'percee', 1);
    const g = game(db, 'a', 3);
    appliqueCartesEnAttente(db, g);

    expect(g.applied).toHaveLength(1);
    expect(g.applied[0].cardId).toBe('percee');
    expect(g.applied[0].points).toBe(valeur('percee'));
    expect(g.bonusPoints).toBe(g.applied.reduce((s, a) => s + a.points, 0));
  });

  it('ne touche pas aux cartes des autres', () => {
    const db = base('a', 'b');
    pose(db, 'b', 'poudreuse', 1);
    const g = game(db, 'a', 5);
    expect(appliqueCartesEnAttente(db, g).cartes).toEqual([]);
    expect(g.score).toBe(5);
    expect(enAttente(db, 'b')).toHaveLength(1);
  });

  it('ne pose jamais une seconde carte sur une game qui en porte une', () => {
    // Une carte qui relève une game déjà jouée ne choisit que parmi les games
    // sans carte — même quand la carte d'avant n'a rien changé au score.
    const db = base('a');
    const basse = game(db, 'a', 2);
    const haute = game(db, 'a', 30);
    pose(db, 'a', 'sang-froid', 1);
    // Sang-Froid tombe sur une troisième game, sans Top : aucun point.
    const troisieme = game(db, 'a', 1);
    appliqueCartesEnAttente(db, troisieme);
    expect(troisieme.applied).toHaveLength(0);

    pose(db, 'a', 'redoux', 2);
    regleCartesSansAttendre(db, 'a');
    // La pire game libre qui a marqué est celle à 2, pas celle à 1 qui porte
    // déjà sa carte.
    expect(troisieme.score).toBe(1);
    expect(basse.score).toBe(4);
    expect(haute.score).toBe(30);
  });
});

describe('un malus retire, il ne donne à personne', () => {
  it('ne fait bouger que la game de sa cible', () => {
    const db = base('cible', 'autre');
    const temoin = game(db, 'autre', 10);
    pose(db, 'cible', 'grand-froid', 1);

    const g = game(db, 'cible', 30);
    appliqueCartesEnAttente(db, g);

    expect(g.score).toBe(30 - valeur('grand-froid'));
    expect(temoin.score).toBe(10);
    expect(db.ledger).toHaveLength(0);
  });

  it('attend la prochaine game : une game déjà jouée n’est pas touchée', () => {
    const db = base('cible');
    const jouee = game(db, 'cible', 25);
    pose(db, 'cible', 'grand-froid', 1);
    regleCartesSansAttendre(db, 'cible');
    expect(jouee.score).toBe(25);
    expect(enAttente(db, 'cible')).toHaveLength(1);
  });
});

describe('la carte à deux', () => {
  const cap = (getCard('chasse-croise')!.effect as { cap: number }).cap;

  it('attend la seconde game avant de se régler', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'chasse-croise', 1, 'paire');
    pose(db, 'b', 'chasse-croise', 1, 'paire');

    const ga = game(db, 'a', 4);
    appliqueCartesEnAttente(db, ga);
    expect(ga.score).toBe(4);
    expect(ga.applied).toHaveLength(0);
  });

  it('échange les kills à somme nulle', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'chasse-croise', 1, 'paire');
    pose(db, 'b', 'chasse-croise', 1, 'paire');

    const ga = game(db, 'a', 4);
    appliqueCartesEnAttente(db, ga);
    const gb = game(db, 'b', 11);
    appliqueCartesEnAttente(db, gb);

    // Chacun joue avec les kills de l'autre : 4 et 11 s'échangent.
    expect(ga.score).toBe(11);
    expect(gb.score).toBe(4);
    expect(ga.bonusPoints + gb.bonusPoints).toBe(0);
  });

  it('borne l’échange de chaque côté', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'chasse-croise', 1, 'paire');
    pose(db, 'b', 'chasse-croise', 1, 'paire');

    const ga = game(db, 'a', 0);
    appliqueCartesEnAttente(db, ga);
    const gb = game(db, 'b', WORST_CASE_KILLS);
    appliqueCartesEnAttente(db, gb);

    expect(ga.bonusPoints).toBe(cap);
    expect(gb.bonusPoints).toBe(-cap);
  });

  it('ne bouge rien sur une égalité', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'chasse-croise', 1, 'paire');
    pose(db, 'b', 'chasse-croise', 1, 'paire');
    const ga = game(db, 'a', 9);
    appliqueCartesEnAttente(db, ga);
    const gb = game(db, 'b', 9);
    appliqueCartesEnAttente(db, gb);
    expect(ga.score).toBe(9);
    expect(gb.score).toBe(9);
    expect(enAttente(db, 'a')).toHaveLength(0);
    expect(enAttente(db, 'b')).toHaveLength(0);
  });
});
