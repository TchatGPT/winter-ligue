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
import { CARDS, getCard, THEMES } from '@/lib/domain/catalog';
import { completionRatio, handSlotsFor, themeProgress } from '@/lib/domain/collection';
import type { SetBonuses } from '@/lib/domain/types';
import { handOf } from './cards';
import { bonusesFor, discoveredCardIds, gamesOf, hasShield, totalsOf } from './league';
import { closeExpiredListings, viewListing, type ListingView } from './market';

export interface HandCard {
  instanceId: string;
  cardId: string;
  name: string;
  rarity: string;
  theme: string;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  target: string;
  obtainedAt: string;
}

export interface CollectionEntry {
  cardId: string;
  name: string;
  rarity: string;
  theme: string;
  glyph: string;
  discovered: boolean;
  /** Copies jouables actuellement détenues. */
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
  handSlots: number;
  hand: HandCard[];
  collection: CollectionEntry[];
  completion: number;
  bonuses: SetBonuses;
  themes: {
    id: string;
    name: string;
    glyph: string;
    color: string;
    /** Bonus effectivement actif, ou le prochain à atteindre. */
    bonusLabel: string;
    partialBonusLabel: string;
    fullBonusLabel: string;
    owned: number;
    total: number;
    partial: boolean;
    complete: boolean;
    /** Cartes restantes avant le prochain palier. */
    toNextTier: number;
  }[];
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
  const bonuses = bonusesFor(db, playerId);
  const hand = handOf(db, playerId);

  const copiesByCard = hand.reduce<Record<string, number>>((acc, instance) => {
    acc[instance.cardId] = (acc[instance.cardId] ?? 0) + 1;
    return acc;
  }, {});

  const progress = themeProgress(discovered);

  return {
    id: player.id,
    slug: player.slug,
    pseudo: player.pseudo,
    avatarUrl: player.avatarUrl,
    twitchLogin: player.twitchLogin,
    snowflakes: player.snowflakes,
    shielded: hasShield(db, playerId),
    handSlots: handSlotsFor(discovered),
    hand: hand
      .map((instance): HandCard | null => {
        const card = getCard(instance.cardId);
        if (!card) return null;
        return {
          instanceId: instance.id,
          cardId: card.id,
          name: card.name,
          rarity: card.rarity,
          theme: card.theme,
          glyph: card.glyph,
          description: card.description,
          nature: card.nature,
          target: card.target,
          obtainedAt: instance.obtainedAt,
        };
      })
      .filter((c): c is HandCard => c !== null),
    collection: CARDS.map((card) => ({
      cardId: card.id,
      name: card.name,
      rarity: card.rarity,
      theme: card.theme,
      glyph: card.glyph,
      discovered: discoveredSet.has(card.id),
      copies: copiesByCard[card.id] ?? 0,
    })),
    completion: completionRatio(discovered),
    bonuses,
    themes: progress.map((p) => {
      const theme = THEMES[p.theme];
      return {
        id: theme.id,
        name: theme.name,
        glyph: theme.glyph,
        color: theme.color,
        // Le libellé mis en avant est celui qu'on a, ou celui qu'on vise.
        bonusLabel: p.complete
          ? theme.fullBonusLabel
          : p.partial
            ? theme.partialBonusLabel
            : theme.partialBonusLabel,
        partialBonusLabel: theme.partialBonusLabel,
        fullBonusLabel: theme.fullBonusLabel,
        owned: p.owned.length,
        total: p.owned.length + p.missing.length,
        partial: p.partial,
        complete: p.complete,
        toNextTier: p.toNextTier,
      };
    }),
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
