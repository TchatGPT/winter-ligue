/**
 * Les flocons : la monnaie de la saison.
 *
 * Ils se gagnent en jouant, par le cadeau du jour et les codes cadeaux, se
 * misent dans les affrontements, et poussent les taux quand un pack s'ouvre pour soi. Chaque
 * mouvement passe par le grand livre (`LedgerEntry`) : le solde d'un joueur
 * doit toujours être reconstructible à partir de son historique, ce qui rend
 * une manipulation détectable.
 */

import { ECONOMY } from './rules';
import type { Placement } from './types';

export interface SnowflakeReward {
  killReward: number;
  placementReward: number;
  participation: number;
  total: number;
}

/**
 * Flocons gagnés pour une game.
 *
 * Les mêmes règles pour tout le monde : la récompense ne dépend que de ce qui
 * s'est passé en jeu.
 */
export function rewardForGame(kills: number, placement: Placement): SnowflakeReward {
  const safeKills = Math.max(0, Math.trunc(kills));
  const killReward = safeKills * ECONOMY.perKill;
  const placementReward =
    placement === null ? 0 : (ECONOMY.perPlacement[String(placement) as '1' | '2' | '3'] ?? 0);
  const participation = ECONOMY.participation;
  return {
    killReward,
    placementReward,
    participation,
    total: killReward + placementReward + participation,
  };
}

export type LedgerReason =
  | 'INSCRIPTION'
  | 'GAME'
  | 'SUBS_TWITCH'
  /** Des flocons donnés par une carte de pack. */
  | 'CARTE'
  /** Mise engagée dans un affrontement, débitée à la création ou à l'entrée. */
  | 'MISE_BATAILLE'
  /** Le pot d'un affrontement, versé au vainqueur. */
  | 'GAIN_BATAILLE'
  /** Mise rendue quand un affrontement est annulé faute d'adversaire. */
  | 'REMBOURSEMENT_BATAILLE'
  | 'AJUSTEMENT_ADMIN'
  /** Des flocons récupérés avec un code cadeau ; la référence est le code. */
  | 'CODE_CADEAU'
  /** Le cadeau du jour ; la référence est le jour, à Paris. */
  | 'CADEAU_DU_JOUR';

/**
 * Vérifie qu'un débit est possible. On refuse tout solde négatif : c'est la
 * garantie qu'aucune séquence de requêtes concurrentes ne peut créer des
 * flocons à partir de rien.
 */
export function canAfford(balance: number, amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && balance >= amount;
}
