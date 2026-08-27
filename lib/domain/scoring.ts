/**
 * Calcul des scores. Fonctions pures, sans effet de bord, couvertes par les
 * tests de `tests/scoring.test.ts`.
 *
 * Règle d'or : le client n'envoie jamais un score, seulement des kills, un
 * placement et des identifiants de cartes. Le score affiché est toujours
 * recalculé ici, côté serveur, à partir de ces entrées brutes.
 */

import { GAME_LIMITS, placementPoints } from './rules';
import type { Placement } from './types';

/** Arrondi monétaire à deux décimales, sans dérive de virgule flottante. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface GameInput {
  kills: number;
  placement: Placement;
  /** Somme des effets de cartes appliqués à cette game, positifs ou négatifs. */
  bonusPoints: number;
  /** Une game passée n'entre pas dans le total de la saison. */
  skipped?: boolean;
}

export interface GameBreakdown {
  killPoints: number;
  placementPoints: number;
  bonusPoints: number;
  total: number;
}

/**
 * Score d'une game.
 *
 *   score = (kills × bonus permanent de collection) + points de classement + bonus de cartes
 *
 * Il n'existe plus de multiplicateur stocké sur la game. Une carte annoncée
 * « ×1,5 jusqu'à +18 » calcule son apport au moment où on la joue et l'inscrit
 * comme un bonus de points : c'est mathématiquement équivalent, mais ça rend
 * l'empilement de multiplicateurs impossible et chaque apport traçable.
 */
export function scoreGame(input: GameInput, permanentKillMultiplier = 0): GameBreakdown {
  const kills = clampKills(input.kills);
  const killPoints = round2(kills * (1 + permanentKillMultiplier));
  const place = placementPoints(input.placement);
  const bonus = clampBonus(input.bonusPoints);
  return {
    killPoints,
    placementPoints: place,
    bonusPoints: bonus,
    total: round2(killPoints + place + bonus),
  };
}

export function clampKills(kills: number): number {
  if (!Number.isFinite(kills)) return 0;
  return Math.min(GAME_LIMITS.maxKills, Math.max(GAME_LIMITS.minKills, Math.trunc(kills)));
}

export function clampBonus(bonus: number): number {
  if (!Number.isFinite(bonus)) return 0;
  return Math.min(
    GAME_LIMITS.maxBonusPoints,
    Math.max(GAME_LIMITS.minBonusPoints, Math.round(bonus)),
  );
}

export interface ScoredGame {
  id: string;
  kills: number;
  placement: Placement;
  score: number;
  skipped: boolean;
  frozen: boolean;
  playedAt: string;
}

export interface PlayerTotals {
  totalScore: number;
  countedGames: number;
  totalKills: number;
  top1: number;
  top2: number;
  top3: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  bestGameId: string | null;
  worstGameId: string | null;
}

/**
 * Agrège les games d'un joueur. Les games passées (`skipped`) sont exclues du
 * total mais restent visibles dans l'historique.
 */
export function totalsFor(games: readonly ScoredGame[]): PlayerTotals {
  const counted = games.filter((g) => !g.skipped);
  const empty = counted.length === 0;

  let best: ScoredGame | null = null;
  let worst: ScoredGame | null = null;
  let totalScore = 0;
  let totalKills = 0;
  let top1 = 0;
  let top2 = 0;
  let top3 = 0;

  for (const g of counted) {
    totalScore += g.score;
    totalKills += g.kills;
    if (g.placement === 1) top1 += 1;
    else if (g.placement === 2) top2 += 1;
    else if (g.placement === 3) top3 += 1;
    if (!best || g.score > best.score) best = g;
    if (!worst || g.score < worst.score) worst = g;
  }

  return {
    totalScore: round2(totalScore),
    countedGames: counted.length,
    totalKills,
    top1,
    top2,
    top3,
    averageScore: empty ? 0 : round2(totalScore / counted.length),
    bestScore: best ? best.score : 0,
    worstScore: worst ? worst.score : 0,
    bestGameId: best ? best.id : null,
    worstGameId: worst ? worst.id : null,
  };
}

export interface RankedPlayer<T> {
  rank: number;
  player: T;
  totals: PlayerTotals;
}

/**
 * Classe les joueurs. En cas d'égalité de points : le plus de Top 1, puis le
 * plus de kills, puis la meilleure game, puis l'ordre alphabétique — pour que
 * le classement soit déterministe et ne bouge pas d'un rafraîchissement à
 * l'autre.
 */
export function rank<T extends { id: string; pseudo: string }>(
  entries: readonly { player: T; totals: PlayerTotals }[],
): RankedPlayer<T>[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.totals.totalScore !== a.totals.totalScore)
      return b.totals.totalScore - a.totals.totalScore;
    if (b.totals.top1 !== a.totals.top1) return b.totals.top1 - a.totals.top1;
    if (b.totals.totalKills !== a.totals.totalKills)
      return b.totals.totalKills - a.totals.totalKills;
    if (b.totals.bestScore !== a.totals.bestScore) return b.totals.bestScore - a.totals.bestScore;
    return a.player.pseudo.localeCompare(b.player.pseudo, 'fr');
  });

  return sorted.map((e, i) => ({ rank: i + 1, player: e.player, totals: e.totals }));
}
