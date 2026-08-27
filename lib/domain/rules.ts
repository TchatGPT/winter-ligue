/**
 * Constantes de la saison. Un seul endroit à toucher pour rééquilibrer la ligue.
 *
 * Ces valeurs ne sont jamais lues depuis le client : elles sont importées par
 * les routes serveur et par le rendu, mais un navigateur qui les modifie ne
 * modifie que son propre affichage.
 */

import type { Placement, Rarity } from './types';

export const SEASON = {
  name: 'Winter Ligue',
  edition: 'Saison 1',
  /** Bornes indicatives affichées dans l'entête. */
  startsAt: '2026-12-01T00:00:00.000Z',
  endsAt: '2027-03-01T00:00:00.000Z',
  /** Nombre de joueurs qualifiés pour la finale. */
  finalistCount: 6,
} as const;

/* ------------------------------- Scoring -------------------------------- */

/** Points fixes accordés au classement de fin de partie. */
export const PLACEMENT_POINTS: Record<'1' | '2' | '3', number> = {
  '1': 20,
  '2': 15,
  '3': 8,
};

export function placementPoints(placement: Placement): number {
  if (placement === null) return 0;
  return PLACEMENT_POINTS[String(placement) as '1' | '2' | '3'] ?? 0;
}

/** Bornes de saisie d'une game. Toute valeur hors bornes est rejetée. */
export const GAME_LIMITS = {
  minKills: 0,
  maxKills: 60,
  /**
   * Bornes du cumul de bonus sur une seule game. Large, mais pas infini : une
   * game ne doit jamais peser plus que quelques bonnes parties réunies.
   */
  minBonusPoints: -80,
  maxBonusPoints: 80,
} as const;

/** Nombre de games comptabilisées par joueur, ajustable par l'admin. */
export const DEFAULT_MAX_GAMES_PER_PLAYER = 25;

/* ------------------------------- Économie ------------------------------- */

/**
 * Les flocons ont deux sources, et c'est volontaire :
 *
 *   1. **Le jeu** — kills et placements. C'est la seule source qui crée un
 *      écart *entre* joueurs. Un bon joueur est plus riche qu'un mauvais.
 *   2. **Les subs Twitch** — versés à *tous* les joueurs actifs à parts égales
 *      (voir SUBS plus bas). Le chat fait grossir l'économie entière, sans
 *      jamais faire monter quelqu'un en particulier.
 *
 * C'est cette séparation qui empêche le pay-to-win. Si les subs créditaient le
 * compte d'un joueur nommé, celui qui a la communauté la plus généreuse
 * achèterait ses cartes — et le classement suivrait le portefeuille du chat
 * plutôt que le niveau de jeu.
 */
export const ECONOMY = {
  /** Flocons gagnés par kill. La récompense de base du skill. */
  perKill: 25,
  /** Flocons gagnés selon le placement. Un Top 1 vaut environ 16 kills. */
  perPlacement: { '1': 400, '2': 250, '3': 120 } as Record<'1' | '2' | '3', number>,
  /** Flocons gagnés simplement en enregistrant une game. */
  participation: 150,
  /** Dotation de départ à l'inscription : de quoi ouvrir deux Givre. */
  welcomeGrant: 400,
} as const;

/* --------------------------- Subs Twitch --------------------------------- */

export type SubRewardKind = 'FLOCONS' | 'BOOSTER';

export interface SubMilestone {
  /** Tous les N subs cumulés de la saison. */
  every: number;
  kind: SubRewardKind;
  /** Flocons versés à chaque joueur actif, ou identifiant du booster offert. */
  amount?: number;
  boosterId?: string;
  label: string;
  description: string;
}

/**
 * Paliers de subs. Chaque palier se déclenche à *chaque* multiple atteint, et
 * la récompense va à **tous les joueurs actifs**, pas au gifteur ni à un joueur
 * désigné.
 *
 * Ordre de grandeur visé sur une saison d'environ 900 subs :
 *   — le jeu rapporte ~12 000 ❄ à un joueur régulier (25 games) ;
 *   — les subs en versent ~11 000 ❄ à chacun, plus une dizaine de boosters.
 * Les deux sources pèsent donc à peu près pareil en volume, mais une seule
 * décide du classement.
 */
