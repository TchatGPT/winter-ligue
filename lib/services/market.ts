import 'server-only';

/**
 * Hôtel des ventes.
 *
 * Deux mécanismes portent toute la sécurité de ce module :
 *
 *  1. **Le séquestre.** Enchérir débite immédiatement les flocons. Ils sont
 *     rendus dès qu'une enchère supérieure passe. Personne ne peut donc miser
 *     plus qu'il ne possède, ni miser sur dix ventes avec le même solde.
 *  2. **Le verrou de carte.** Mettre une copie en vente inscrit `listingId`
 *     dessus ; `playCard` refuse alors de la jouer. Impossible de vendre une
 *     carte et de la consommer avant la livraison.
 *
 * Les ventes échues sont clôturées paresseusement, à chaque lecture du marché,
 * et par l'endpoint `/api/market/close` qu'un cron peut appeler.
 */

import type { Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { buildStats, checkBid, minimumBid, sellerPayout, marketFee } from '@/lib/domain/market';
import { MARKET } from '@/lib/domain/rules';
import type { Bid, Listing, MarketStats } from '@/lib/domain/types';
import { audit, credit, debit } from './ledger';
import { consumeBoon } from './effects';
import { bonusesFor } from './league';

export class MarketError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'MARCHE_FERME'
      | 'CARTE_INTROUVABLE'
      | 'CARTE_VERROUILLEE'
      | 'VENTE_INTROUVABLE'
      | 'VENTE_CLOSE'
      | 'NON_PROPRIETAIRE'
      | 'TROP_DE_VENTES'
      | 'ENCHERES_EN_COURS'
      | 'PAS_D_ACHAT_IMMEDIAT'
      | 'MISE_REFUSEE'
      | 'FLOCONS_INSUFFISANTS',
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MarketError';
  }
}

/* ------------------------------ Mise en vente ---------------------------- */

export function createListing(
  db: Database,
  sellerId: string,
  input: {
    cardInstanceId: string;
    startPrice: number;
    buyoutPrice: number | null | undefined;
    durationHours: number;
  },
): Listing {
  if (!db.config.marketOpen) throw new MarketError('L’hôtel des ventes est fermé.', 'MARCHE_FERME');

  const active = db.listings.filter((l) => l.sellerId === sellerId && l.status === 'ACTIVE');
  if (active.length >= MARKET.maxActiveListingsPerPlayer) {
    throw new MarketError(
      `Maximum ${MARKET.maxActiveListingsPerPlayer} ventes actives simultanées.`,
      'TROP_DE_VENTES',
    );
  }

  const instance = db.cards.find((c) => c.id === input.cardInstanceId);
  if (!instance || instance.playerId !== sellerId || instance.consumed) {
    throw new MarketError('Carte introuvable dans ta collection.', 'CARTE_INTROUVABLE');
  }
  if (instance.listingId) {
    throw new MarketError('Cette carte est déjà en vente.', 'CARTE_VERROUILLEE');
  }
  if (!getCard(instance.cardId)) {
    throw new MarketError('Carte inconnue au catalogue.', 'CARTE_INTROUVABLE');
  }

  const now = new Date();
  const listing: Listing = {
    id: newId(),
    sellerId,
    cardInstanceId: instance.id,
    cardId: instance.cardId,
    startPrice: input.startPrice,
    buyoutPrice: input.buyoutPrice ?? null,
    currentPrice: input.startPrice,
    currentBidderId: null,
    bidCount: 0,
    createdAt: now.toISOString(),
    endsAt: new Date(now.getTime() + input.durationHours * 60 * 60 * 1000).toISOString(),
    status: 'ACTIVE',
    buyerId: null,
    finalPrice: null,
    closedAt: null,
  };

  // Le verrou : à partir d'ici la carte n'est plus jouable.
  instance.listingId = listing.id;
  db.listings.push(listing);
  audit(db, sellerId, 'MISE_EN_VENTE', listing.id, `${instance.cardId} à ${input.startPrice} ❄`);
  return listing;
}

