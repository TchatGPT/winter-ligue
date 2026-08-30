/**
 * Les flocons : la monnaie de la saison.
 *
 * Ils ne sont gagnés qu'en jouant, et dépensés en boosters ou à l'hôtel des
 * ventes. Chaque mouvement passe par le grand livre (`LedgerEntry`) : le solde
 * d'un joueur doit toujours être reconstructible à partir de son historique,
 * ce qui rend une manipulation détectable.
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
 * s'est passé en jeu. Elle a porté un temps un bonus tiré de la collection —
 * retiré avec le reste des avantages permanents, qui faisaient rapporter
 * davantage à qui avait ouvert davantage.
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
  | 'CARTE'
  | 'ACHAT_BOOSTER'
  | 'VENTE_MARCHE'
  | 'ACHAT_MARCHE'
  | 'ENCHERE_BLOQUEE'
  | 'ENCHERE_REMBOURSEE'
  | 'AJUSTEMENT_ADMIN';

/**
 * Vérifie qu'un débit est possible. On refuse tout solde négatif : c'est la
 * garantie qu'aucune séquence de requêtes concurrentes ne peut créer des
 * flocons à partir de rien.
 */
export function canAfford(balance: number, amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && balance >= amount;
}
