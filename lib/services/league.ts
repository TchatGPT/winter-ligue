import 'server-only';

/**
 * Vues de lecture de la ligue : classement, profils, recalcul des scores.
 *
 * Tous les scores affichés sortent d'ici. Une valeur `score` stockée en base
 * n'est jamais qu'un cache : `recomputeGame` la réécrit à partir des kills, du
 * placement et des cartes appliquées, si bien qu'une écriture directe en base
 * serait effacée au prochain recalcul.
 */

import type { Database, Game, Player } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { setBonusesFor } from '@/lib/domain/collection';
import { rank, scoreGame, totalsFor, type PlayerTotals, type ScoredGame } from '@/lib/domain/scoring';
import { SEASON } from '@/lib/domain/rules';
import type { SetBonuses } from '@/lib/domain/types';

/** Identifiants de cartes déjà découvertes par un joueur (collection permanente). */
export function discoveredCardIds(db: Database, playerId: string): string[] {
  return db.discoveries.filter((d) => d.playerId === playerId).map((d) => d.cardId);
}

export function bonusesFor(db: Database, playerId: string): SetBonuses {
  return setBonusesFor(discoveredCardIds(db, playerId));
}

/** Réécrit le score d'une game à partir de ses composantes. À appeler après toute modification. */
export function recomputeGame(db: Database, game: Game): Game {
  const bonuses = bonusesFor(db, game.playerId);
  game.score = scoreGame(
    {
      kills: game.kills,
      placement: game.placement,
      multiplier: game.multiplier,
      bonusPoints: game.bonusPoints,
    },
    bonuses.killMultiplier,
  ).total;
  return game;
}

/** Recalcule toutes les games d'un joueur (après complétion d'une famille, par exemple). */
export function recomputePlayerGames(db: Database, playerId: string): void {
  for (const game of db.games) {
    if (game.playerId === playerId) recomputeGame(db, game);
  }
}

export function gamesOf(db: Database, playerId: string): Game[] {
  return db.games
    .filter((g) => g.playerId === playerId)
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
}

function toScored(game: Game): ScoredGame {
  return {
    id: game.id,
    kills: game.kills,
    placement: game.placement,
    score: game.score,
    skipped: game.skipped,
    frozen: game.frozen,
    playedAt: game.playedAt,
  };
}

export function totalsOf(db: Database, playerId: string): PlayerTotals {
  return totalsFor(gamesOf(db, playerId).map(toScored));
}

/** Le joueur est-il actuellement protégé par un bouclier ? */
export function hasShield(db: Database, playerId: string, now = new Date()): boolean {
  return db.effects.some(
    (e) =>
      e.playerId === playerId &&
      e.kind === 'BOUCLIER' &&
      new Date(e.expiresAt).getTime() > now.getTime(),
  );
}

export interface RankingRow {
  rank: number;
  id: string;
  slug: string;
  pseudo: string;
  avatarUrl: string | null;
  twitchLogin: string | null;
  snowflakes: number;
  totals: PlayerTotals;
  /** Familles complétées, affichées sous forme de pastilles. */
  completedThemes: string[];
  shielded: boolean;
  /** Vrai pour les places qualificatives pour la finale. */
  finalist: boolean;
}

/** Classement complet, prêt à l'affichage. */
export async function getRanking(): Promise<RankingRow[]> {
  const store = getStore();
  return store.read((db) => {
    const active = db.players.filter((p) => p.active);
    const entries = active.map((player) => ({
      player,
      totals: totalsFor(
        db.games.filter((g) => g.playerId === player.id).map(toScored),
      ),
    }));

    return rank(entries).map(({ rank: position, player, totals }) => ({
      rank: position,
      id: player.id,
      slug: player.slug,
      pseudo: player.pseudo,
      avatarUrl: player.avatarUrl,
      twitchLogin: player.twitchLogin,
      snowflakes: player.snowflakes,
      totals,
      completedThemes: setBonusesFor(discoveredCardIds(db as Database, player.id)).completed,
      shielded: hasShield(db as Database, player.id),
      finalist: position <= SEASON.finalistCount,
    }));
  });
}

export interface LeagueOverview {
  playerCount: number;
  gameCount: number;
  totalKills: number;
  bestScore: number;
  bestScorePlayer: string | null;
  cardsInCirculation: number;
  activeListings: number;
}

export async function getOverview(): Promise<LeagueOverview> {
  const store = getStore();
  return store.read((db) => {
    const counted = db.games.filter((g) => !g.skipped);
    let best: Game | null = null;
    for (const g of counted) if (!best || g.score > best.score) best = g;
    const bestPlayer = best ? (db.players.find((p) => p.id === best.playerId) ?? null) : null;

    return {
      playerCount: db.players.filter((p) => p.active).length,
      gameCount: counted.length,
      totalKills: counted.reduce((sum, g) => sum + g.kills, 0),
      bestScore: best ? best.score : 0,
      bestScorePlayer: bestPlayer ? bestPlayer.pseudo : null,
      cardsInCirculation: db.cards.filter((c) => !c.consumed).length,
      activeListings: db.listings.filter((l) => l.status === 'ACTIVE').length,
    };
  });
}

/** Fabrique un slug unique et sûr pour une URL. */
export function makeSlug(db: Database, pseudo: string): string {
  const base =
    pseudo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'joueur';

  let slug = base;
  let n = 2;
  while (db.players.some((p) => p.slug === slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

export function findPlayerBySlug(db: Database, slug: string): Player | null {
  return db.players.find((p) => p.slug === slug) ?? null;
}