/** Annulation possible tant qu'aucune enchère n'est tombée. */
export function cancelListing(db: Database, sellerId: string, listingId: string): Listing {
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) throw new MarketError('Vente introuvable.', 'VENTE_INTROUVABLE');
  if (listing.sellerId !== sellerId) {
    throw new MarketError('Cette vente ne t’appartient pas.', 'NON_PROPRIETAIRE');
  }
  if (listing.status !== 'ACTIVE') throw new MarketError('Vente déjà close.', 'VENTE_CLOSE');
  if (listing.bidCount > 0) {
    throw new MarketError('Impossible d’annuler : des enchères sont en cours.', 'ENCHERES_EN_COURS');
  }

  listing.status = 'ANNULEE';
  listing.closedAt = new Date().toISOString();
  releaseCard(db, listing);
  audit(db, sellerId, 'VENTE_ANNULEE', listing.id, listing.cardId);
  return listing;
}

function releaseCard(db: Database, listing: Listing): void {
  const instance = db.cards.find((c) => c.id === listing.cardInstanceId);
  if (instance && instance.listingId === listing.id) instance.listingId = null;
}

/* --------------------------------- Enchères ------------------------------ */

/** Flocons déjà bloqués par un joueur sur une vente donnée. */
function escrowedBy(db: Database, listingId: string, bidderId: string): number {
  const active = db.bids.filter(
    (b) => b.listingId === listingId && b.bidderId === bidderId && !b.refunded,
  );
  return active.reduce((max, b) => Math.max(max, b.amount), 0);
}

export interface BidResult {
  listing: Listing;
  minimumNextBid: number;
  balance: number;
  /** Joueur dont l'enchère vient d'être remboursée, le cas échéant. */
  outbidPlayerId: string | null;
}

export function placeBid(
  db: Database,
  bidderId: string,
  listingId: string,
  amount: number,
): BidResult {
  if (!db.config.marketOpen) throw new MarketError('L’hôtel des ventes est fermé.', 'MARCHE_FERME');

  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) throw new MarketError('Vente introuvable.', 'VENTE_INTROUVABLE');

  const now = new Date();
  // Une vente échue est d'abord clôturée : on n'enchérit jamais après le temps.
  if (closeIfExpired(db, listing, now)) {
    throw new MarketError('Cette vente est terminée.', 'VENTE_CLOSE');
  }

  const bidder = db.players.find((p) => p.id === bidderId);
  if (!bidder) throw new MarketError('Joueur introuvable.', 'VENTE_INTROUVABLE');

  const alreadyEscrowed = escrowedBy(db, listing.id, bidderId);
  const check = checkBid({
    listing,
    bidderId,
    amount,
    balance: bidder.snowflakes,
    alreadyEscrowed,
    now,
  });

  if (!check.ok) {
    throw new MarketError(bidRejectionMessage(check.reason!, listing), 'MISE_REFUSEE', {
      reason: check.reason,
      minimum: minimumBid(listing),
    });
  }

  // Séquestre : les flocons quittent le compte immédiatement.
  debit(db, bidderId, check.additionalEscrow ?? 0, 'ENCHERE_BLOQUEE', listing.id);

  // Remboursement de l'enchérisseur précédent.
  const outbidPlayerId = listing.currentBidderId;
  if (outbidPlayerId && outbidPlayerId !== bidderId) {
    const refund = escrowedBy(db, listing.id, outbidPlayerId);
    if (refund > 0) {
      credit(db, outbidPlayerId, refund, 'ENCHERE_REMBOURSEE', listing.id);
      for (const b of db.bids) {
        if (b.listingId === listing.id && b.bidderId === outbidPlayerId) b.refunded = true;
      }
    }
  }

  const bid: Bid = {
    id: newId(),
    listingId: listing.id,
    bidderId,
    amount,
    createdAt: now.toISOString(),
    refunded: false,
  };
  db.bids.push(bid);

  listing.currentPrice = amount;
  listing.currentBidderId = bidderId;
  listing.bidCount += 1;
  if (check.newEndsAt) listing.endsAt = check.newEndsAt;

  // Achat immédiat atteint par les enchères : on conclut sans attendre.
  if (listing.buyoutPrice !== null && amount >= listing.buyoutPrice) {
    settle(db, listing, bidderId, amount, 'ENCHERE', now);
  }

  return {
    listing,
    minimumNextBid: minimumBid(listing),
    balance: bidder.snowflakes,
    outbidPlayerId: outbidPlayerId && outbidPlayerId !== bidderId ? outbidPlayerId : null,
  };
}

