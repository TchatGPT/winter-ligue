import 'server-only';

/**
 * Résolution des effets de cartes.
 *
 * Séparé de `cards.ts` pour une raison précise : ce fichier ne fait que
 * traduire un effet du catalogue en modifications de la base. Il ne décide ni
 * qui a le droit de jouer, ni ce que ça coûte — ces contrôles restent en
 * amont. Chaque branche est ainsi lisible isolément, et un test peut vérifier
 * qu'aucune ne dépasse le plafond d'impact.
 *
 * Deux invariants tenus ici :
 *
 *   1. Chaque modification de points passe par `applyPoints`, qui journalise
 *      le delta exact dans `game.applied`. C'est ce journal qui rend Second
 *      Souffle et Contre-Courant possibles — on sait précisément quoi rendre.
 *   2. Un malus retire des points à sa cible et n'en donne jamais à
 *      l'attaquant. Aucune branche ne crédite l'attaquant, et un test le
 *      vérifie.
 */

import { randomInt } from 'node:crypto';
import type { AppliedEffect, Database, Game, PlayerBoon } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { GAME_LIMITS, MALUS } from '@/lib/domain/rules';
import type { BoonKind, CardDefinition, CardEffect } from '@/lib/domain/types';
import { credit } from './ledger';
import { gamesOf, hasShield, recomputeGame } from './league';

export class EffectError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'CIBLE_REQUISE'
      | 'CIBLE_INVALIDE'
      | 'AUCUNE_GAME'
      | 'GAME_GELEE'
      | 'CIBLE_PROTEGEE'
      | 'DELAI_MALUS'
      | 'QUOTA_MALUS'
      | 'RIEN_A_ANNULER'
      | 'SILENCE',
  ) {
    super(message);
    this.name = 'EffectError';
  }
}

export interface EffectOutcome {
  summary: string;
  affectedGameId: string | null;
  targetPlayerId: string | null;
}

export interface EffectInput {
  gameId?: string;
  targetPlayerId?: string;
}

/* ------------------------------ Utilitaires ------------------------------ */

function countedGames(db: Database, playerId: string): Game[] {
  return gamesOf(db, playerId).filter((g) => !g.skipped);
}

/** Games d'un joueur, de la meilleure à la moins bonne. */
function ranked(db: Database, playerId: string): Game[] {
  return countedGames(db, playerId).sort((a, b) => b.score - a.score);
}

function ownGame(db: Database, playerId: string, gameId: string | undefined): Game {
  if (!gameId) throw new EffectError('Cette carte demande de choisir une game.', 'CIBLE_REQUISE');
  const game = db.games.find((g) => g.id === gameId && g.playerId === playerId);
  if (!game) throw new EffectError('Game introuvable.', 'CIBLE_INVALIDE');
  return game;
}

/**
 * Applique un delta de points à une game et le journalise.
 *
 * Le delta réellement appliqué peut être plus petit que demandé : le cumul de
 * bonus sur une même game est borné. C'est le delta *effectif* qui est
 * journalisé, sans quoi une annulation rendrait plus que ce qui avait été pris.
 */
function applyPoints(
  db: Database,
  game: Game,
  card: CardDefinition,
  byPlayerId: string,
  requested: number,
): number {
  const before = game.bonusPoints;
  const after = Math.max(
    GAME_LIMITS.minBonusPoints,
    Math.min(GAME_LIMITS.maxBonusPoints, before + requested),
  );
  const effective = after - before;

  const entry: AppliedEffect = {
    id: newId(),
    cardId: card.id,
    byPlayerId,
    points: effective,
    at: new Date().toISOString(),
    undone: false,
  };
  game.applied.push(entry);
  game.bonusPoints = after;
  recomputeGame(db, game);
  return effective;
}

