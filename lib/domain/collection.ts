/**
 * Collection et bonus de famille — le volet « passif » du système de cartes.
 *
 * Une carte jouée est consommée, mais sa *découverte* est définitive : elle
 * reste inscrite dans la collection du joueur. Compléter les 4 cartes d'une
 * famille débloque donc un bonus permanent qu'aucune dépense ne fait perdre.
 */

import { CARDS, THEMES } from './catalog';
import { BASE_HAND_SLOTS } from './rules';
import type { SetBonuses, ThemeId } from './types';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Cartes requises pour compléter chaque famille. */
const THEME_REQUIREMENTS: Record<ThemeId, string[]> = THEME_IDS.reduce(
  (acc, theme) => {
    acc[theme] = CARDS.filter((c) => c.theme === theme).map((c) => c.id);
    return acc;
  },
  {} as Record<ThemeId, string[]>,
);

/** Bonus accordé par chaque famille complétée. */
const THEME_BONUS: Record<ThemeId, Partial<Omit<SetBonuses, 'completed'>>> = {
  glace: { handSlots: 1 },
  tempete: { killMultiplier: 0.05 },
  aurore: { snowflakesPerGame: 15 },
  solstice: { shopDiscount: 0.15, marketFeeDiscount: 0.5 },
};

export interface ThemeProgress {
  theme: ThemeId;
  owned: string[];
  missing: string[];
  complete: boolean;
  /** Entre 0 et 1. */
  ratio: number;
}

/** Avancement de la collection, famille par famille. */
export function themeProgress(discovered: readonly string[]): ThemeProgress[] {
  const set = new Set(discovered);
  return THEME_IDS.map((theme) => {
    const required = THEME_REQUIREMENTS[theme];
    const owned = required.filter((id) => set.has(id));
    const missing = required.filter((id) => !set.has(id));
    return {
      theme,
      owned,
      missing,
      complete: missing.length === 0,
      ratio: required.length === 0 ? 0 : owned.length / required.length,
    };
  });
}

/**
 * Bonus cumulés d'un joueur, dérivés uniquement de sa collection.
 *
 * Toujours recalculé à la volée : rien n'est stocké, donc rien n'est falsifiable
 * en écrivant directement dans la base.
 */
export function setBonusesFor(discovered: readonly string[]): SetBonuses {
  const bonuses: SetBonuses = {
    handSlots: 0,
    killMultiplier: 0,
    snowflakesPerGame: 0,
    shopDiscount: 0,
    marketFeeDiscount: 0,
    completed: [],
  };

  for (const progress of themeProgress(discovered)) {
    if (!progress.complete) continue;
    bonuses.completed.push(progress.theme);
    const bonus = THEME_BONUS[progress.theme];
    bonuses.handSlots += bonus.handSlots ?? 0;
    bonuses.killMultiplier += bonus.killMultiplier ?? 0;
    bonuses.snowflakesPerGame += bonus.snowflakesPerGame ?? 0;
    bonuses.shopDiscount += bonus.shopDiscount ?? 0;
    bonuses.marketFeeDiscount += bonus.marketFeeDiscount ?? 0;
  }

  // Garde-fous : même si le catalogue évolue, ces valeurs restent bornées.
  bonuses.shopDiscount = Math.min(0.9, bonuses.shopDiscount);
  bonuses.marketFeeDiscount = Math.min(1, bonuses.marketFeeDiscount);
  return bonuses;
}

/** Taille de main autorisée pour un joueur, bonus de collection compris. */
export function handSlotsFor(discovered: readonly string[]): number {
  return BASE_HAND_SLOTS + setBonusesFor(discovered).handSlots;
}

/** Pourcentage de complétion global, pour l'affichage du profil. */
export function completionRatio(discovered: readonly string[]): number {
  const set = new Set(discovered.filter((id) => CARDS.some((c) => c.id === id)));
  return CARDS.length === 0 ? 0 : set.size / CARDS.length;
}