function bidRejectionMessage(reason: string, listing: Listing): string {
  switch (reason) {
    case 'VENDEUR_INTERDIT':
      return 'Tu ne peux pas enchérir sur ta propre vente.';
    case 'DEJA_MEILLEUR_ENCHERISSEUR':
      return 'Tu es déjà le meilleur enchérisseur.';
    case 'MISE_TROP_BASSE':
      return `Mise minimum : ${minimumBid(listing)} flocons.`;
    case 'FLOCONS_INSUFFISANTS':
      return 'Flocons insuffisants pour couvrir cette enchère.';
    case 'VENTE_TERMINEE':
    case 'VENTE_CLOSE':
      return 'Cette vente est terminée.';
    default:
      return 'Enchère refusée.';
  }
}

/* ------------------------------ Achat immédiat --------------------------- */

export function buyout(db: Database, buyerId: string, listingId: string): Listing {
  if (!db.config.marketOpen) throw new MarketError('L’hôtel des ventes est fermé.', 'MARCHE_FERME');

  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) throw new MarketError('Vente introuvable.', 'VENTE_INTROUVABLE');

  const now = new Date();
  if (closeIfExpired(db, listing, now)) {
    throw new MarketError('Cette vente est terminée.', 'VENTE_CLOSE');
  }
  if (listing.status !== 'ACTIVE') throw new MarketError('Vente déjà close.', 'VENTE_CLOSE');
  if (listing.sellerId === buyerId) {
    throw new MarketError('Tu ne peux pas acheter ta propre carte.', 'NON_PROPRIETAIRE');
  }
  if (listing.buyoutPrice === null) {
    throw new MarketError('Cette vente n’a pas d’achat immédiat.', 'PAS_D_ACHAT_IMMEDIAT');
  }

  const price = listing.buyoutPrice;
  const buyer = db.players.find((p) => p.id === buyerId);
  if (!buyer) throw new MarketError('Joueur introuvable.', 'VENTE_INTROUVABLE');
  if (buyer.snowflakes < price) {
    throw new MarketError('Flocons insuffisants.', 'FLOCONS_INSUFFISANTS');
  }

  // Le meilleur enchérisseur est remboursé : il perd la vente, pas ses flocons.
  refundCurrentBidder(db, listing);

  debit(db, buyerId, price, 'ACHAT_MARCHE', listing.id);
  settle(db, listing, buyerId, price, 'ACHAT_IMMEDIAT', now, { alreadyDebited: true });
  return listing;
}

function refundCurrentBidder(db: Database, listing: Listing): void {
  if (!listing.currentBidderId) return;
  const refund = escrowedBy(db, listing.id, listing.currentBidderId);
  if (refund > 0) {
    credit(db, listing.currentBidderId, refund, 'ENCHERE_REMBOURSEE', listing.id);
    for (const b of db.bids) {
      if (b.listingId === listing.id && b.bidderId === listing.currentBidderId) b.refunded = true;
    }
  }
  listing.currentBidderId = null;
}

/* -------------------------------- Clôture -------------------------------- */

/**
 * Conclut une vente : transfert de la carte, versement au vendeur taxe déduite,
 * enregistrement dans l'historique de prix.
 */
function settle(
  db: Database,
  listing: Listing,
  buyerId: string,
  price: number,
  method: 'ENCHERE' | 'ACHAT_IMMEDIAT',
  now: Date,
  options: { alreadyDebited?: boolean } = {},
): void {
  // Pour une enchère, les flocons sont déjà séquestrés : rien à redébiter.
  if (!options.alreadyDebited && method === 'ACHAT_IMMEDIAT') {
    debit(db, buyerId, price, 'ACHAT_MARCHE', listing.id);
  }
  if (method === 'ENCHERE') {
    for (const b of db.bids) {
      if (b.listingId === listing.id && b.bidderId === buyerId) b.refunded = true;
    }
  }

  // La remise de collection et la faveur « Mécène » se cumulent, plafonnées à
  // 100 % : une vente ne peut jamais rapporter plus que son prix.
  const mecene = consumeBoon(db, listing.sellerId, 'TAXE_REDUITE');
  const feeDiscount = Math.min(
    1,
    bonusesFor(db, listing.sellerId).marketFeeDiscount + (mecene ? Number(mecene.value ?? 0) : 0),
  );
  const fee = marketFee(price, feeDiscount);
  const payout = sellerPayout(price, feeDiscount);
  credit(db, listing.sellerId, payout, 'VENTE_MARCHE', listing.id);

  // Transfert de propriété de la copie, et déverrouillage.
  const instance = db.cards.find((c) => c.id === listing.cardInstanceId);
  if (instance) {
    instance.playerId = buyerId;
    instance.listingId = null;
    instance.source = 'MARCHE';
    // L'acheteur découvre peut-être cette carte pour la première fois.
    const known = db.discoveries.some(
      (d) => d.playerId === buyerId && d.cardId === instance.cardId,
    );
    if (!known) {
      db.discoveries.push({
        playerId: buyerId,
        cardId: instance.cardId,
        firstObtainedAt: now.toISOString(),
      });
    }
  }

  listing.status = 'VENDUE';
  listing.buyerId = buyerId;
  listing.finalPrice = price;
  listing.closedAt = now.toISOString();
  listing.currentPrice = price;

  db.sales.push({
    id: newId(),
    listingId: listing.id,
    cardId: listing.cardId,
    sellerId: listing.sellerId,
    buyerId,
    price,
    fee,
    method,
    soldAt: now.toISOString(),
  });

  audit(
    db,
    buyerId,
    method === 'ENCHERE' ? 'VENTE_ADJUGEE' : 'ACHAT_IMMEDIAT',
    listing.id,
    `${listing.cardId} pour ${price} ❄ (taxe ${fee})`,
  );
}

