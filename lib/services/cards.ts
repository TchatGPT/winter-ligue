import 'server-only';

/**
 * Boosters et résolution des cartes.
 *
 * Le client n'envoie jamais qu'un identifiant de copie de carte et, le cas
 * échéant, une cible. L'effet appliqué est relu dans le catalogue serveur, ce
 * qui rend impossible de « jouer » un ×2,5 avec une commune en trafiquant la
 * requête. Tout passe par une transaction : achat, tirage, débit et création
 * des copies réussissent ou échouent ensemble.
 */

import { randomInt } from 'node:crypto';
import type { CardInstance, Database, Game } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getBooster, getCard } from '@/lib/domain/catalog';
import { discountedPrice } from '@/lib/domain/economy';
import { rollBooster } from '@/lib/domain/rng';
import { GAME_LIMITS, MALUS_COOLDOWN_HOURS } from '@/lib/domain/rules';
import { clampMultiplier } from '@/lib/domain/scoring';
import type { CardDefinition } from '@/lib/domain/types';
import { audit, credit, debit } from './ledger';
import { bonusesFor, gamesOf, hasShield, recomputeGame, recomputePlayerGames } from './league';

export class CardError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BOUTIQUE_FERMEE'
      | 'BOOSTER_INCONNU'
      | 'CARTE_INTROUVABLE'
      | 'CARTE_VERROUILLEE'
      | 'CARTE_DEJA_JOUEE'
      | 'CIBLE_REQUISE'
      | 'CIBLE_INVALIDE'
      | 'AUCUNE_GAME'
      | 'GAME_GELEE'
      | 'CIBLE_PROTEGEE'
      | 'DELAI_MALUS'
      | 'MAIN_PLEINE'
      | 'FLOCONS_INSUFFISANTS',
  ) {
    super(message);
    this.name = 'CardError';
  }
}

/** Copies jouables d'un joueur : ni consommées, ni bloquées par une vente. */
export function handOf(db: Database, playerId: string): CardInstance[] {
  return db.cards.filter((c) => c.playerId === playerId && !c.consumed && c.listingId === null);
}

/** Enregistre la première obtention d'une carte. Cette découverte est définitive. */
function recordDiscovery(db: Database, playerId: string, cardId: string): boolean {
  const already = db.discoveries.some((d) => d.playerId === playerId && d.cardId === cardId);
  if (already) return false;
  db.discoveries.push({ playerId, cardId, firstObtainedAt: new Date().toISOString() });
  return true;
}

function createInstance(
  db: Database,
  playerId: string,
  cardId: string,
  source: CardInstance['source'],
): CardInstance {
  const instance: CardInstance = {
    id: newId(),
    playerId,
    cardId,
    obtainedAt: new Date().toISOString(),
    source,
    consumed: false,
    consumedAt: null,
    consumedOnGameId: null,
    consumedOnPlayerId: null,
    listingId: null,
    consumeKey: null,
  };
  db.cards.push(instance);
  return instance;
}

export interface OpenBoosterResult {
  boosterId: string;
  pricePaid: number;
  cards: { instanceId: string; cardId: string; isNew: boolean }[];
  balance: number;
  /** Familles complétées grâce à cette ouverture. */
  newlyCompleted: string[];
}

/**
 * Achète et ouvre un booster dans la même opération. Il n'existe volontairement
 * pas d'état « booster non ouvert » : cela éviterait toute tentative de rejouer
 * un tirage jugé mauvais.
 */
