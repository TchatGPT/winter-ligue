import 'server-only';

/**
 * Mouvements de flocons.
 *
 * Toutes les fonctions prennent la base *à l'intérieur* d'une transaction : ce
 * ne sont donc jamais des opérations isolées, mais des étapes d'une écriture
 * sérialisée. Aucun solde n'est modifié sans écrire la ligne correspondante au
 * grand livre, ce qui permet de rejouer et de vérifier un compte.
 */

import type { Database, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import type { LedgerReason } from '@/lib/domain/economy';
import { ECONOMY } from '@/lib/domain/rules';

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code: 'FLOCONS_INSUFFISANTS' | 'MONTANT_INVALIDE' | 'JOUEUR_INTROUVABLE',
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

function requirePlayer(db: Database, playerId: string): Player {
  const player = db.players.find((p) => p.id === playerId);
  if (!player) throw new LedgerError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
  return player;
}

function record(
  db: Database,
  player: Player,
  delta: number,
  reason: LedgerReason,
  refId: string | null,
): void {
  db.ledger.push({
    id: newId(),
    playerId: player.id,
    delta,
    balanceAfter: player.snowflakes,
    reason,
    refId,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Crédite un joueur. Le montant doit être un entier positif.
 *
 * Le solde ne dépasse jamais `ECONOMY.soldeMax` : ce qui déborde est perdu, et
 * c'est le delta réellement appliqué qui est écrit au grand livre — pas le
 * montant demandé —, sans quoi le solde ne se reconstruirait plus depuis
 * l'historique.
 */
export function credit(
  db: Database,
  playerId: string,
  amount: number,
  reason: LedgerReason,
  refId: string | null = null,
): number {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new LedgerError('Montant de crédit invalide.', 'MONTANT_INVALIDE');
  }
  const player = requirePlayer(db, playerId);
  const applied = Math.max(0, Math.min(amount, ECONOMY.soldeMax - player.snowflakes));
  player.snowflakes += applied;
  record(db, player, applied, reason, refId);
  return player.snowflakes;
}

/**
 * Débite un joueur. Lève si le solde est insuffisant — c'est cette exception
 * qui, combinée au rollback de la transaction, garantit qu'aucun achat ne peut
 * aboutir à découvert, même sous requêtes concurrentes.
 */
export function debit(
  db: Database,
  playerId: string,
  amount: number,
  reason: LedgerReason,
  refId: string | null = null,
): number {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new LedgerError('Montant de débit invalide.', 'MONTANT_INVALIDE');
  }
  const player = requirePlayer(db, playerId);
  if (player.snowflakes < amount) {
    throw new LedgerError('Flocons insuffisants.', 'FLOCONS_INSUFFISANTS');
  }
  player.snowflakes -= amount;
  record(db, player, -amount, reason, refId);
  return player.snowflakes;
}

/** Ajustement libre réservé à la modération, toujours tracé. */
export function adjust(
  db: Database,
  playerId: string,
  delta: number,
  refId: string | null = null,
): number {
  const player = requirePlayer(db, playerId);
  const applied = Math.min(Math.max(delta, -player.snowflakes), ECONOMY.soldeMax - player.snowflakes);
  player.snowflakes += applied;
  record(db, player, applied, 'AJUSTEMENT_ADMIN', refId);
  return player.snowflakes;
}

/**
 * Journalise une action sensible (modération, carte jouée, connexion
 * d'administration).
 *
 * Le journal est en **ajout seul** : il n'est plus rogné — il l'a été, aux cinq
 * mille dernières lignes, ce qui laissait quiconque enchaînait les actions
 * effacer les traces des précédentes. En base, un déclencheur refuse toute
 * modification et toute suppression.
 */
export function audit(
  db: Database,
  actor: string,
  action: string,
  targetId: string | null,
  detail: string,
): void {
  db.audit.push({
    id: newId(),
    actor,
    action,
    targetId,
    detail,
    at: new Date().toISOString(),
  });
}