/**
 * Clôture une vente arrivée à échéance. Retourne true si la vente n'est plus
 * active à la sortie.
 */
export function closeIfExpired(db: Database, listing: Listing, now = new Date()): boolean {
  if (listing.status !== 'ACTIVE') return true;
  if (new Date(listing.endsAt).getTime() > now.getTime()) return false;

  if (listing.currentBidderId) {
    settle(db, listing, listing.currentBidderId, listing.currentPrice, 'ENCHERE', now);
  } else {
    // Personne n'a misé : la carte revient au vendeur.
    listing.status = 'EXPIREE';
    listing.closedAt = now.toISOString();
    releaseCard(db, listing);
    audit(db, 'systeme', 'VENTE_EXPIREE', listing.id, listing.cardId);
  }
  return true;
}

/** Passe en revue toutes les ventes échues. Appelée à chaque lecture du marché. */
export function closeExpiredListings(db: Database, now = new Date()): number {
  let closed = 0;
  for (const listing of db.listings) {
    if (listing.status === 'ACTIVE' && new Date(listing.endsAt).getTime() <= now.getTime()) {
      closeIfExpired(db, listing, now);
      closed += 1;
    }
  }
  return closed;
}

/* ------------------------------ Vues de lecture -------------------------- */

export interface ListingView extends Listing {
  card: { id: string; name: string; rarity: string; theme: string; glyph: string };
  sellerPseudo: string;
  currentBidderPseudo: string | null;
  minimumNextBid: number;
  /** Millisecondes restantes, pour le compte à rebours côté client. */
  remainingMs: number;
}

export function viewListing(db: Database, listing: Listing): ListingView | null {
  const card = getCard(listing.cardId);
  if (!card) return null;
  const seller = db.players.find((p) => p.id === listing.sellerId);
  const bidder = listing.currentBidderId
    ? db.players.find((p) => p.id === listing.currentBidderId)
    : null;

  return {
    ...listing,
    card: {
      id: card.id,
      name: card.name,
      rarity: card.rarity,
      theme: card.theme,
      glyph: card.glyph,
    },
    sellerPseudo: seller ? seller.pseudo : 'Inconnu',
    currentBidderPseudo: bidder ? bidder.pseudo : null,
    minimumNextBid: minimumBid(listing),
    remainingMs: Math.max(0, new Date(listing.endsAt).getTime() - Date.now()),
  };
}

export function statsForCard(db: Database, cardId: string, now = new Date()): MarketStats {
  const stats = buildStats(cardId, db.sales, db.listings, now);
  return { cardId, ...stats };
}

/** Dernier acheteur d'une carte, résolu en pseudo pour l'affichage. */
export function lastBuyerPseudo(db: Database, cardId: string): string | null {
  const sales = db.sales
    .filter((s) => s.cardId === cardId)
    .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  const last = sales[0];
  if (!last) return null;
  return db.players.find((p) => p.id === last.buyerId)?.pseudo ?? null;
}

/**
 * Ventes conclues dans les N dernières heures.
 *
 * Vit ici plutôt que dans la page : lire l'horloge pendant le rendu d'un
 * composant est signalé comme impur, et une fenêtre glissante est de toute
 * façon une question de domaine, pas de présentation.
 */
export function recentSales(db: Database, hours: number, now = new Date()) {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  return db.sales.filter((s) => new Date(s.soldAt).getTime() >= cutoff);
}
