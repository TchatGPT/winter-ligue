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
import { getCard } from '@/lib/domain/catalog';
import { ECONOMY, RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { rollBooster } from '@/lib/domain/rng';
import { audit, credit, debit } from './ledger';
import { consumeBoon, isSilenced, resolve } from './effects';
import { resolveCard } from './collection';
import { resolvedBooster } from './boosters';

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
  cards: { instanceId: string; cardId: string; isNew: boolean; relance: boolean }[];
  balance: number;
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
      // La relance est relue du journal, et non retirée : rejouer la requête
      // doit rendre exactement la même ouverture, mise en scène comprise.
      cards: previous.cardIds.map((cardId, i) => ({
        instanceId: '',
        cardId,
        isNew: false,
        relance: (previous.relances ?? []).includes(i),
      })),
      balance: player ? player.snowflakes : 0,
    };
  }

  /*
   * Le booster **réglé**, et non celui du catalogue.
   *
   * C'est la ligne qui compte dans tout le réglage d'économie : elle porte le
   * prix débité et la table de raretés qui sert au tirage. Lire le catalogue ici
   * ferait payer le prix modifié et tirer avec les taux d'origine — l'écran et
   * le serveur raconteraient deux choses différentes, ce qui est pire que de ne
   * rien pouvoir régler.
   */
  const booster = resolvedBooster(db, boosterId);
  if (!booster) throw new CardError('Booster inconnu.', 'BOOSTER_INCONNU');

  // Il n'y a plus de plafond de détention : la réserve a été retirée en même
  // temps que les bonus de collection qui l'agrandissaient. Un joueur garde ce
  // qu'il veut, et c'est l'intérêt de jouer ou de revendre qui alimente le
  // marché, plus la contrainte de place.
  const price = booster.price;

  // Lève si le solde est insuffisant : la transaction est alors annulée.
  const balance = debit(db, playerId, price, 'ACHAT_BOOSTER', boosterId);

  // Une faveur « garantie » relève le palier promis par le booster, sans
  // jamais l'abaisser : ouvrir un Everest avec une garantie SR en poche
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

  const { cards: cardIds, relances } = rollBooster(effective, collectionPool as never);
  const cards = cardIds.map((cardId, i) => {
    const instance = createInstance(db, playerId, cardId, 'BOOSTER');
    const isNew = recordDiscovery(db, playerId, cardId);
    // La relance est déjà faite : ce drapeau ne sert qu'à ce que l'écran la
    // rejoue en images. Le client ne peut ni la provoquer ni la refuser.
    return { instanceId: instance.id, cardId, isNew, relance: relances.includes(i) };
  });

  db.openings.push({
    id: newId(),
    playerId,
    boosterId,
    pricePaid: price,
    cardIds,
    relances,
    openedAt: new Date().toISOString(),
    idempotencyKey,
  });

  audit(db, playerId, 'OUVERTURE_BOOSTER', boosterId, `${cardIds.join(', ')} pour ${price} flocons`);

  return { boosterId, pricePaid: price, cards, balance };
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

/* ------------------------------- La défausse ------------------------------ */

/**
 * Détruit une carte de la réserve et rend un flocon.
 *
 * ## Pourquoi un flocon, et pas une fraction du prix
 *
 * La défausse n'est pas une revente : c'est une sortie pour les doublons dont
 * personne ne veut, pas même au marché. Un gain proportionnel en ferait un
 * rendement — on ouvrirait des sachets pour défausser — et il court-circuiterait
 * le prix plancher de l'hôtel des ventes, qui est la vraie manière de valoriser
 * une carte. Le montant vit dans `ECONOMY.defausse`, et nulle part ailleurs.
 *
 * ## L'exemplaire est retiré, la découverte reste
 *
 * On supprime l'exemplaire au lieu de le marquer consommé : une carte
 * consommée reste dans l'historique d'une game, ce qui n'est pas le cas ici —
 * elle n'a rien fait, elle a disparu. La découverte, elle, est définitive : on
 * l'a bien eue une fois, et le compteur « 36 / 36 » ne doit pas reculer parce
 * qu'on a fait le ménage.
 */
export function defausseCarte(
  db: Database,
  playerId: string,
  cardInstanceId: string,
): { gain: number; balance: number } {
  const index = db.cards.findIndex((c) => c.id === cardInstanceId);
  const instance = index >= 0 ? db.cards[index] : undefined;

  if (!instance || instance.playerId !== playerId || instance.consumed) {
    throw new CardError('Carte introuvable dans ta réserve.', 'CARTE_INTROUVABLE');
  }
  // Une carte en vente est sous séquestre : la défausser laisserait une vente
  // active pointant vers un exemplaire qui n'existe plus.
  if (instance.listingId) {
    throw new CardError(
      'Cette carte est en vente. Annule la vente avant de la défausser.',
      'CARTE_VERROUILLEE',
    );
  }

  db.cards.splice(index, 1);
  const balance = credit(db, playerId, ECONOMY.defausse, 'DEFAUSSE_CARTE', instance.cardId);
  audit(db, playerId, 'DEFAUSSE', instance.id, instance.cardId);

  return { gain: ECONOMY.defausse, balance };
}
