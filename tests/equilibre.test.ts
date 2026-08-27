import { describe, expect, it } from 'vitest';
import { CARDS, cardsOfTheme } from '@/lib/domain/catalog';
import { CARD_IMPACT_CAP, GAME_LIMITS, MALUS, PLACEMENT_POINTS } from '@/lib/domain/rules';
import type { CardDefinition, CardEffect } from '@/lib/domain/types';

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
 * Retourne null pour les effets qui ne touchent pas le score : flocons,
 * faveurs, boucliers, gels, silence.
 */
function maxImpact(effect: CardEffect): number | null {
  switch (effect.kind) {
    case 'bonus_points':
      return Math.abs(effect.value);
    case 'points_per_kill':
      return Math.min(effect.cap, WORST_CASE_KILLS * effect.perKill);
    case 'kill_multiplier':
      return Math.min(effect.cap, Math.round(WORST_CASE_KILLS * (effect.value - 1)));
    case 'points_per_kill_above':
      return Math.min(effect.cap, (WORST_CASE_KILLS - effect.threshold) * effect.perKill);
    case 'double_placement':
      // Doubler un Top 1 revient à ajouter une seconde fois ses points.
      return PLACEMENT_POINTS['1'];
    case 'strike_best':
      return effect.points;
    case 'strike_top':
      return effect.points * effect.count;
    case 'cancel_last_boost':
      // Ne peut jamais retirer plus que ce que la carte annulée avait donné,
      // donc au pire le plafond général.
      return CARD_IMPACT_CAP;
    case 'undo_last_malus':
      // Rend exactement ce qui avait été pris, donc borné par le même plafond.
      return CARD_IMPACT_CAP;
    default:
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

    // Une game moyenne vaut ~25 points et une saison ~400 : au-delà de ce
    // plafond, une seule carte volerait une part visible du classement.
    expect(offenders).toEqual([]);
  });

  it('garde le plafond à hauteur d’une bonne game', () => {
    expect(CARD_IMPACT_CAP).toBeGreaterThanOrEqual(15);
    expect(CARD_IMPACT_CAP).toBeLessThanOrEqual(35);
  });

  it('borne tous les multiplicateurs, sans exception', () => {
    for (const card of CARDS) {
      if (card.effect.kind === 'kill_multiplier') {
        expect(card.effect.cap).toBeGreaterThan(0);
        expect(card.effect.cap).toBeLessThanOrEqual(CARD_IMPACT_CAP);
      }
    }
  });
});

describe('les malus ne transfèrent jamais', () => {
  /** Effets qui créditent celui qui joue la carte. */
  const CREDITS_PLAYER = new Set<CardEffect['kind']>([
    'bonus_points',
    'points_per_kill',
    'kill_multiplier',
    'points_per_kill_above',
    'double_placement',
    'snowflakes',
    'boon',
    'snowflakes_and_boon',
    'undo_last_malus',
  ]);

  it('aucun malus n’enrichit son lanceur', () => {
    // C'est la règle la plus importante du jeu : le vol crée un double
    // mouvement — la victime perd ET l'autre gagne — et c'est ce qui rend
    // l'interaction insupportable des deux côtés.
    for (const card of CARDS.filter((c) => c.nature === 'malus')) {
      expect(CREDITS_PLAYER.has(card.effect.kind)).toBe(false);
    }
  });

  it('aucune carte ne copie ni ne vole la game d’un adversaire', () => {
    const kinds = CARDS.map((c) => c.effect.kind);
    expect(kinds).not.toContain('copy_best_game');
    expect(kinds).not.toContain('swap_random_game');
    expect(kinds).not.toContain('steal_points');
  });

  it('aucun malus ne supprime définitivement la game d’autrui', () => {
    for (const card of CARDS.filter((c) => c.nature === 'malus')) {
      expect(card.effect.kind).not.toBe('delete_worst_game');
    }
    // La seule suppression du jeu porte sur SA propre pire game.
    const eraser = CARDS.find((c) => c.effect.kind === 'delete_worst_game');
    expect(eraser?.target).toBe('own_worst_game');
    expect(eraser?.nature).toBe('bonus');
  });

  it('tout malus vise explicitement un adversaire', () => {
    for (const card of CARDS.filter((c) => c.nature === 'malus')) {
      expect(card.target).toBe('opponent');
      expect(card.offensive).toBe(true);
    }
  });
});

describe('protection contre l’acharnement', () => {
  it('plafonne ce qu’une cible encaisse par jour', () => {
    // Sans ce plafond, sept joueurs pourraient enchaîner sept malus sur le
    // leader le même soir, et mener deviendrait une punition.
    expect(MALUS.maxReceivedPerDay).toBeGreaterThanOrEqual(1);
    expect(MALUS.maxReceivedPerDay).toBeLessThanOrEqual(3);
  });

  it('limite les dégâts journaliers cumulés à moins de deux bonnes games', () => {
    const worstMalus = Math.max(
      ...CARDS.filter((c) => c.nature === 'malus').map((c) => maxImpact(c.effect) ?? 0),
    );
    expect(worstMalus * MALUS.maxReceivedPerDay).toBeLessThanOrEqual(CARD_IMPACT_CAP * 2);
  });

  it('laisse une fenêtre d’annulation au moins aussi large que le quota', () => {
    // Second Souffle doit pouvoir répondre : sa fenêtre couvre la journée
    // pendant laquelle les malus tombent.
    expect(MALUS.undoWindowHours).toBeGreaterThanOrEqual(24);
  });

  it('offre un contre-jeu à chaque malus', () => {
    const kinds = CARDS.map((c) => c.effect.kind);
    // Bouclier, gel, et annulation : trois réponses distinctes.
    expect(kinds).toContain('shield');
    expect(kinds).toContain('freeze_game');
    expect(kinds).toContain('undo_last_malus');
  });
});

