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
import { parametresSaison, SESSION_MINUTES } from '@/lib/domain/rules';
import type { CardDefinition, Rarity } from '@/lib/domain/types';

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
 * Passé le seuil de la saison (`uneParSessionApres` : la 35ᵉ game de la Mini
 * Ligue), une seule game compte par session de jeu avec Lriaa. Rend l'heure à
 * partir de laquelle ce joueur peut de nouveau en jouer une, ou null s'il le
 * peut maintenant : sa dernière game comptée, au-delà du seuil, a moins d'une
 * session (`SESSION_MINUTES`).
 */
export function prochaineGamePossible(db: Database, playerId: string, now = new Date()): Date | null {
  const seuil = parametresSaison(db.config.numero).uneParSessionApres;
  if (seuil === null) return null;
  const comptees = db.games
    .filter((g) => g.playerId === playerId && !g.skipped)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // La game qu'on saisit serait la (n + 1)ᵉ : la règle vaut dès la 36ᵉ.
  if (comptees.length < seuil) return null;
  const derniere = comptees.at(-1)!;
  const libre = new Date(Date.parse(derniere.createdAt) + SESSION_MINUTES * 60_000);
  return libre.getTime() > now.getTime() ? libre : null;
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
  return totalsFor(gamesOf(db, playerId).map(toScored), pointsHorsGame(db, playerId));
}

/** Les points d'un joueur comptés hors de toute game : les Verglas qu'il a reçus. */
export function pointsHorsGame(db: Database, playerId: string): number {
  let points = 0;
  for (const c of db.cartesEnAttente) {
    if (c.joueurId === playerId && c.consommeeA !== null && typeof c.points === 'number') points += c.points;
  }
  return points;
}

/** Une carte, telle que le classement la montre. */
export interface CarteDuClassement {
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
  /** Le genre de son effet : « joker », « malus_choisi »… */
  genre: string;
}

/** Une carte gardée : l'identifiant de l'exemplaire, pour la jouer. */
export interface CarteGardee extends CarteDuClassement {
  id: string;
}

export interface RankingRow {
  rank: number;
  id: string;
  slug: string;
  pseudo: string;
  /** Le pseudo en jeu (Warzone) : celui que la modération cherche sur les captures. */
  activisionId: string | null;
  avatarUrl: string | null;
  twitchLogin: string | null;
  snowflakes: number;
  totals: PlayerTotals;
  /** Vrai tant que son immunité court : aucun malus ne touche ses games. */
  immunise: boolean;
  /**
   * Les cartes qu'il garde, de la plus ancienne à la plus récente : un Joker
   * (une de ses games pourra ne pas compter), des Verglas (la modération les
   * jouera pour lui, sur le joueur qu'il choisit).
   */
  gardees: CarteGardee[];
  /** La carte active : celle qui tombera sur sa prochaine game. */
  carte: CarteDuClassement | null;
  /** Vrai pour les places qualificatives pour la finale. */
  finalist: boolean;
  /**
   * Le nombre de games que la colonne « Games » montre après la barre
   * (12/11/2026) : le palier du Booster Finisseur (35, ou 60 en saison 2) tant
   * qu'il n'est pas atteint, puis la limite de la saison (38, ou 65), créneaux
   * bonus compris.
   */
  objectifGames: number;
}

/**
 * Le palier du Booster Finisseur, ou la fin de la saison une fois le palier
 * passé — comme `verifieFinisseur` le compte : les games jouées, Jokers
 * exclus, ou le Finisseur déjà tombé.
 */
export function objectifGamesDe(db: Database, player: Player): number {
  const limite = limiteDe(db, player);
  const seuil = Math.min(parametresSaison(db.config.numero).finisseurA, db.config.maxGamesPerPlayer);
  const jouees = db.games.filter((g) => g.playerId === player.id && !g.skipped).length;
  const finisseur = db.packsDus.some((p) => p.packId === 'finisseur' && p.joueurId === player.id);
  return jouees >= seuil || finisseur ? limite : seuil;
}

/** Classement complet, calculé sur une base déjà lue. */
export function classementDe(db: Database): RankingRow[] {
  const chaine = chaineDeLaLigue();
  // La streameuse n'est pas une concurrente : elle n'apparaît pas.
  const active = db.players.filter((p) => p.active && !estLaStreameuse(p, chaine));
  const entries = active.map((player) => ({
    player,
    totals: totalsFor(db.games.filter((g) => g.playerId === player.id).map(toScored), pointsHorsGame(db, player.id)),
  }));

  return rank(entries).map(({ rank: position, player, totals }) => ({
    rank: position,
    id: player.id,
    slug: player.slug,
    pseudo: player.pseudo,
    activisionId: player.activisionId,
    avatarUrl: player.avatarUrl,
    twitchLogin: player.twitchLogin,
    snowflakes: player.snowflakes,
    totals,
    immunise: estImmunise(player),
    gardees: gardeesDuJoueur(db, player.id),
    ...carteActive(db, player.id),
    finalist: position <= parametresSaison(db.config.numero).finalistes,
    objectifGames: objectifGamesDe(db, player),
  }));
}

/** Classement complet, prêt à l'affichage. */
export async function getRanking(): Promise<RankingRow[]> {
  return getStore().read((db) => classementDe(db));
}

/** Une carte du catalogue, telle que le classement la montre. */
function vueCarte(card: CardDefinition): CarteDuClassement {
  return {
    cardId: card.id,
    nom: card.name,
    glyph: card.glyph,
    rarity: card.rarity,
    action: card.subtitle,
    description: card.description,
    resume: resumeEffet(card.effect),
    nature: card.nature,
    power: card.power,
    genre: card.effect.kind,
  };
}

/** Les cartes qu'il garde, de la plus ancienne à la plus récente. */
function gardeesDuJoueur(db: Database, playerId: string): CarteGardee[] {
  return db.cartesEnAttente
    .filter((c) => c.joueurId === playerId && c.consommeeA === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA))
    .flatMap((c) => {
      const carte = getCard(c.cardId);
      return carte !== null && momentDe(carte.effect) === 'GARDEE' ? [{ ...vueCarte(carte), id: c.id }] : [];
    });
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
  // Le Joker n'est pas une carte active : il ne tombe sur rien de lui-même,
  // et se lit à part (`joker`).
  // Une carte qui se règle tout de suite non plus : si elle attend encore,
  // c'est sa révélation, et la montrer ici la spoilerait.
  const tombantes = attente.filter((c) => {
    const carte = getCard(c.cardId);
    return carte === null || (momentDe(carte.effect) !== 'GARDEE' && momentDe(carte.effect) !== 'INSTANT');
  });
  const premiere =
    tombantes.find((c) => {
      const carte = getCard(c.cardId);
      return carte !== null && momentDe(carte.effect) === 'PROCHAINE';
    }) ?? tombantes[0];
  const card = premiere ? getCard(premiere.cardId) : null;
  return { carte: premiere && card ? vueCarte(card) : null };
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
