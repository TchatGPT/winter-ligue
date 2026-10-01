import 'server-only';

/**
 * Vues de lecture de la ligue : classement, profils, recalcul des scores.
 *
 * Tous les scores affichés sortent d'ici. Une valeur `score` stockée en base
 * n'est jamais qu'un cache : `recomputeGame` la réécrit à partir des kills, du
 * placement et des cartes appliquées, si bien qu'une écriture directe en base
 * serait effacée au prochain recalcul.
 */

import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import type { Database, Game, Player } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { rank, scoreGame, totalsFor, type PlayerTotals, type ScoredGame } from '@/lib/domain/scoring';
import { getCard, momentDe, resumeEffet } from '@/lib/domain/catalog';
import { SEASON } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

/** Réécrit le score d'une game à partir de ses composantes. À appeler après toute modification. */
export function recomputeGame(db: Database, game: Game): Game {
  game.score = scoreGame({
    kills: game.kills,
    placement: game.placement,
    bonusPoints: game.bonusPoints,
  }).total;
  return game;
}

/** Recalcule toutes les games d'un joueur. */
export function recomputePlayerGames(db: Database, playerId: string): void {
  for (const game of db.games) {
    if (game.playerId === playerId) recomputeGame(db, game);
  }
}

/** Le nombre de games qui comptent pour ce joueur : les games passées n'en sont pas. */
export function gamesComptees(db: Database, playerId: string): number {
  return db.games.filter((g) => g.playerId === playerId && !g.skipped).length;
}

/**
 * La limite de games d'un joueur : celle de la saison, plus les créneaux qu'une
 * carte « Game supplémentaire » lui a donnés.
 */
export function limiteDe(db: Database, player: Pick<Player, 'creneauxBonus'>): number {
  return db.config.maxGamesPerPlayer + Math.max(0, player.creneauxBonus ?? 0);
}

/** Vrai si le joueur n'a plus de game à jouer : une carte ne peut plus attendre la suivante. */
export function aJoueToutesSesGames(db: Database, player: Player): boolean {
  return gamesComptees(db, player.id) >= limiteDe(db, player);
}

/** L'immunité court-elle encore ? */
export function estImmunise(player: Pick<Player, 'immuniseJusqua'>, now = new Date()): boolean {
  return player.immuniseJusqua !== null && new Date(player.immuniseJusqua).getTime() > now.getTime();
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
    playedAt: game.playedAt,
  };
}

export function totalsOf(db: Database, playerId: string): PlayerTotals {
  return totalsFor(gamesOf(db, playerId).map(toScored));
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
  /** Vrai tant que son immunité court : aucun malus ne touche ses games. */
  immunise: boolean;
  /** La carte active : celle qui tombera sur sa prochaine game. */
  carte: {
    cardId: string;
    nom: string;
    glyph: string;
    rarity: Rarity;
    /** L'intitulé de l'action : « Multiplicateur game », « Joker »… */
    action: string;
    description: string;
    resume: string;
    nature: 'bonus' | 'malus';
    power: number;
  } | null;
  /** Vrai pour les places qualificatives pour la finale. */
  finalist: boolean;
}

/** Classement complet, calculé sur une base déjà lue. */
export function classementDe(db: Database): RankingRow[] {
  const chaine = chaineDeLaLigue();
  // La streameuse n'est pas une concurrente : elle n'apparaît pas.
  const active = db.players.filter((p) => p.active && !estLaStreameuse(p, chaine));
  const entries = active.map((player) => ({
    player,
    totals: totalsFor(db.games.filter((g) => g.playerId === player.id).map(toScored)),
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
    immunise: estImmunise(player),
    ...carteActive(db, player.id),
    finalist: position <= SEASON.finalistCount,
  }));
}

/** Classement complet, prêt à l'affichage. */
export async function getRanking(): Promise<RankingRow[]> {
  return getStore().read((db) => classementDe(db));
}

/**
 * La carte active d'un joueur : celle qui tombera sur sa prochaine game.
 *
 * La carte active est la plus ancienne de celles qui attendent **la prochaine
 * game**. Une carte qui relève une game déjà jouée n'attend pas la suivante :
 * elle se règle dès qu'elle le peut, et ne passe devant personne.
 */
function carteActive(db: Database, playerId: string): Pick<RankingRow, 'carte'> {
  const attente = db.cartesEnAttente
    .filter((c) => c.joueurId === playerId && c.consommeeA === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA));
  const premiere =
    attente.find((c) => {
      const carte = getCard(c.cardId);
      return carte !== null && momentDe(carte.effect) === 'PROCHAINE';
    }) ?? attente[0];
  const card = premiere ? getCard(premiere.cardId) : null;
  return {
    carte:
      premiere && card
        ? {
            cardId: card.id,
            nom: card.name,
            glyph: card.glyph,
            rarity: card.rarity,
            action: card.subtitle,
            description: card.description,
            resume: resumeEffet(card.effect),
            nature: card.nature,
            power: card.power,
          }
        : null,
  };
}

export interface LeagueOverview {
  playerCount: number;
  gameCount: number;
  totalKills: number;
  bestScore: number;
  bestScorePlayer: string | null;
  packsOuverts: number;
  packsEnFile: number;
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
      packsOuverts: db.ouvertures.length,
      packsEnFile: db.packsDus.filter((p) => p.ouvertureId === null).length,
    };
  });
}

/** Fabrique un slug unique et sûr pour une URL. */
export function makeSlug(db: Database, pseudo: string): string {
  const base =
    pseudo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
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
