import { describe, expect, it } from 'vitest';
import type { Database, Game, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { CARDS, cardsOfRarity, getCard, PACKS } from '@/lib/domain/catalog';
import { CARD_IMPACT_CAP, GAME_LIMITS, PLACEMENT_POINTS } from '@/lib/domain/rules';
import { scoreGame } from '@/lib/domain/scoring';
import type { CardEffect, Placement } from '@/lib/domain/types';
import { appliqueCartesEnAttente } from '@/lib/services/effects';

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

/**
 * Impact maximal d'une carte en points, tous cas de figure confondus.
 *
 * Retourne null pour les effets qui ne touchent pas le score : les flocons.
 */
function maxImpact(effect: CardEffect): number | null {
  switch (effect.kind) {
    case 'bonus_points':
      return Math.abs(effect.value);
    case 'points_per_kill':
      return Math.min(effect.cap, WORST_CASE_KILLS * effect.perKill);
    case 'kill_multiplier':
      return Math.min(effect.cap, Math.round(WORST_CASE_KILLS * (effect.value - 1)));
    case 'double_placement':
      // Doubler un Top 1 revient à ajouter une seconde fois ses points.
      return PLACEMENT_POINTS['1'];
    case 'plancher':
      // Au pire la game vaut zéro, et la carte la remonte de tout le plancher.
      return effect.value;
    case 'malus_points':
      return effect.value;
    case 'echange_kills':
      return effect.cap;
    case 'duel':
      return Math.max(effect.gain, effect.perte);
    case 'snowflakes':
    case 'flocons_doubles':
      return null;
  }
}

describe('plafond d’impact', () => {
  it('aucune carte ne dépasse le plafond, même au pire cas', () => {
    const offenders: string[] = [];

    for (const card of CARDS) {
      const impact = maxImpact(card.effect);
      if (impact !== null && impact > CARD_IMPACT_CAP) {
        offenders.push(`${card.name} (${impact} pts)`);
      }
    }

    // Une game moyenne vaut ~25 points : au-delà de ce plafond, une seule
    // carte volerait une part visible du classement.
    expect(offenders).toEqual([]);
  });

  it('garde le plafond à hauteur d’une bonne game', () => {
    expect(CARD_IMPACT_CAP).toBeGreaterThanOrEqual(15);
    expect(CARD_IMPACT_CAP).toBeLessThanOrEqual(35);
  });

  it('borne tous les multiplicateurs, sans exception', () => {
    for (const card of CARDS) {
      if (card.effect.kind === 'kill_multiplier' || card.effect.kind === 'points_per_kill') {
        expect(card.effect.cap).toBeGreaterThan(0);
        expect(card.effect.cap).toBeLessThanOrEqual(CARD_IMPACT_CAP);
      }
    }
  });
});

describe('les malus ne transfèrent jamais', () => {
  const malus = CARDS.filter((c) => c.nature === 'malus');
  const aDeux = (effect: CardEffect) => effect.kind === 'echange_kills' || effect.kind === 'duel';

  it('un malus ordinaire ne fait que retirer des points', () => {
    // C'est la règle la plus importante du jeu : le vol crée un double
    // mouvement — la victime perd ET l'autre gagne — et c'est ce qui rend
    // l'interaction insupportable des deux côtés.
    for (const card of malus.filter((c) => !aDeux(c.effect))) {
      expect(card.effect.kind).toBe('malus_points');
    }
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

  it('borne les cartes à deux de chaque côté, et les tire toujours au sort', () => {
    // La seule exception assumée : ce que l'un gagne, l'autre le perd. Elle
    // n'est tolérable que parce que personne ne choisit les deux joueurs.
    const paires = CARDS.filter((c) => aDeux(c.effect));
    expect(paires.length).toBeGreaterThan(0);
    for (const card of paires) {
      expect(card.cible).toBe('DEUX');
      if (card.effect.kind === 'duel') {
        expect(card.effect.gain).toBeLessThanOrEqual(CARD_IMPACT_CAP);
        expect(card.effect.perte).toBeLessThanOrEqual(CARD_IMPACT_CAP);
      }
      if (card.effect.kind === 'echange_kills') {
        expect(card.effect.cap).toBeLessThanOrEqual(CARD_IMPACT_CAP);
      }
    }
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
    for (const rarity of ['C', 'PC', 'R', 'SR', 'UR', 'L'] as const) {
      const powers = cardsOfRarity(rarity).map((c) => c.power);
      expect(Math.min(...powers)).toBeGreaterThan(plafondPrecedent);
      plafondPrecedent = Math.max(...powers);
    }
  });

  it('annonce son plafond dans le texte de chaque carte plafonnée', () => {
    // Un joueur doit pouvoir lire la limite sur la carte, pas la découvrir en
    // la jouant.
    const capped = CARDS.filter(
      (c) => c.effect.kind === 'points_per_kill' || c.effect.kind === 'kill_multiplier',
    );
    expect(capped.length).toBeGreaterThan(0);
    for (const card of capped) {
      expect(card.description).toMatch(/jusqu’à \+\d+/);
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
    playedAt: '2027-01-15T20:00:00.000Z',
    createdAt: '2027-01-15T20:00:00.000Z',
    applied: [],
  };
  db.games.push(g);
  return g;
}

/** Pose une carte sur la prochaine game d'un joueur. */
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

describe('une seule carte par game', () => {
  it('applique la plus ancienne, et garde les autres pour les games suivantes', () => {
    // Deux cartes empilées sur une même game feraient sauter le plafond
    // d'impact : il ne vaut que game par game.
    const db = base('a');
    pose(db, 'a', 'poudreuse', 1);
    pose(db, 'a', 'etoile-du-nord', 2);

    const premiere = game(db, 'a', 5);
    const r1 = appliqueCartesEnAttente(db, premiere);
    expect(r1.cartes.map((c) => c.cardId)).toEqual(['poudreuse']);
    expect(premiere.score).toBe(5 + 12);
    expect(enAttente(db, 'a')).toHaveLength(1);

    const seconde = game(db, 'a', 5);
    const r2 = appliqueCartesEnAttente(db, seconde);
    expect(r2.cartes.map((c) => c.cardId)).toEqual(['etoile-du-nord']);
    expect(seconde.score).toBe(5 + 25);
    expect(enAttente(db, 'a')).toHaveLength(0);
  });

  it('ne fait jamais bouger une game de plus que le plafond', () => {
    for (const card of CARDS) {
      if (card.cible === 'DEUX') continue;
      const db = base('a');
      pose(db, 'a', card.id, 1);
      const g = game(db, 'a', WORST_CASE_KILLS, 1);
      const avant = g.score;
      appliqueCartesEnAttente(db, g);
      expect(Math.abs(g.score - avant)).toBeLessThanOrEqual(CARD_IMPACT_CAP);
    }
  });

  it('journalise le delta exact dans la game', () => {
    const db = base('a');
    pose(db, 'a', 'percee', 1);
    const g = game(db, 'a', 3);
    appliqueCartesEnAttente(db, g);

    expect(g.applied).toHaveLength(1);
    expect(g.applied[0].cardId).toBe('percee');
    expect(g.applied[0].points).toBe(6);
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
});

describe('un malus retire, il ne donne à personne', () => {
  it('ne fait bouger que la game de sa cible', () => {
    const effet = getCard('grand-froid')!.effect;
    if (effet.kind !== 'malus_points') throw new Error('Grand Froid n’est plus un malus de points');

    const db = base('cible', 'autre');
    const temoin = game(db, 'autre', 10);
    pose(db, 'cible', 'grand-froid', 1);

    const g = game(db, 'cible', 30);
    appliqueCartesEnAttente(db, g);

    expect(g.score).toBe(30 - effet.value);
    expect(temoin.score).toBe(10);
    expect(db.ledger).toHaveLength(0);
  });
});

describe('les cartes à deux', () => {
  it('attendent la seconde game avant de se régler', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'chasse-croise', 1, 'paire');
    pose(db, 'b', 'chasse-croise', 1, 'paire');

    const ga = game(db, 'a', 4);
    appliqueCartesEnAttente(db, ga);
    expect(ga.score).toBe(4);
    expect(ga.applied).toHaveLength(0);
  });

  it('échangent les kills à somme nulle', () => {
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

  it('bornent l’échange de chaque côté', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'chasse-croise', 1, 'paire');
    pose(db, 'b', 'chasse-croise', 1, 'paire');

    const ga = game(db, 'a', 0);
    appliqueCartesEnAttente(db, ga);
    const gb = game(db, 'b', WORST_CASE_KILLS);
    appliqueCartesEnAttente(db, gb);

    expect(ga.bonusPoints).toBe(CARD_IMPACT_CAP);
    expect(gb.bonusPoints).toBe(-CARD_IMPACT_CAP);
  });

  it('donnent le duel à la meilleure game, et rien sur une égalité', () => {
    const duel = getCard('duel-de-glace')!.effect;
    if (duel.kind !== 'duel') throw new Error('Duel de Glace n’est plus un duel');

    const db = base('a', 'b');
    pose(db, 'a', 'duel-de-glace', 1, 'paire');
    pose(db, 'b', 'duel-de-glace', 1, 'paire');
    const ga = game(db, 'a', 12);
    appliqueCartesEnAttente(db, ga);
    const gb = game(db, 'b', 7);
    appliqueCartesEnAttente(db, gb);
    expect(ga.score).toBe(12 + duel.gain);
    expect(gb.score).toBe(7 - duel.perte);

    const nul = base('a', 'b');
    pose(nul, 'a', 'duel-de-glace', 1, 'paire');
    pose(nul, 'b', 'duel-de-glace', 1, 'paire');
    const na = game(nul, 'a', 9);
    appliqueCartesEnAttente(nul, na);
    const nb = game(nul, 'b', 9);
    appliqueCartesEnAttente(nul, nb);
    expect(na.score).toBe(9);
    expect(nb.score).toBe(9);
  });
});