/** Pose ou prolonge un effet temporaire sur un joueur. */
function grantEffect(
  db: Database,
  playerId: string,
  kind: 'BOUCLIER' | 'SILENCE',
  sourceCardId: string,
  hours: number,
): void {
  const now = Date.now();
  // On prolonge à partir de l'échéance la plus lointaine : deux boucliers
  // simultanés ne protègent pas mieux qu'un seul, mais deux fois plus longtemps.
  const current = db.effects
    .filter((e) => e.playerId === playerId && e.kind === kind)
    .map((e) => new Date(e.expiresAt).getTime())
    .filter((t) => t > now);
  const from = current.length > 0 ? Math.max(...current) : now;

  db.effects.push({
    id: newId(),
    playerId,
    kind,
    sourceCardId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(from + hours * 60 * 60 * 1000).toISOString(),
  });
}

function grantBoon(
  db: Database,
  playerId: string,
  kind: BoonKind,
  uses: number,
  value: string | null,
  sourceCardId: string,
): PlayerBoon {
  const boon: PlayerBoon = {
    id: newId(),
    playerId,
    kind,
    remaining: uses,
    value,
    sourceCardId,
    createdAt: new Date().toISOString(),
  };
  db.boons.push(boon);
  return boon;
}

/** Le joueur est-il réduit au silence ? */
export function isSilenced(db: Database, playerId: string, now = new Date()): boolean {
  return db.effects.some(
    (e) =>
      e.playerId === playerId &&
      e.kind === 'SILENCE' &&
      new Date(e.expiresAt).getTime() > now.getTime(),
  );
}

/** Malus encaissés par une cible dans les dernières 24 heures, toutes sources. */
export function malusReceivedToday(db: Database, targetId: string, now = new Date()): number {
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  return db.cards.filter(
    (c) =>
      c.consumedOnPlayerId === targetId &&
      c.consumed &&
      c.consumedAt !== null &&
      new Date(c.consumedAt).getTime() > since,
  ).length;
}

/**
 * Vérifie qu'un malus peut atteindre sa cible.
 *
 * Le ciblage est libre — n'importe qui peut viser n'importe qui — mais deux
 * plafonds évitent l'acharnement : un délai par attaquant, et un quota
 * journalier toutes sources confondues. Sans ce second plafond, sept joueurs
 * pourraient enchaîner sept malus sur le leader le même soir.
 */
function assertCanTarget(db: Database, attackerId: string, targetId: string): void {
  if (attackerId === targetId) {
    throw new EffectError('Un malus se pose sur un adversaire, pas sur soi.', 'CIBLE_INVALIDE');
  }

  const target = db.players.find((p) => p.id === targetId);
  if (!target || !target.active) {
    throw new EffectError('Adversaire introuvable.', 'CIBLE_INVALIDE');
  }
  if (hasShield(db, targetId)) {
    throw new EffectError('Cet adversaire est protégé par un bouclier.', 'CIBLE_PROTEGEE');
  }

  const since = Date.now() - MALUS.cooldownHours * 60 * 60 * 1000;
  const recent = db.cards.some(
    (c) =>
      c.playerId === attackerId &&
      c.consumed &&
      c.consumedOnPlayerId === targetId &&
      c.consumedAt !== null &&
      new Date(c.consumedAt).getTime() > since,
  );
  if (recent) {
    throw new EffectError(
      `Tu as déjà visé ce joueur il y a moins de ${MALUS.cooldownHours} h.`,
      'DELAI_MALUS',
    );
  }

  if (malusReceivedToday(db, targetId) >= MALUS.maxReceivedPerDay) {
    throw new EffectError(
      `Ce joueur a déjà encaissé ${MALUS.maxReceivedPerDay} malus dans les 24 h. Il est hors d’atteinte pour l’instant.`,
      'QUOTA_MALUS',
    );
  }
}

/* --------------------------- Résolution des effets ------------------------ */

/**
 * Traduit un effet de carte en modifications de la base.
 *
 * À appeler dans une transaction : si une branche lève, la carte n'est pas
 * consommée et rien n'est écrit.
 */
