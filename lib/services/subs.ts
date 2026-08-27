import 'server-only';

/**
 * Économie des subs Twitch.
 *
 * Un seul point d'entrée : `addSubs()`. Il incrémente le compteur de saison,
 * détermine les paliers franchis et verse **à tous les joueurs actifs, à parts
 * égales**. Personne ne peut désigner le bénéficiaire d'un versement — c'est ce
 * qui empêche qu'une communauté généreuse achète le classement de son joueur.
 *
 * La seule chose qu'un gifteur peut orienter, c'est `giftCard()` : une carte
 * commune au hasard pour le joueur qu'il nomme. Visible à l'antenne, sans
 * portée compétitive.
 */

import type { Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { cardsOfRarity, getBooster } from '@/lib/domain/catalog';
import { rollBooster } from '@/lib/domain/rng';
import { crossedMilestones, nextMilestone, SUBS } from '@/lib/domain/rules';
import { secureInt } from '@/lib/domain/rng';
import { audit, credit } from './ledger';
import { recomputePlayerGames } from './league';

export class SubError extends Error {
  constructor(
    message: string,
    readonly code: 'DELTA_INVALIDE' | 'JOUEUR_INTROUVABLE' | 'QUOTA_ATTEINT',
  ) {
    super(message);
    this.name = 'SubError';
  }
}

export interface AddSubsResult {
  totalSubs: number;
  /** Libellés des paliers franchis, dans l'ordre. */
  milestones: string[];
  snowflakesEach: number;
  boostersEach: string[];
  recipients: number;
  /** Prochain palier, pour la barre de progression. */
  next: ReturnType<typeof nextMilestone>;
}

/**
 * Ajoute des subs et distribue ce que les paliers franchis prévoient.
 *
 * À appeler dans une transaction : compteur, versements et création des cartes
 * réussissent ou échouent ensemble.
 */
export function addSubs(db: Database, delta: number, actor: string): AddSubsResult {
  if (!Number.isInteger(delta) || delta <= 0 || delta > 10_000) {
    throw new SubError('Nombre de subs invalide.', 'DELTA_INVALIDE');
  }

  const from = db.config.totalSubs;
  const to = from + delta;
  db.config.totalSubs = to;

  const crossed = crossedMilestones(from, to);
  const recipients = db.players.filter((p) => p.active);

  let snowflakesEach = 0;
  const boostersEach: string[] = [];

  for (const milestone of crossed) {
    if (milestone.kind === 'FLOCONS' && milestone.amount) {
      snowflakesEach += milestone.amount;
    } else if (milestone.kind === 'BOOSTER' && milestone.boosterId) {
      boostersEach.push(milestone.boosterId);
    }
  }

  for (const player of recipients) {
    if (snowflakesEach > 0) {
      credit(db, player.id, snowflakesEach, 'SUBS_TWITCH', String(to));
    }

    for (const boosterId of boostersEach) {
      const booster = getBooster(boosterId);
      if (!booster) continue;

      // Chaque joueur tire son propre booster : deux joueurs n'obtiennent pas
      // le même contenu, et le tirage reste serveur.
      const cardIds = rollBooster(booster);
      let discoveredSomething = false;

      for (const cardId of cardIds) {
        db.cards.push({
          id: newId(),
          playerId: player.id,
          cardId,
          obtainedAt: new Date().toISOString(),
          source: 'ADMIN',
          consumed: false,
          consumedAt: null,
          consumedOnGameId: null,
          consumedOnPlayerId: null,
          listingId: null,
          consumeKey: null,
        });

        const known = db.discoveries.some((d) => d.playerId === player.id && d.cardId === cardId);
        if (!known) {
          db.discoveries.push({
            playerId: player.id,
            cardId,
            firstObtainedAt: new Date().toISOString(),
          });
          discoveredSomething = true;
        }
      }

      db.openings.push({
        id: newId(),
        playerId: player.id,
        boosterId,
        pricePaid: 0,
        cardIds,
        openedAt: new Date().toISOString(),
        idempotencyKey: `subs-${to}-${boosterId}-${player.id}`,
      });

      // Une famille vient peut-être d'être complétée : les scores en dépendent.
      if (discoveredSomething) recomputePlayerGames(db, player.id);
    }
  }

  const milestones = crossed.map((m) => m.label);

  if (crossed.length > 0) {
    db.subEvents.push({
      id: newId(),
      at: new Date().toISOString(),
      delta,
      totalAfter: to,
      milestones,
      snowflakesEach,
      boostersEach,
      recipients: recipients.length,
    });
  }

  audit(
    db,
    actor,
    'SUBS_AJOUTES',
    null,
    `+${delta} subs (total ${to})${milestones.length ? ` — ${milestones.join(', ')}` : ''}`,
  );

  return {
    totalSubs: to,
    milestones,
    snowflakesEach,
    boostersEach,
    recipients: recipients.length,
    next: nextMilestone(to),
  };
}

/**
 * Carte offerte à un joueur nommé par un gifteur.
 *
 * Toujours une commune, jamais des flocons : le geste est visible sans peser
 * sur le classement. Un quota journalier évite qu'un seul gifteur ne noie un
 * joueur de cartes.
 */
export function giftCard(db: Database, playerId: string, actor: string): string {
  const player = db.players.find((p) => p.id === playerId && p.active);
  if (!player) throw new SubError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const todayCount = db.cards.filter(
    (c) =>
      c.playerId === playerId &&
      c.source === 'ADMIN' &&
      new Date(c.obtainedAt).getTime() > since,
  ).length;

  if (todayCount >= SUBS.maxGiftedCardsPerDay) {
    throw new SubError(
      `Ce joueur a déjà reçu ${SUBS.maxGiftedCardsPerDay} cartes offertes aujourd’hui.`,
      'QUOTA_ATTEINT',
    );
  }

  const pool = cardsOfRarity('C');
  const card = pool[secureInt(pool.length)];

  db.cards.push({
    id: newId(),
    playerId,
    cardId: card.id,
    obtainedAt: new Date().toISOString(),
    source: 'ADMIN',
    consumed: false,
    consumedAt: null,
    consumedOnGameId: null,
    consumedOnPlayerId: null,
    listingId: null,
    consumeKey: null,
  });

  const known = db.discoveries.some((d) => d.playerId === playerId && d.cardId === card.id);
  if (!known) {
    db.discoveries.push({
      playerId,
      cardId: card.id,
      firstObtainedAt: new Date().toISOString(),
    });
    recomputePlayerGames(db, playerId);
  }

  audit(db, actor, 'CARTE_OFFERTE', playerId, `${card.name} (subs)`);
  return card.id;
}

/** État du compteur, pour la bannière publique. */
export function subsOverview(db: Database) {
  const next = nextMilestone(db.config.totalSubs);
  return {
    totalSubs: db.config.totalSubs,
    next,
    milestones: SUBS.milestones,
    recent: db.subEvents.slice(-6).reverse(),
  };
}
