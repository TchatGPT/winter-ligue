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
  collectionBonus: number;
  total: number;
}

/** Flocons gagnés pour une game, bonus de collection compris. */
export function rewardForGame(
  kills: number,
  placement: Placement,
  snowflakesPerGameBonus = 0,
): SnowflakeReward {
  const safeKills = Math.max(0, Math.trunc(kills));
  const killReward = safeKills * ECONOMY.perKill;
  const placementReward =
    placement === null ? 0 : (ECONOMY.perPlacement[String(placement) as '1' | '2' | '3'] ?? 0);
  const participation = ECONOMY.participation;
  const collectionBonus = Math.max(0, Math.trunc(snowflakesPerGameBonus));
  return {
    killReward,
    placementReward,
    participation,
    collectionBonus,
    total: killReward + placementReward + participation + collectionBonus,
  };
}

/**
 * Prix d'un booster après remise de collection.
 *
 * On calcule le *montant de la remise* puis on le soustrait, au lieu de
 * multiplier le prix par (1 − remise). La différence n'est pas cosmétique :
 * `1 - 0.18` vaut 0.8200000000000001 en virgule flottante, et un arrondi au
 * supérieur ferait payer un flocon de trop sur un prix rond.
 */
export function discountedPrice(basePrice: number, discount: number): number {
  const safeDiscount = Math.min(0.9, Math.max(0, discount));
  const off = Math.floor(basePrice * safeDiscount);
  return Math.max(1, basePrice - off);
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
  | 'TAXE_MARCHE'
  | 'AJUSTEMENT_ADMIN';

/**
 * Vérifie qu'un débit est possible. On refuse tout solde négatif : c'est la
 * garantie qu'aucune séquence de requêtes concurrentes ne peut créer des
 * flocons à partir de rien.
 */
export function canAfford(balance: number, amount: number): boolean {
  return Number.isInteger(amount) && amount >= 0 && balance >= amount;
}
