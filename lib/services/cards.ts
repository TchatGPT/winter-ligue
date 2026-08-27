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

import type { CardInstance, Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { boosterSize, getBooster, getCard } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { discountedPrice } from '@/lib/domain/economy';
import { rollBooster } from '@/lib/domain/rng';
import { audit, debit } from './ledger';
import { consumeBoon, isSilenced, resolve } from './effects';
import { handSlotsFor } from '@/lib/domain/collection';
import { bonusesFor, discoveredCardIds, recomputePlayerGames } from './league';
import { resolveCard } from './collection';

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
      | 'RESERVE_PLEINE'
      | 'SILENCE'
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

  // La réserve est plafonnée, et le plafond est vérifié *avant* le débit : on
  // ne fait jamais payer un booster qu'on refuse ensuite de livrer. C'est ce
  // qui donne du sens aux places de réserve, et ce qui pousse le surplus vers
  // l'hôtel des ventes au lieu de dormir dans les collections.
  const slots = handSlotsFor(discoveredCardIds(db, playerId));
  const held = handOf(db, playerId).length;
  if (held + boosterSize(booster) > slots) {
    throw new CardError(
      `Réserve pleine : ${held}/${slots} places occupées, il en faut ${boosterSize(booster)} de libres. Joue ou revends des cartes.`,
      'RESERVE_PLEINE',
    );
  }

  const before = new Set(bonusesFor(db, playerId).completed);
  const price = discountedPrice(booster.price, bonusesFor(db, playerId).shopDiscount);

  // Lève si le solde est insuffisant : la transaction est alors annulée.
  const balance = debit(db, playerId, price, 'ACHAT_BOOSTER', boosterId);

  // Une faveur « garantie » relève le palier promis par le booster, sans
  // jamais l'abaisser : ouvrir un Solstice avec une garantie SR en poche
  // conserve la garantie UR du booster.
  const boon = consumeBoon(db, playerId, 'GARANTIE_BOOSTER');
  const effective =
    boon && boon.value
      ? {
          ...booster,
          guaranteed:
            RARITY_ORDER[boon.value as Rarity] > RARITY_ORDER[booster.guaranteed ?? 'C']
              ? (boon.value as Rarity)
              : booster.guaranteed,
        }
      : booster;

  // Le pool de collection est reconstruit à chaque ouverture : un joueur qui
  // vient de s'inscrire entre immédiatement dans les tirages.
  const collectionPool = db.collectibles.reduce<Record<string, string[]>>((acc, item) => {
    (acc[item.rarity] ??= []).push(item.id);
    return acc;
  }, {});

  const cardIds = rollBooster(effective, collectionPool as never);
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

  if (isSilenced(db, playerId)) {
    throw new CardError(
      'Tu es sous l’effet d’un Grand Froid : aucune carte jouable pour l’instant.',
      'SILENCE',
    );
  }

  const instance = db.cards.find((c) => c.id === input.cardInstanceId);
  if (!instance || instance.playerId !== playerId) {
    throw new CardError('Carte introuvable dans ta réserve.', 'CARTE_INTROUVABLE');
  }
  if (instance.consumed) throw new CardError('Cette carte a déjà été jouée.', 'CARTE_DEJA_JOUEE');
  if (instance.listingId) {
    throw new CardError('Cette carte est en vente à l’hôtel des ventes.', 'CARTE_VERROUILLEE');
  }

  const card = getCard(instance.cardId);
  if (!card) {
    // Carte de collection : elle se possède, s'échange et se revend, mais ne
    // se joue pas. Le message doit le dire, pas laisser croire à un bug.
    const collectible = resolveCard(db, instance.cardId);
    throw new CardError(
      collectible
        ? `${collectible.name} est une carte de collection : elle n’a aucun effet à jouer.`
        : 'Carte inconnue au catalogue.',
      'CARTE_INTROUVABLE',
    );
  }

  // Toute la mécanique d'effet vit dans effects.ts. Si elle lève, la carte
  // n'est pas consommée : la transaction est annulée en amont.
  const outcome = resolve(db, playerId, card, {
    gameId: input.gameId,
    targetPlayerId: input.targetPlayerId,
  });

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
