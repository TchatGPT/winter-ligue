import 'server-only';

/**
 * Vue « mon compte » : main, collection, flocons, ventes et enchères en cours.
 *
 * Assemblée côté serveur puis envoyée telle quelle au rendu. Le client ne
 * reçoit que ce qui le concerne — jamais la main d'un adversaire, ce qui
 * éviterait toute lecture d'information cachée depuis l'onglet réseau.
 */

import type { Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { handOf } from './cards';
import { allCards, resolveCard } from './collection';
import { discoveredCardIds, gamesOf, hasShield, totalsOf } from './league';
import { closeExpiredListings, viewListing, type ListingView } from './market';

export interface HandCard {
  instanceId: string;
  cardId: string;
  kind: string;
  /** false pour une carte de collection : elle se possède et se vend, pas plus. */
  playable: boolean;
  name: string;
  rarity: string;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  target: string;
  obtainedAt: string;
}

export interface CollectionEntry {
  cardId: string;
  kind: string;
  name: string;
  subtitle: string;
  rarity: string;
  glyph: string;
  discovered: boolean;
  /** Copies actuellement détenues. */
  copies: number;
}

export interface ProfileView {
  id: string;
  slug: string;
  pseudo: string;
  avatarUrl: string | null;
  twitchLogin: string | null;
  snowflakes: number;
  shielded: boolean;
  hand: HandCard[];
  collection: CollectionEntry[];
  completion: number;
  totals: ReturnType<typeof totalsOf>;
  games: {
    id: string;
    kills: number;
    placement: number | null;
    bonusPoints: number;
    score: number;
    skipped: boolean;
    frozen: boolean;
    playedAt: string;
    note: string | null;
    applied: { cardId: string; points: number; byPlayerId: string }[];
  }[];
  /** Ventes que le joueur a lui-même publiées. */
  myListings: ListingView[];
  /** Ventes sur lesquelles il est le meilleur enchérisseur. */
  myBids: ListingView[];
  ledger: { delta: number; balanceAfter: number; reason: string; createdAt: string }[];
}

function buildProfile(db: Database, playerId: string): ProfileView | null {
  const player = db.players.find((p) => p.id === playerId);
  if (!player) return null;

  const discovered = discoveredCardIds(db, playerId);
  const discoveredSet = new Set(discovered);
  const hand = handOf(db, playerId);

  const copiesByCard = hand.reduce<Record<string, number>>((acc, instance) => {
    acc[instance.cardId] = (acc[instance.cardId] ?? 0) + 1;
    return acc;
  }, {});

  return {
    id: player.id,
    slug: player.slug,
    pseudo: player.pseudo,
    avatarUrl: player.avatarUrl,
    twitchLogin: player.twitchLogin,
    snowflakes: player.snowflakes,
    shielded: hasShield(db, playerId),
    hand: hand
      .map((instance): HandCard | null => {
        const card = resolveCard(db, instance.cardId);
        if (!card) return null;
        const effect = getCard(instance.cardId);
        return {
          instanceId: instance.id,
          cardId: card.id,
          kind: card.kind,
          name: card.name,
          rarity: card.rarity,
          glyph: card.glyph,
          description: card.description,
          nature: card.nature ?? 'bonus',
          // Une carte de collection ne cible rien : elle ne se joue pas.
          target: effect ? effect.target : 'none',
          playable: Boolean(effect),
          obtainedAt: instance.obtainedAt,
        };
      })
      .filter((c): c is HandCard => c !== null),
    // Le pool entier : cartes à effet, cartes Joueur et cartes Moment. Le
    // catalogue figé ne suffit plus, les deux dernières vivent en base.
    collection: allCards(db).map((card) => ({
      cardId: card.id,
      kind: card.kind,
      name: card.name,
      subtitle: card.subtitle,
      rarity: card.rarity,
      glyph: card.glyph,
      discovered: discoveredSet.has(card.id),
      copies: copiesByCard[card.id] ?? 0,
    })),
    completion:
      allCards(db).length === 0
        ? 0
        : allCards(db).filter((c) => discoveredSet.has(c.id)).length / allCards(db).length,
    totals: totalsOf(db, playerId),
    games: gamesOf(db, playerId).map((g) => ({
      id: g.id,
      kills: g.kills,
      placement: g.placement,
      bonusPoints: g.bonusPoints,
      score: g.score,
      skipped: g.skipped,
      frozen: g.frozen,
      playedAt: g.playedAt,
      note: g.note,
      applied: g.applied.filter((a) => !a.undone).map((a) => ({
        cardId: a.cardId,
        points: a.points,
        byPlayerId: a.byPlayerId,
      })),
    })),
    myListings: db.listings
      .filter((l) => l.sellerId === playerId && l.status === 'ACTIVE')
      .map((l) => viewListing(db, l))
      .filter((l): l is ListingView => l !== null),
    myBids: db.listings
      .filter((l) => l.currentBidderId === playerId && l.status === 'ACTIVE')
      .map((l) => viewListing(db, l))
      .filter((l): l is ListingView => l !== null),
    ledger: db.ledger
      .filter((e) => e.playerId === playerId)
      .slice(-25)
      .reverse()
      .map((e) => ({
        delta: e.delta,
        balanceAfter: e.balanceAfter,
        reason: e.reason,
        createdAt: e.createdAt,
      })),
  };
}

/**
 * Profil du joueur connecté. Passe par une transaction pour clôturer au
 * passage les ventes échues — le solde affiché tient donc compte des
 * remboursements et des adjudications en attente.
 */
export async function getProfile(playerId: string): Promise<ProfileView | null> {
  return getStore().transaction((db) => {
    closeExpiredListings(db);
    return buildProfile(db, playerId);
  });
}

/** Vue publique d'un joueur : ni main, ni grand livre. */
export async function getPublicProfile(slug: string): Promise<Omit<
  ProfileView,
  'hand' | 'ledger' | 'myBids'
> | null> {
  return getStore().read((db) => {
    const player = db.players.find((p) => p.slug === slug);
    if (!player) return null;
    const full = buildProfile(db as Database, player.id);
    if (!full) return null;
    const { hand: _hand, ledger: _ledger, myBids: _myBids, ...visible } = full;
    return visible;
  });
}
