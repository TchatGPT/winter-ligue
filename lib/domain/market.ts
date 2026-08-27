/**
 * Règles de l'hôtel des ventes. Fonctions pures : la persistance et les verrous
 * vivent dans `lib/db`, les contrôles d'accès dans les routes.
 *
 * Les trois invariants que ce module protège :
 *   1. une enchère doit dépasser la précédente d'un pas minimum,
 *   2. une enchère de dernière seconde repousse la clôture (anti-snipe),
 *   3. tout montant manipulé est un entier de flocons, jamais un flottant.
 */

import { MARKET } from './rules';
import type { Listing, Sale } from './types';

/** Montant minimal acceptable pour la prochaine enchère d'une vente. */
export function minimumBid(listing: Pick<Listing, 'currentPrice' | 'bidCount'>): number {
  // Personne n'a encore misé : le prix de départ est atteignable tel quel.
  if (listing.bidCount === 0) return listing.currentPrice;
  const step = Math.max(
    MARKET.minIncrementFlat,
    Math.ceil(listing.currentPrice * MARKET.minIncrementRate),
  );
  return listing.currentPrice + step;
}

export type BidRejection =
  | 'VENTE_INTROUVABLE'
  | 'VENTE_CLOSE'
  | 'VENTE_TERMINEE'
  | 'VENDEUR_INTERDIT'
  | 'MISE_TROP_BASSE'
  | 'MISE_INVALIDE'
  | 'DEJA_MEILLEUR_ENCHERISSEUR'
  | 'FLOCONS_INSUFFISANTS';

export interface BidCheckInput {
  listing: Listing;
  bidderId: string;
  amount: number;
  balance: number;
  /** Flocons déjà bloqués par ce joueur sur cette vente (enchère précédente). */
  alreadyEscrowed: number;
  now: Date;
}

export interface BidCheckResult {
  ok: boolean;
  reason?: BidRejection;
  /** Flocons à débiter en plus de ceux déjà bloqués. */
  additionalEscrow?: number;
  /** Nouvelle date de clôture si l'anti-snipe se déclenche. */
  newEndsAt?: string;
}

/**
 * Valide une enchère. Aucun état n'est modifié ici : la route applique le
 * résultat dans une transaction, ce qui permet de tester la règle isolément.
 */
export function checkBid(input: BidCheckInput): BidCheckResult {
  const { listing, bidderId, amount, balance, alreadyEscrowed, now } = input;

  if (listing.status !== 'ACTIVE') return { ok: false, reason: 'VENTE_CLOSE' };
  if (new Date(listing.endsAt).getTime() <= now.getTime())
    return { ok: false, reason: 'VENTE_TERMINEE' };
  if (listing.sellerId === bidderId) return { ok: false, reason: 'VENDEUR_INTERDIT' };
  if (listing.currentBidderId === bidderId)
    return { ok: false, reason: 'DEJA_MEILLEUR_ENCHERISSEUR' };

  if (!Number.isInteger(amount) || amount < MARKET.minPrice || amount > MARKET.maxPrice)
    return { ok: false, reason: 'MISE_INVALIDE' };
  if (amount < minimumBid(listing)) return { ok: false, reason: 'MISE_TROP_BASSE' };

  // Le joueur ne paie que le complément s'il avait déjà des flocons bloqués ici.
  const additionalEscrow = Math.max(0, amount - alreadyEscrowed);
  if (balance < additionalEscrow) return { ok: false, reason: 'FLOCONS_INSUFFISANTS' };

  const remainingMs = new Date(listing.endsAt).getTime() - now.getTime();
  const newEndsAt =
    remainingMs < MARKET.antiSnipeWindowMs
      ? new Date(now.getTime() + MARKET.antiSnipeWindowMs).toISOString()
      : undefined;

  return { ok: true, additionalEscrow, newEndsAt };
}

/** Taxe prélevée au vendeur, remise de collection appliquée. */
export function marketFee(price: number, feeDiscount = 0): number {
  const rate = MARKET.feeRate * (1 - Math.min(1, Math.max(0, feeDiscount)));
  return Math.floor(price * rate);
}

/** Ce que le vendeur touche réellement. */
export function sellerPayout(price: number, feeDiscount = 0): number {
  return price - marketFee(price, feeDiscount);
}

/** Une vente est-elle arrivée à échéance et en attente de clôture ? */
export function isExpired(listing: Listing, now: Date): boolean {
  return listing.status === 'ACTIVE' && new Date(listing.endsAt).getTime() <= now.getTime();
}

/**
 * Statistiques et courbe de prix d'une carte, calculées à partir des ventes
 * conclues. `sales` peut arriver dans n'importe quel ordre.
 */
export function buildStats(
  cardId: string,
  sales: readonly Sale[],
  activeListings: readonly Listing[],
  now: Date,
): {
  lastPrice: number | null;
  lastBuyerId: string | null;
  lastSoldAt: string | null;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  volume: number;
  trend7d: number | null;
  history: { at: string; price: number }[];
  activeListings: number;
  floorPrice: number | null;
} {
  const cutoff = now.getTime() - MARKET.historyDays * 24 * 60 * 60 * 1000;
  const relevant = sales
    .filter((s) => s.cardId === cardId)
    .sort((a, b) => new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime());
  const windowed = relevant.filter((s) => new Date(s.soldAt).getTime() >= cutoff);

  const prices = relevant.map((s) => s.price);
  const last = relevant.at(-1) ?? null;

  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recent = relevant.filter((s) => new Date(s.soldAt).getTime() >= sevenDaysAgo);
  const older = relevant.filter((s) => new Date(s.soldAt).getTime() < sevenDaysAgo);
  const trend7d =
    recent.length > 0 && older.length > 0
      ? Math.round(((average(recent.map((s) => s.price)) - average(older.map((s) => s.price))) /
          average(older.map((s) => s.price))) *
          1000) / 10
      : null;

  const open = activeListings.filter((l) => l.cardId === cardId && l.status === 'ACTIVE');

  return {
    lastPrice: last ? last.price : null,
    lastBuyerId: last ? last.buyerId : null,
    lastSoldAt: last ? last.soldAt : null,
    averagePrice: prices.length ? Math.round(average(prices)) : null,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    volume: relevant.length,
    trend7d,
    history: windowed.map((s) => ({ at: s.soldAt, price: s.price })),
    activeListings: open.length,
    floorPrice: open.length ? Math.min(...open.map((l) => l.currentPrice)) : null,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
