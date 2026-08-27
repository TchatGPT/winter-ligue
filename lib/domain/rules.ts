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
  minMultiplier: 1,
  maxMultiplier: 3,
  minBonusPoints: -500,
  maxBonusPoints: 500,
} as const;

/** Nombre de games comptabilisées par joueur, ajustable par l'admin. */
export const DEFAULT_MAX_GAMES_PER_PLAYER = 25;

/* ------------------------------- Économie ------------------------------- */

export const ECONOMY = {
  /** Flocons gagnés par kill. */
  perKill: 3,
  /** Flocons gagnés selon le placement. */
  perPlacement: { '1': 80, '2': 50, '3': 25 } as Record<'1' | '2' | '3', number>,
  /** Flocons gagnés simplement en enregistrant une game. */
  participation: 15,
  /** Dotation de départ à l'inscription. */
  welcomeGrant: 300,
} as const;

/* --------------------------- Cartes et collection ------------------------ */

/** Emplacements de main de base, avant bonus de collection. */
export const BASE_HAND_SLOTS = 6;

/** Une carte offensive ne peut pas viser deux fois le même joueur dans ce délai. */
export const MALUS_COOLDOWN_HOURS = 6;

/** Ordre d'affichage et de comparaison des raretés. */
export const RARITY_ORDER: Record<Rarity, number> = {
  COMMUNE: 0,
  RARE: 1,
  EPIQUE: 2,
  LEGENDAIRE: 3,
};

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
  historyDays: 30,
} as const;

export type MarketDuration = (typeof MARKET.durationsHours)[number];