export function resolve(
  db: Database,
  playerId: string,
  card: CardDefinition,
  input: EffectInput,
): EffectOutcome {
  const effect: CardEffect = card.effect;

  // Un joueur réduit au silence ne joue rien, pas même une carte défensive :
  // sinon Grand Froid n'aurait aucun effet sur qui a un Bouclier en main.
  if (isSilenced(db, playerId)) {
    throw new EffectError(
      'Tu es sous l’effet d’un Grand Froid : aucune carte jouable pour l’instant.',
      'SILENCE',
    );
  }

  switch (effect.kind) {
    /* ------------------------- Glace : protéger ------------------------- */

    case 'bonus_points': {
      const game = ownGame(db, playerId, input.gameId);
      const gained = applyPoints(db, game, card, playerId, effect.value);
      return {
        summary: `${card.name} : +${gained} pts, game portée à ${game.score}.`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'shield': {
      grantEffect(db, playerId, 'BOUCLIER', card.id, effect.hours);
      return {
        summary: `${card.name} : protégé des malus pendant ${effect.hours} h.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'freeze_game': {
      const game = ownGame(db, playerId, input.gameId);
      game.frozen = true;
      return {
        summary: `${card.name} : game à ${game.score} pts gelée, plus aucun malus ne l’atteint.`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'undo_last_malus': {
      const since = Date.now() - effect.withinHours * 60 * 60 * 1000;

      // On cherche le malus le plus récent encore annulable, sur toutes les
      // games du joueur : un malus est un effet appliqué par quelqu'un d'autre.
      let bestGame: Game | null = null;
      let bestEntry: AppliedEffect | null = null;

      for (const game of db.games.filter((g) => g.playerId === playerId)) {
        for (const entry of game.applied) {
          if (entry.undone) continue;
          if (entry.byPlayerId === playerId) continue;
          if (entry.points >= 0) continue;
          if (new Date(entry.at).getTime() < since) continue;
          if (!bestEntry || new Date(entry.at) > new Date(bestEntry.at)) {
            bestEntry = entry;
            bestGame = game;
          }
        }
      }

      if (!bestEntry || !bestGame) {
        throw new EffectError(
          `Aucun malus subi dans les ${effect.withinHours} dernières heures.`,
          'RIEN_A_ANNULER',
        );
      }

      const restored = -bestEntry.points;
      bestEntry.undone = true;
      bestGame.bonusPoints += restored;
      recomputeGame(db, bestGame);

      const origin = getCard(bestEntry.cardId);
      return {
        summary: `${card.name} : ${origin ? origin.name : 'malus'} annulé, +${restored} pts rendus.`,
        affectedGameId: bestGame.id,
        targetPlayerId: null,
      };
    }

    case 'shield_and_freeze_best': {
      grantEffect(db, playerId, 'BOUCLIER', card.id, effect.hours);
      const [best] = ranked(db, playerId);
      if (best) best.frozen = true;
      return {
        summary: best
          ? `${card.name} : protégé ${effect.hours} h, meilleure game (${best.score} pts) gelée.`
          : `${card.name} : protégé ${effect.hours} h. Aucune game à geler pour l’instant.`,
        affectedGameId: best ? best.id : null,
        targetPlayerId: null,
      };
    }

    case 'freeze_top_games': {
      const top = ranked(db, playerId).slice(0, effect.count);
      if (top.length === 0) throw new EffectError('Aucune game à geler.', 'AUCUNE_GAME');
      for (const game of top) game.frozen = true;
      return {
        summary: `${card.name} : tes ${top.length} meilleures games sont gelées.`,
        affectedGameId: top[0].id,
        targetPlayerId: null,
      };
    }

    /* ----------------------- Tempête : amplifier ------------------------ */

    case 'points_per_kill': {
      const game = ownGame(db, playerId, input.gameId);
      if (game.frozen) throw new EffectError('Cette game est gelée.', 'GAME_GELEE');
      const raw = Math.min(effect.cap, game.kills * effect.perKill);
      const gained = applyPoints(db, game, card, playerId, raw);
      return {
        summary: `${card.name} : ${game.kills} kills → +${gained} pts (game à ${game.score}).`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'kill_multiplier': {
      const game = ownGame(db, playerId, input.gameId);
      if (game.frozen) throw new EffectError('Cette game est gelée.', 'GAME_GELEE');
      // Le multiplicateur devient un bonus plafonné : c'est mathématiquement
      // équivalent, et ça interdit d'empiler deux multiplicateurs.
      const raw = Math.min(effect.cap, Math.round(game.kills * (effect.value - 1)));
      const gained = applyPoints(db, game, card, playerId, raw);
      return {
        summary: `${card.name} : ×${effect.value} sur ${game.kills} kills → +${gained} pts (game à ${game.score}).`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'points_per_kill_above': {
      const game = ownGame(db, playerId, input.gameId);
      if (game.frozen) throw new EffectError('Cette game est gelée.', 'GAME_GELEE');
      const over = Math.max(0, game.kills - effect.threshold);
      if (over === 0) {
        throw new EffectError(
          `${card.name} ne récompense que les games au-delà de ${effect.threshold} kills.`,
          'CIBLE_INVALIDE',
        );
      }
      const raw = Math.min(effect.cap, over * effect.perKill);
      const gained = applyPoints(db, game, card, playerId, raw);
      return {
        summary: `${card.name} : ${over} kills au-delà du ${effect.threshold}ᵉ → +${gained} pts.`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'double_placement': {
      const game = ownGame(db, playerId, input.gameId);
      if (game.frozen) throw new EffectError('Cette game est gelée.', 'GAME_GELEE');
      if (game.placement === null) {
        throw new EffectError(
          `${card.name} ne s’applique qu’à une game classée dans le Top 3.`,
          'CIBLE_INVALIDE',
        );
      }
      // Doubler les points de classement revient à les ajouter une fois de plus.
      const bonus = { 1: 20, 2: 15, 3: 8 }[game.placement];
      const gained = applyPoints(db, game, card, playerId, bonus);
      return {
        summary: `${card.name} : Top ${game.placement} doublé, +${gained} pts (game à ${game.score}).`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    /* ------------------------ Aurore : économie ------------------------- */

    case 'snowflakes': {
      credit(db, playerId, effect.value, 'CARTE', card.id);
      return {
        summary: `${card.name} : +${effect.value} flocons.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'boon': {
      grantBoon(db, playerId, effect.boon, effect.uses, effect.value ?? null, card.id);
      return {
        summary: `${card.name} : faveur active pour ${effect.uses} utilisation(s).`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'snowflakes_and_boon': {
      credit(db, playerId, effect.snowflakes, 'CARTE', card.id);
      grantBoon(db, playerId, effect.boon, effect.uses, effect.value ?? null, card.id);
      return {
        summary: `${card.name} : +${effect.snowflakes} flocons, et ta prochaine ouverture est garantie.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    /* ---------------------- Solstice : interaction ---------------------- */

    case 'delete_worst_game': {
      const games = countedGames(db, playerId).filter((g) => !g.frozen);
      if (games.length === 0) throw new EffectError('Aucune game à supprimer.', 'AUCUNE_GAME');
      const worst = games.reduce((low, g) => (g.score < low.score ? g : low), games[0]);
      db.games = db.games.filter((g) => g.id !== worst.id);
      return {
        summary: `${card.name} : pire game (${worst.score} pts) supprimée.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'strike_best': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new EffectError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);

      const open = ranked(db, targetId).filter((g) => !g.frozen);
      if (open.length === 0) {
        throw new EffectError('Toutes ses games sont gelées ou il n’en a aucune.', 'GAME_GELEE');
      }

      const game = open[0];
      const lost = applyPoints(db, game, card, playerId, -effect.points);
      return {
        summary: `${card.name} : ${lost} pts sur sa meilleure game (désormais ${game.score}).`,
        affectedGameId: game.id,
        targetPlayerId: targetId,
      };
    }

    case 'strike_top': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new EffectError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);

      const open = ranked(db, targetId)
        .filter((g) => !g.frozen)
        .slice(0, effect.count);
      if (open.length === 0) {
        throw new EffectError('Toutes ses games sont gelées ou il n’en a aucune.', 'GAME_GELEE');
      }

      let total = 0;
      for (const game of open) total += applyPoints(db, game, card, playerId, -effect.points);
      return {
        summary: `${card.name} : ${total} pts répartis sur ses ${open.length} meilleures games.`,
        affectedGameId: open[0].id,
        targetPlayerId: targetId,
      };
    }

    case 'cancel_last_boost': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new EffectError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);

      // Le dernier bonus que la cible s'est appliqué à elle-même. Par
      // construction, on ne peut jamais retirer plus que ce que cette carte
      // avait donné.
      let bestGame: Game | null = null;
      let bestEntry: AppliedEffect | null = null;

      for (const game of db.games.filter((g) => g.playerId === targetId && !g.frozen)) {
        for (const entry of game.applied) {
          if (entry.undone || entry.points <= 0) continue;
          if (entry.byPlayerId !== targetId) continue;
          if (!bestEntry || new Date(entry.at) > new Date(bestEntry.at)) {
            bestEntry = entry;
            bestGame = game;
          }
        }
      }

      if (!bestEntry || !bestGame) {
        throw new EffectError(
          'Cet adversaire n’a aucun bonus de carte annulable pour l’instant.',
          'RIEN_A_ANNULER',
        );
      }

      const removed = bestEntry.points;
      bestEntry.undone = true;
      bestGame.bonusPoints -= removed;
      // On journalise l'annulation elle-même, pour que Second Souffle puisse
      // la rendre à son tour.
      bestGame.applied.push({
        id: newId(),
        cardId: card.id,
        byPlayerId: playerId,
        points: -removed,
        at: new Date().toISOString(),
        undone: false,
      });
      recomputeGame(db, bestGame);

      const origin = getCard(bestEntry.cardId);
      return {
        summary: `${card.name} : ${origin ? origin.name : 'bonus'} annulé, −${removed} pts (game à ${bestGame.score}).`,
        affectedGameId: bestGame.id,
        targetPlayerId: targetId,
      };
    }

    case 'silence': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new EffectError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);
      grantEffect(db, targetId, 'SILENCE', card.id, effect.hours);
      return {
        summary: `${card.name} : cet adversaire ne peut plus jouer de carte pendant ${effect.hours} h. Aucun point retiré.`,
        affectedGameId: null,
        targetPlayerId: targetId,
      };
    }
  }
}

/** Tirage aléatoire serveur, jamais fourni par le client. */
export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[randomInt(items.length)];
}

/* ------------------------- Consommation des faveurs ---------------------- */

/** Consomme une utilisation d'une faveur, et la retire si elle est épuisée. */
export function consumeBoon(db: Database, playerId: string, kind: BoonKind): PlayerBoon | null {
  const boon = db.boons.find((b) => b.playerId === playerId && b.kind === kind && b.remaining > 0);
  if (!boon) return null;

  boon.remaining -= 1;
  if (boon.remaining <= 0) db.boons = db.boons.filter((b) => b.id !== boon.id);
  return boon;
}

/** Faveur active, sans la consommer. */
export function peekBoon(db: Database, playerId: string, kind: BoonKind): PlayerBoon | null {
  return db.boons.find((b) => b.playerId === playerId && b.kind === kind && b.remaining > 0) ?? null;
}