export function purchaseAndOpen(
  db: Database,
  playerId: string,
  boosterId: string,
  idempotencyKey: string,
): OpenBoosterResult {
  if (!db.config.shopOpen) {
    throw new CardError('La boutique est fermée.', 'BOUTIQUE_FERMEE');
  }

  // Idempotence : on rejoue la réponse précédente au lieu de débiter deux fois.
  const previous = db.openings.find(
    (o) => o.idempotencyKey === idempotencyKey && o.playerId === playerId,
  );
  if (previous) {
    const player = db.players.find((p) => p.id === playerId);
    return {
      boosterId: previous.boosterId,
      pricePaid: previous.pricePaid,
      cards: previous.cardIds.map((cardId) => ({ instanceId: '', cardId, isNew: false })),
      balance: player ? player.snowflakes : 0,
      newlyCompleted: [],
    };
  }

  const booster = getBooster(boosterId);
  if (!booster) throw new CardError('Booster inconnu.', 'BOOSTER_INCONNU');

  const before = new Set(bonusesFor(db, playerId).completed);
  const price = discountedPrice(booster.price, bonusesFor(db, playerId).shopDiscount);

  // Lève si le solde est insuffisant : la transaction est alors annulée.
  const balance = debit(db, playerId, price, 'ACHAT_BOOSTER', boosterId);

  const cardIds = rollBooster(booster);
  const cards = cardIds.map((cardId) => {
    const instance = createInstance(db, playerId, cardId, 'BOOSTER');
    const isNew = recordDiscovery(db, playerId, cardId);
    return { instanceId: instance.id, cardId, isNew };
  });

  db.openings.push({
    id: newId(),
    playerId,
    boosterId,
    pricePaid: price,
    cardIds,
    openedAt: new Date().toISOString(),
    idempotencyKey,
  });

  const after = bonusesFor(db, playerId).completed;
  const newlyCompleted = after.filter((theme) => !before.has(theme));
  // Un bonus de famille modifie le multiplicateur permanent : on réécrit les scores.
  if (newlyCompleted.length > 0) recomputePlayerGames(db, playerId);

  audit(db, playerId, 'OUVERTURE_BOOSTER', boosterId, `${cardIds.join(', ')} pour ${price} flocons`);

  return { boosterId, pricePaid: price, cards, balance, newlyCompleted };
}

/* ------------------------------ Jouer une carte -------------------------- */

export interface PlayCardResult {
  cardId: string;
  cardName: string;
  /** Résumé lisible de ce qui s'est passé, affiché au joueur et au chat. */
  summary: string;
  affectedGameId: string | null;
  targetPlayerId: string | null;
  balance: number;
}

function countedGames(db: Database, playerId: string): Game[] {
  return gamesOf(db, playerId).filter((g) => !g.skipped);
}

function bestGame(db: Database, playerId: string): Game | null {
  return countedGames(db, playerId).reduce<Game | null>(
    (best, g) => (!best || g.score > best.score ? g : best),
    null,
  );
}

function worstGame(db: Database, playerId: string): Game | null {
  return countedGames(db, playerId).reduce<Game | null>(
    (worst, g) => (!worst || g.score < worst.score ? g : worst),
    null,
  );
}

/** Sélection aléatoire côté serveur, jamais fournie par le client. */
function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[randomInt(items.length)];
}

/**
 * Vérifie qu'un malus peut atteindre sa cible : joueur existant, actif, non
 * protégé, et pas déjà visé par le même joueur récemment.
 */
function assertCanTarget(db: Database, attackerId: string, targetId: string): void {
  if (attackerId === targetId) {
    throw new CardError('Un malus se pose sur un adversaire, pas sur soi.', 'CIBLE_INVALIDE');
  }
  const target = db.players.find((p) => p.id === targetId);
  if (!target || !target.active) throw new CardError('Adversaire introuvable.', 'CIBLE_INVALIDE');
  if (hasShield(db, targetId)) {
    throw new CardError('Cet adversaire est protégé par un Bouclier de Givre.', 'CIBLE_PROTEGEE');
  }

  const since = Date.now() - MALUS_COOLDOWN_HOURS * 60 * 60 * 1000;
  const recent = db.cards.some(
    (c) =>
      c.playerId === attackerId &&
      c.consumed &&
      c.consumedOnPlayerId === targetId &&
      c.consumedAt !== null &&
      new Date(c.consumedAt).getTime() > since,
  );
  if (recent) {
    throw new CardError(
      `Tu as déjà visé ce joueur il y a moins de ${MALUS_COOLDOWN_HOURS} h.`,
      'DELAI_MALUS',
    );
  }
}

function ownGame(db: Database, playerId: string, gameId: string | undefined): Game {
  if (!gameId) throw new CardError('Cette carte demande de choisir une game.', 'CIBLE_REQUISE');
  const game = db.games.find((g) => g.id === gameId && g.playerId === playerId);
  if (!game) throw new CardError('Game introuvable.', 'CIBLE_INVALIDE');
  return game;
}