export const SUB_MILESTONES: readonly SubMilestone[] = [
  {
    every: 5,
    kind: 'FLOCONS',
    amount: 40,
    label: 'Bourrasque',
    description: '40 flocons pour chaque joueur actif.',
  },
  {
    every: 25,
    kind: 'FLOCONS',
    amount: 200,
    label: 'Rafale',
    description: '200 flocons de plus pour tout le monde.',
  },
  {
    every: 100,
    kind: 'BOOSTER',
    boosterId: 'givre',
    label: 'Chute de Neige',
    description: 'Un booster Givre offert à chaque joueur actif.',
  },
  {
    every: 500,
    kind: 'BOOSTER',
    boosterId: 'aurore',
    label: 'Grand Nord',
    description: 'Un booster Aurore offert à chaque joueur actif.',
  },
];

export const SUBS = {
  milestones: SUB_MILESTONES,
  /**
   * Un gifteur peut nommer un joueur à partir de ce nombre de subs. Le joueur
   * désigné reçoit une **carte commune au hasard**, jamais des flocons : le
   * geste est visible à l'antenne, mais sa valeur compétitive est proche de
   * zéro. C'est le compromis entre l'engagement du chat et l'équité.
   */
  giftThreshold: 5,
  /** Cartes offertes maximum par joueur et par jour, pour qu'aucun whale ne cumule. */
  maxGiftedCardsPerDay: 6,
  /** Incréments proposés dans le panneau de modération. */
  adminSteps: [1, 5, 10, 25, 50, 100] as const,
} as const;

/** Prochain palier atteint pour chaque type, à partir d'un total de subs. */
export function nextMilestone(
  totalSubs: number,
): { milestone: SubMilestone; remaining: number; progress: number } | null {
  let best: { milestone: SubMilestone; remaining: number; progress: number } | null = null;
  for (const milestone of SUB_MILESTONES) {
    const remaining = milestone.every - (totalSubs % milestone.every);
    const progress = (milestone.every - remaining) / milestone.every;
    if (!best || remaining < best.remaining) best = { milestone, remaining, progress };
  }
  return best;
}

/**
 * Paliers franchis en passant de `from` à `to` subs. Retourne une entrée par
 * franchissement — passer de 0 à 12 déclenche donc deux Bourrasques.
 */
export function crossedMilestones(from: number, to: number): SubMilestone[] {
  const crossed: SubMilestone[] = [];
  for (const milestone of SUB_MILESTONES) {
    const before = Math.floor(from / milestone.every);
    const after = Math.floor(to / milestone.every);
    for (let i = 0; i < after - before; i += 1) crossed.push(milestone);
  }
  return crossed;
}

/* ----------------------------- Raretés et taux --------------------------- */

/** Ordre d'affichage et de comparaison des raretés. */
export const RARITY_ORDER: Record<Rarity, number> = {
  C: 0,
  PC: 1,
  R: 2,
  SR: 3,
  UR: 4,
  L: 5,
};

/**
 * LA table des taux. C'est ici, et nulle part ailleurs, qu'on règle la rareté.
 *
 * Les poids sont exprimés **sur 100 000** plutôt qu'en pourcentages : on peut
 * ainsi descendre au millième de pour cent sans jamais manipuler de flottant,
 * et la somme se vérifie exactement (un test échoue si elle ne fait pas
 * 100 000).
 *
 * Le raisonnement derrière ces valeurs, pour un booster de 5 cartes :
 *
 *   Rareté        par carte    au moins une par booster
 *   Commune         73 %       —
 *   Peu commune     20 %       —
 *   Rare            5,7 %      1 booster sur 4
 *   Super rare      1 %        1 booster sur 20
 *   Ultra rare      0,28 %     1 booster sur 72
 *   Légendaire      0,02 %     1 booster sur 1 000
 *
 * La légendaire reste un événement de saison, mais un événement qui arrive
 * réellement. Descendre à 0,01 % la rendrait invisible : à 5 cartes par
 * booster, il faudrait 2 000 ouvertures pour en voir une, et plus personne
 * n'y croirait. Et comme elle est revendable, celui qui ne la tire pas peut
 * toujours l'acheter — c'est ce qui fait vivre l'hôtel des ventes.
 */
export const RARITY_WEIGHTS_BASE: Record<Rarity, number> = {
  C: 73_000, // 73 %
  PC: 20_000, // 20 %
  R: 5_700, // 5,7 %
  SR: 1_000, // 1 %
  UR: 280, // 0,28 %
  L: 20, // 0,02 %
};

