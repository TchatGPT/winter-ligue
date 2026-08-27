/**
 * Collection et bonus de famille — le volet « passif » du système de cartes.
 *
 * Une carte jouée est consommée, mais sa *découverte* est définitive : elle
 * reste inscrite dans la collection du joueur. Les bonus de famille sont donc
 * un acquis, jamais une dépense.
 *
 * Deux paliers par famille : 4 cartes sur 6 pour le bonus partiel, les 6 pour
 * le bonus plein. Exiger d'emblée les six rendrait le bonus hors d'atteinte —
 * la légendaire d'une famille ne sort qu'une ouverture sur mille.
 */

import { CARDS, THEMES } from './catalog';
import { BASE_RESERVE_SLOTS, SET_TIERS } from './rules';
import type { SetBonuses, ThemeId } from './types';

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Cartes composant chaque famille. */
const THEME_REQUIREMENTS: Record<ThemeId, string[]> = THEME_IDS.reduce(
  (acc, theme) => {
    acc[theme] = CARDS.filter((c) => c.theme === theme).map((c) => c.id);
    return acc;
  },
  {} as Record<ThemeId, string[]>,
);

type BonusDelta = Partial<Omit<SetBonuses, 'completed' | 'partial'>>;

/** Bonus accordé à chaque palier. Le plein remplace le partiel, il ne s'ajoute pas. */
const THEME_BONUS: Record<ThemeId, { partial: BonusDelta; full: BonusDelta }> = {
  glace: {
    partial: { handSlots: 8 },
    full: { handSlots: 20 },
  },
  tempete: {
    partial: { killMultiplier: 0.03 },
    full: { killMultiplier: 0.07 },
  },
  aurore: {
    partial: { snowflakesPerGame: 8 },
    full: { snowflakesPerGame: 20 },
  },
  solstice: {
    partial: { shopDiscount: 0.08 },
    full: { shopDiscount: 0.18, marketFeeDiscount: 0.5 },
  },
};

export interface ThemeProgress {
  theme: ThemeId;
  owned: string[];
  missing: string[];
  /** 4 cartes sur 6 atteintes. */
  partial: boolean;
  /** Les 6 cartes possédées. */
  complete: boolean;
  /** Entre 0 et 1. */
  ratio: number;
  /** Cartes restantes avant le prochain palier, 0 si le plein est atteint. */
  toNextTier: number;
}

/** Avancement de la collection, famille par famille. */
export function themeProgress(discovered: readonly string[]): ThemeProgress[] {
  const set = new Set(discovered);
  return THEME_IDS.map((theme) => {
    const required = THEME_REQUIREMENTS[theme];
    const owned = required.filter((id) => set.has(id));
    const missing = required.filter((id) => !set.has(id));
    const complete = missing.length === 0;
    const partial = owned.length >= SET_TIERS.partial;

    return {
      theme,
      owned,
      missing,
      partial,
      complete,
      ratio: required.length === 0 ? 0 : owned.length / required.length,
      toNextTier: complete
        ? 0
        : partial
          ? SET_TIERS.full - owned.length
          : SET_TIERS.partial - owned.length,
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
    partial: [],
  };

  for (const progress of themeProgress(discovered)) {
    if (!progress.partial) continue;

    const tier = progress.complete
      ? THEME_BONUS[progress.theme].full
      : THEME_BONUS[progress.theme].partial;

    if (progress.complete) bonuses.completed.push(progress.theme);
    else bonuses.partial.push(progress.theme);

    bonuses.handSlots += tier.handSlots ?? 0;
    bonuses.killMultiplier += tier.killMultiplier ?? 0;
    bonuses.snowflakesPerGame += tier.snowflakesPerGame ?? 0;
    bonuses.shopDiscount += tier.shopDiscount ?? 0;
    bonuses.marketFeeDiscount += tier.marketFeeDiscount ?? 0;
  }

  // Garde-fous : même si le catalogue évolue, ces valeurs restent bornées.
  bonuses.shopDiscount = Math.min(0.9, bonuses.shopDiscount);
  bonuses.marketFeeDiscount = Math.min(1, bonuses.marketFeeDiscount);
  return bonuses;
}

/** Places de réserve d'un joueur, bonus de collection compris. */
export function handSlotsFor(discovered: readonly string[]): number {
  return BASE_RESERVE_SLOTS + setBonusesFor(discovered).handSlots;
}

/** Pourcentage de complétion global, pour l'affichage du profil. */
export function completionRatio(discovered: readonly string[]): number {
  const known = new Set(CARDS.map((c) => c.id));
  const valid = new Set(discovered.filter((id) => known.has(id)));
  return CARDS.length === 0 ? 0 : valid.size / CARDS.length;
}