/**
 * Applique l'effet d'une carte. Chaque branche relit la définition serveur ;
 * `input` ne sert qu'à désigner des cibles.
 */
function applyEffect(
  db: Database,
  playerId: string,
  card: CardDefinition,
  input: { gameId?: string; targetPlayerId?: string },
): { summary: string; affectedGameId: string | null; targetPlayerId: string | null } {
  const effect = card.effect;

  switch (effect.kind) {
    case 'multiplier': {
      const game = ownGame(db, playerId, input.gameId);
      if (game.frozen) throw new CardError('Cette game est gelée.', 'GAME_GELEE');
      game.multiplier = clampMultiplier(game.multiplier * effect.value);
      game.appliedCardIds.push(card.id);
      recomputeGame(db, game);
      return {
        summary: `${card.name} appliquée : multiplicateur porté à ×${game.multiplier} (${game.score} pts).`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'bonus_points': {
      const game = ownGame(db, playerId, input.gameId);
      if (game.frozen) throw new CardError('Cette game est gelée.', 'GAME_GELEE');
      game.bonusPoints = Math.min(GAME_LIMITS.maxBonusPoints, game.bonusPoints + effect.value);
      game.appliedCardIds.push(card.id);
      recomputeGame(db, game);
      return {
        summary: `${card.name} appliquée : +${effect.value} pts (game à ${game.score} pts).`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'snowflakes': {
      credit(db, playerId, effect.value, 'CARTE', card.id);
      return {
        summary: `${card.name} : +${effect.value} flocons.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'freeze_game': {
      const game = ownGame(db, playerId, input.gameId);
      game.frozen = true;
      game.appliedCardIds.push(card.id);
      return {
        summary: `${card.name} : game à ${game.score} pts gelée.`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'freeze_best_game': {
      const game = bestGame(db, playerId);
      if (!game) throw new CardError('Aucune game à geler.', 'AUCUNE_GAME');
      game.frozen = true;
      game.bonusPoints += effect.bonusPoints;
      game.appliedCardIds.push(card.id);
      recomputeGame(db, game);
      return {
        summary: `${card.name} : meilleure game gelée et portée à ${game.score} pts.`,
        affectedGameId: game.id,
        targetPlayerId: null,
      };
    }

    case 'freeze_all_games': {
      const games = countedGames(db, playerId);
      if (games.length === 0) throw new CardError('Aucune game à geler.', 'AUCUNE_GAME');
      for (const g of games) {
        g.frozen = true;
        g.appliedCardIds.push(card.id);
      }
      return {
        summary: `${card.name} : ${games.length} game(s) gelée(s).`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'shield': {
      const expiresAt = new Date(Date.now() + effect.hours * 60 * 60 * 1000).toISOString();
      db.effects.push({
        id: newId(),
        playerId,
        kind: 'BOUCLIER',
        sourceCardId: card.id,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
      return {
        summary: `${card.name} : protégé contre les malus pendant ${effect.hours} h.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'delete_worst_game': {
      const game = worstGame(db, playerId);
      if (!game) throw new CardError('Aucune game à supprimer.', 'AUCUNE_GAME');
      if (game.frozen) throw new CardError('Ta pire game est gelée.', 'GAME_GELEE');
      db.games = db.games.filter((g) => g.id !== game.id);
      return {
        summary: `${card.name} : pire game (${game.score} pts) supprimée.`,
        affectedGameId: null,
        targetPlayerId: null,
      };
    }

    case 'steal_points': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new CardError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);
      const game = bestGame(db, targetId);
      if (!game) throw new CardError('Cet adversaire n’a aucune game.', 'AUCUNE_GAME');
      if (game.frozen) throw new CardError('La meilleure game de la cible est gelée.', 'GAME_GELEE');
      game.bonusPoints = Math.max(GAME_LIMITS.minBonusPoints, game.bonusPoints - effect.value);
      game.appliedCardIds.push(card.id);
      recomputeGame(db, game);
      return {
        summary: `${card.name} : −${effect.value} pts sur la meilleure game de l’adversaire.`,
        affectedGameId: game.id,
        targetPlayerId: targetId,
      };
    }

    case 'swap_random_game': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new CardError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);

      const mine = pickRandom(countedGames(db, playerId).filter((g) => !g.frozen));
      const theirs = pickRandom(countedGames(db, targetId).filter((g) => !g.frozen));
      if (!mine || !theirs) {
        throw new CardError('Pas assez de games non gelées pour échanger.', 'AUCUNE_GAME');
      }

      // On échange les propriétaires, pas les contenus : l'historique reste lisible.
      mine.playerId = targetId;
      theirs.playerId = playerId;
      mine.appliedCardIds.push(card.id);
      theirs.appliedCardIds.push(card.id);
      recomputeGame(db, mine);
      recomputeGame(db, theirs);

      return {
        summary: `${card.name} : ta game de ${mine.score} pts échangée contre celle de ${theirs.score} pts.`,
        affectedGameId: theirs.id,
        targetPlayerId: targetId,
      };
    }

    case 'copy_best_game': {
      const targetId = input.targetPlayerId;
      if (!targetId) throw new CardError('Choisis un adversaire.', 'CIBLE_REQUISE');
      assertCanTarget(db, playerId, targetId);
      const source = bestGame(db, targetId);
      if (!source) throw new CardError('Cet adversaire n’a aucune game.', 'AUCUNE_GAME');

      const copy: Game = {
        ...source,
        id: newId(),
        playerId,
        frozen: false,
        createdAt: new Date().toISOString(),
        note: `Copiée par ${card.name}`,
        appliedCardIds: [...source.appliedCardIds, card.id],
      };
      db.games.push(copy);
      recomputeGame(db, copy);

      return {
        summary: `${card.name} : meilleure game adverse (${copy.score} pts) copiée dans ton palmarès.`,
        affectedGameId: copy.id,
        targetPlayerId: targetId,
      };
    }
  }
}

/**
 * Joue une copie de carte. À appeler dans une transaction : si l'effet lève,
 * la carte n'est pas consommée.
 */
export function playCard(
  db: Database,
  playerId: string,
  input: { cardInstanceId: string; gameId?: string; targetPlayerId?: string; idempotencyKey: string },
): PlayCardResult {
  // Rejeu d'une requête déjà traitée : on ne consomme pas une seconde carte.
  const alreadyPlayed = db.cards.find(
    (c) => c.consumeKey === input.idempotencyKey && c.playerId === playerId,
  );
  if (alreadyPlayed) {
    const def = getCard(alreadyPlayed.cardId);
    const player = db.players.find((p) => p.id === playerId);
    return {
      cardId: alreadyPlayed.cardId,
      cardName: def ? def.name : alreadyPlayed.cardId,
      summary: 'Carte déjà jouée.',
      affectedGameId: alreadyPlayed.consumedOnGameId,
      targetPlayerId: alreadyPlayed.consumedOnPlayerId,
      balance: player ? player.snowflakes : 0,
    };
  }

  const instance = db.cards.find((c) => c.id === input.cardInstanceId);
  if (!instance || instance.playerId !== playerId) {
    throw new CardError('Carte introuvable dans ta main.', 'CARTE_INTROUVABLE');
  }
  if (instance.consumed) throw new CardError('Cette carte a déjà été jouée.', 'CARTE_DEJA_JOUEE');
  if (instance.listingId) {
    throw new CardError('Cette carte est en vente à l’hôtel des ventes.', 'CARTE_VERROUILLEE');
  }

  const card = getCard(instance.cardId);
  if (!card) throw new CardError('Carte inconnue au catalogue.', 'CARTE_INTROUVABLE');

  const outcome = applyEffect(db, playerId, card, input);

  instance.consumed = true;
  instance.consumedAt = new Date().toISOString();
  instance.consumedOnGameId = outcome.affectedGameId;
  instance.consumedOnPlayerId = outcome.targetPlayerId;
  instance.consumeKey = input.idempotencyKey;

  audit(db, playerId, 'CARTE_JOUEE', outcome.targetPlayerId, outcome.summary);

  const player = db.players.find((p) => p.id === playerId);
  return {
    cardId: card.id,
    cardName: card.name,
    summary: outcome.summary,
    affectedGameId: outcome.affectedGameId,
    targetPlayerId: outcome.targetPlayerId,
    balance: player ? player.snowflakes : 0,
  };
}