describe('cohérence des familles', () => {
  it('donne à chaque famille un rôle distinct', () => {
    const kindsOf = (theme: Parameters<typeof cardsOfTheme>[0]) =>
      cardsOfTheme(theme).map((c) => c.effect.kind);

    // Aurore est purement économique : aucune de ses cartes ne touche au score.
    const SCORE_KINDS = new Set<CardEffect['kind']>([
      'bonus_points',
      'points_per_kill',
      'kill_multiplier',
      'points_per_kill_above',
      'double_placement',
      'strike_best',
      'strike_top',
      'cancel_last_boost',
    ]);
    for (const kind of kindsOf('aurore')) {
      expect(SCORE_KINDS.has(kind)).toBe(false);
    }

    // Solstice porte tous les malus du jeu, et elle seule.
    const malus = CARDS.filter((c) => c.nature === 'malus');
    expect(malus.every((c) => c.theme === 'solstice')).toBe(true);
    expect(malus.length).toBeGreaterThanOrEqual(4);
  });

  it('fait monter la puissance affichée avec la rareté', () => {
    for (const theme of ['glace', 'tempete', 'aurore', 'solstice'] as const) {
      const powers = cardsOfTheme(theme).map((c) => c.power);
      expect(powers).toEqual([...powers].sort((a, b) => a - b));
    }
  });

  it('annonce son plafond dans le texte de chaque carte plafonnée', () => {
    // Un joueur doit pouvoir lire la limite sur la carte, pas la découvrir en
    // la jouant.
    const capped = CARDS.filter(
      (c): c is CardDefinition =>
        c.effect.kind === 'points_per_kill' ||
        c.effect.kind === 'kill_multiplier' ||
        c.effect.kind === 'points_per_kill_above',
    );
    expect(capped.length).toBeGreaterThan(0);
    for (const card of capped) {
      expect(card.description).toMatch(/jusqu’à \+\d+/);
    }
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Le quota journalier est la protection la plus importante du jeu : c'est elle
 * qui empêche sept joueurs d'enchaîner sept malus sur le leader le même soir.
 * On la vérifie ici sur une base synthétique, sans passer par le réseau — un
 * test de bout en bout se ferait rejeter par la limitation de débit avant même
 * d'atteindre la règle qu'on veut prouver.
 */
describe('quota journalier de malus', () => {
  const HOUR = 60 * 60 * 1000;
  const now = new Date('2027-01-15T20:00:00.000Z');

  /** Base minimale : uniquement les copies de cartes consommées. */
  function dbWith(hits: { targetId: string; hoursAgo: number }[]) {
    return {
      cards: hits.map((hit, i) => ({
        id: `c${i}`,
        playerId: `attaquant-${i}`,
        cardId: 'givre-mordant',
        obtainedAt: now.toISOString(),
        source: 'BOOSTER' as const,
        consumed: true,
        consumedAt: new Date(now.getTime() - hit.hoursAgo * HOUR).toISOString(),
        consumedOnGameId: null,
        consumedOnPlayerId: hit.targetId,
        listingId: null,
        consumeKey: null,
      })),
    };
  }

  it('compte les malus de tous les attaquants, pas d’un seul', async () => {
    const { malusReceivedToday } = await import('@/lib/services/effects');
    const db = dbWith([
      { targetId: 'cible', hoursAgo: 1 },
      { targetId: 'cible', hoursAgo: 3 },
      { targetId: 'autre', hoursAgo: 2 },
    ]);

    // Trois attaquants distincts, deux sur la même cible.
    expect(malusReceivedToday(db as never, 'cible', now)).toBe(2);
    expect(malusReceivedToday(db as never, 'autre', now)).toBe(1);
  });

  it('oublie les malus de plus de 24 heures', async () => {
    const { malusReceivedToday } = await import('@/lib/services/effects');
    const db = dbWith([
      { targetId: 'cible', hoursAgo: 2 },
      { targetId: 'cible', hoursAgo: 25 },
      { targetId: 'cible', hoursAgo: 48 },
    ]);

    expect(malusReceivedToday(db as never, 'cible', now)).toBe(1);
  });

  it('atteint le plafond exactement au nombre annoncé', async () => {
    const { malusReceivedToday } = await import('@/lib/services/effects');
    const hits = Array.from({ length: MALUS.maxReceivedPerDay }, (_, i) => ({
      targetId: 'cible',
      hoursAgo: i + 1,
    }));

    expect(malusReceivedToday(dbWith(hits) as never, 'cible', now)).toBe(MALUS.maxReceivedPerDay);
  });
});
