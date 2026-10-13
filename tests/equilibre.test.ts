import { describe, expect, it, vi } from 'vitest';
import type { Database, Game, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { CARDS, cardsOfRarity, getCard, impactMax, momentDe, PACKS } from '@/lib/domain/catalog';
import { GAME_LIMITS } from '@/lib/domain/rules';
import { scoreGame } from '@/lib/domain/scoring';
import { RARITIES, type CardEffect, type Placement } from '@/lib/domain/types';
import {
  appliqueCartesEnAttente,
  gamesSansCarte,
  jokerDe,
  regleCartesSansAttendre,
  utiliseJoker,
} from '@/lib/services/effects';

// Le catalogue n'a plus qu'une carte par rareté : les cartes retirées restent
// trouvables par `getCard`, pour exercer chaque genre d'effet.
vi.mock('@/lib/domain/catalog', async (vrai) =>
  (await import('./stubs/cartes-retirees')).avecCartesRetirees(await vrai()),
);

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

describe('les cartes sans plafond de points', () => {
  it('la Game ×2 double kills et top, quelle que soit la game', () => {
    for (const [kills, placement] of [
      [GAME_LIMITS.maxKills, 1],
      [12, 2],
      [0, null],
    ] as [number, Placement][]) {
      const db = base('a');
      pose(db, 'a', 'ouragan-blanc', 1);
      const g = game(db, 'a', kills, placement);
      const avant = g.score;
      appliqueCartesEnAttente(db, g);
      expect(g.score).toBe(avant * 2);
    }
  });

  it('les cartes plafonnées ont un plafond positif', () => {
    for (const card of CARDS) {
      const e = card.effect;
      if ('cap' in e && e.cap !== undefined) expect(e.cap).toBeGreaterThan(0);
    }
  });
});

describe('les communes qui se méritent', () => {
  it('le Bonhomme de Neige donne 2 points par tranche de 5 kills, jusqu’à 6', () => {
    for (const [kills, bonus] of [
      [4, 0],
      [5, 2],
      [12, 4],
      [17, 6],
      [25, 6],
    ] as const) {
      const db = base('a');
      pose(db, 'a', 'bonhomme-de-neige', 1);
      const g = game(db, 'a', kills);
      appliqueCartesEnAttente(db, g);
      expect(g.score).toBe(kills + bonus);
    }
  });

  it('la Luge ne donne ses 15 points que sur un Top 1', () => {
    const db = base('a', 'b');
    pose(db, 'a', 'luge', 1);
    pose(db, 'b', 'luge', 1);
    const top1 = game(db, 'a', 3, 1);
    const top2 = game(db, 'b', 3, 2);
    appliqueCartesEnAttente(db, top1);
    appliqueCartesEnAttente(db, top2);
    expect(top1.score).toBe(3 + 20 + 15);
    expect(top2.score).toBe(3 + 15);
  });
});

describe('Écho Lointain', () => {
  it('compte la game avec les kills du meilleur tueur de la partie, sans plafond', () => {
    const db = base('a');
    pose(db, 'a', 'echo-lointain', 1);
    const g = game(db, 'a', 3, 2);
    appliqueCartesEnAttente(db, g, { meilleurKills: 17 });
    // Ses kills deviennent ceux du meilleur : 17 kills, plus le Top 2.
    expect(g.kills).toBe(17);
    expect(g.bonusPoints).toBe(0);
    expect(g.score).toBe(17 + 15);
  });

  it('donne +10 points si le joueur est lui-même le meilleur tueur', () => {
    const db = base('a');
    pose(db, 'a', 'echo-lointain', 1);
    const g = game(db, 'a', 12);
    const r = appliqueCartesEnAttente(db, g, { meilleurKills: 12 });
    expect(g.score).toBe(12 + 10);
    expect(r.cartes[0].resultat).toMatch(/meilleur tueur de la partie lui-même/);
    expect(enAttente(db, 'a')).toHaveLength(0);
  });
});

describe('le Joker', () => {
  it('se garde : ni une ouverture ni une game ne le consomment', () => {
    const db = base('a');
    pose(db, 'a', 'joker-givre', 1);
    regleCartesSansAttendre(db, 'a');
    const g = game(db, 'a', 7, 2);
    const r = appliqueCartesEnAttente(db, g);
    regleCartesSansAttendre(db, 'a');
    expect(r.cartes).toHaveLength(0);
    expect(g.score).toBe(7 + 15);
    expect(jokerDe(db, 'a')?.cardId).toBe('joker-givre');
  });

  it('un seul à la fois : un second, tiré pendant qu’il en garde un, ne fait rien', () => {
    const db = base('a');
    pose(db, 'a', 'joker-givre', 1);
    pose(db, 'a', 'joker-givre', 2);
    regleCartesSansAttendre(db, 'a');
    const jokers = db.cartesEnAttente.filter((c) => c.cardId === 'joker-givre');
    expect(jokers[0].consommeeA).toBeNull();
    expect(jokers[1].consommeeA).not.toBeNull();
    expect(jokers[1].resultat).toMatch(/déjà un Joker/);
    // Une fois le premier joué, on peut en retirer un.
    utiliseJoker(db, game(db, 'a', 3));
    expect(jokerDe(db, 'a')).toBeNull();
    pose(db, 'a', 'joker-givre', 3);
    regleCartesSansAttendre(db, 'a');
    expect(jokerDe(db, 'a')).not.toBeNull();
  });

  it('joué, il se pose sur la game et laisse la carte active pour la suivante', () => {
    const db = base('a');
    pose(db, 'a', 'joker-givre', 1);
    pose(db, 'a', 'percee', 2);
    const annulee = game(db, 'a', 2);
    annulee.skipped = true;
    const joue = utiliseJoker(db, annulee);
    expect(joue?.gameId).toBe(annulee.id);
    expect(jokerDe(db, 'a')).toBeNull();
    expect(enAttente(db, 'a').map((c) => c.cardId)).toEqual(['percee']);
    const suivante = game(db, 'a', 5);
    appliqueCartesEnAttente(db, suivante);
    expect(suivante.score).toBe(5 + 8);
  });

  it('sans Joker, rien à jouer', () => {
    const db = base('a');
    expect(utiliseJoker(db, game(db, 'a', 4))).toBeNull();
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
    // La règle vaut pour toute carte à deux du catalogue, s'il en a.
    const paires = CARDS.filter((c) => aDeux(c.effect));
    for (const card of paires) expect(card.cible).toBe('DEUX');
    // Et une carte à deux ne vise que deux joueurs.
    for (const card of CARDS.filter((c) => c.cible === 'DEUX')) {
      expect(aDeux(card.effect)).toBe(true);
    }
  });
});

describe('la game figée', () => {
  it('fige la meilleure game libre, tout de suite, sans en changer le score', () => {
    const db = base('a');
    const petite = game(db, 'a', 4);
    const grosse = game(db, 'a', 15, 1);
    pose(db, 'a', 'permafrost', 1);
    regleCartesSansAttendre(db, 'a');
    expect(enAttente(db, 'a')).toHaveLength(0);
    const figee = db.cartesEnAttente.find((c) => c.cardId === 'permafrost')!;
    expect(figee.gameId).toBe(grosse.id);
    expect(grosse.score).toBe(15 + 20);
    // Plus aucune carte ne peut la toucher : elle n'est plus libre.
    expect(gamesSansCarte(db, 'a').map((g) => g.id)).toEqual([petite.id]);
  });

  it('passe à la deuxième meilleure si la meilleure est figée, puis à la troisième', () => {
    const db = base('a');
    const g1 = game(db, 'a', 20);
    const g2 = game(db, 'a', 12);
    const g3 = game(db, 'a', 6);
    for (let minute = 1; minute <= 3; minute += 1) pose(db, 'a', 'permafrost', minute);
    regleCartesSansAttendre(db, 'a');
    const figees = db.cartesEnAttente.filter((c) => c.cardId === 'permafrost').map((c) => c.gameId);
    expect(figees).toEqual([g1.id, g2.id, g3.id]);
  });

  it('attend une game jouée avant de se poser', () => {
    const db = base('a');
    pose(db, 'a', 'permafrost', 1);
    regleCartesSansAttendre(db, 'a');
    expect(enAttente(db, 'a')).toHaveLength(1);
  });
});

describe('cohérence du jeu de cartes', () => {
  it('garde tous les malus hors des communes', () => {
    // Un malus retire des points à quelqu'un : il ne doit pas être la carte
    // la plus fréquente d'un booster, sinon la ligue devient une punition.
    const malus = CARDS.filter((c) => c.nature === 'malus');
    expect(malus.every((c) => c.rarity !== 'C')).toBe(true);
  });

  it('fait monter la puissance avec la rareté', () => {
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
    // La règle vaut pour toute carte plafonnée du catalogue, s'il en a.
    const capped = CARDS.filter((c) => 'cap' in c.effect);
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

  it('ne fait jamais sortir une game de ses bornes', () => {
    for (const card of CARDS) {
      if (momentDe(card.effect) !== 'PROCHAINE' || card.cible === 'DEUX') continue;
      for (const [kills, placement] of [
        [WORST_CASE_KILLS, 1],
        [0, null],
        [3, 3],
      ] as [number, Placement][]) {
        const db = base('a');
        pose(db, 'a', card.id, 1);
        const g = game(db, 'a', kills, placement);
        appliqueCartesEnAttente(db, g, { meilleurKills: WORST_CASE_KILLS });
        expect(g.bonusPoints).toBeLessThanOrEqual(GAME_LIMITS.maxBonusPoints);
        expect(g.bonusPoints).toBeGreaterThanOrEqual(GAME_LIMITS.minBonusPoints);
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