/** Total attendu de n'importe quelle table de poids. */
export const WEIGHT_TOTAL = 100_000;

/** Probabilité d'une rareté, en pourcentage, pour l'affichage. */
export function rarityPercent(weights: Record<Rarity, number>, rarity: Rarity): number {
  return (weights[rarity] / WEIGHT_TOTAL) * 100;
}

/** Probabilité d'obtenir au moins une carte de cette rareté dans un booster. */
export function atLeastOnePercent(
  weights: Record<Rarity, number>,
  rarity: Rarity,
  cardCount: number,
): number {
  const p = weights[rarity] / WEIGHT_TOTAL;
  return (1 - Math.pow(1 - p, cardCount)) * 100;
}

/* --------------------------- Cartes et collection ------------------------ */

/**
 * Taille de la réserve : le nombre de copies qu'un joueur peut détenir en même
 * temps, avant bonus de collection.
 *
 * Cette limite n'est pas décorative, elle est appliquée à l'ouverture d'un
 * booster. Son rôle est économique : sans plafond, les cartes s'accumulent et
 * l'hôtel des ventes se vide. En obligeant à jouer ou à revendre le surplus,
 * on garde le marché alimenté.
 *
 * Une carte gagnée aux enchères, elle, arrive toujours — on ne fait pas perdre
 * une vente remportée pour une question de place.
 */
export const BASE_RESERVE_SLOTS = 40;

/**
 * Encadrement des malus.
 *
 * Le ciblage reste libre — n'importe qui peut viser n'importe qui — mais deux
 * garde-fous évitent l'acharnement :
 *
 *   — `cooldownHours` empêche un même joueur de frapper deux fois la même
 *     cible dans la journée ;
 *   — `maxReceivedPerDay` plafonne ce qu'une cible encaisse **toutes sources
 *     confondues**. Sans ce second plafond, sept joueurs pourraient enchaîner
 *     sept malus sur le leader le même soir, et mener deviendrait une punition.
 */
export const MALUS = {
  cooldownHours: 6,
  maxReceivedPerDay: 2,
  /** Fenêtre d'annulation par Second Souffle. */
  undoWindowHours: 24,
} as const;

/** Conservé pour la lisibilité des messages. */
export const MALUS_COOLDOWN_HOURS = MALUS.cooldownHours;

/**
 * Plafond d'impact d'une carte, en points.
 *
 * Une game moyenne vaut environ 25 points et une saison en totalise ~400. Une
 * carte au-delà de ce plafond volerait une part visible du classement en un
 * clic — c'est exactement ce qui rendait certaines roues de la Summer Ligue
 * insupportables. Un test vérifie qu'aucune carte ne le dépasse.
 */
export const CARD_IMPACT_CAP = 25;

/** Nombre de cartes par famille. */
export const CARDS_PER_THEME = 6;

/**
 * Paliers de collection. Exiger les 6 cartes pour le moindre bonus rendrait
 * celui-ci inaccessible — la légendaire de la famille sort une fois sur mille.
 * Un palier intermédiaire à 4 cartes garde l'objectif atteignable, et réserve
 * la version pleine à ceux qui vont au bout.
 */
export const SET_TIERS = { partial: 4, full: CARDS_PER_THEME } as const;

/* --------------------------- Hôtel des ventes ---------------------------- */

export const MARKET = {
  /** Taxe prélevée sur chaque vente conclue, avant remise de collection. */
  feeRate: 0.05,
  /** Prix plancher et plafond d'une mise en vente, en flocons. */
  minPrice: 10,
  maxPrice: 500_000,
  /** Une enchère doit dépasser la précédente d'au moins ce montant… */
  minIncrementFlat: 10,
  /** …ou de ce pourcentage, la plus grande des deux valeurs l'emportant. */
  minIncrementRate: 0.05,
  /** Une enchère dans cette fenêtre finale repousse la clôture d'autant. */
  antiSnipeWindowMs: 60_000,
  /** Durées de vente proposées au vendeur, en heures. */
  durationsHours: [1, 6, 12, 24, 48, 72] as const,
  /** Ventes actives simultanées par joueur. */
  maxActiveListingsPerPlayer: 10,
  /** Profondeur de la courbe de prix affichée. */
  historyDays: 120,
  /** Vignettes par page à l'hôtel des ventes. */
  pageSize: 48,
} as const;

export type MarketDuration = (typeof MARKET.durationsHours)[number];
