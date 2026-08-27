import 'server-only';

/**
 * Tirage aléatoire des boosters — strictement serveur.
 *
 * L'import `server-only` en tête fait échouer la compilation si ce module est
 * jamais tiré dans un bundle client : le joueur ne doit pouvoir ni observer ni
 * rejouer le tirage. La source d'entropie est `crypto.randomInt`, qui est
 * uniforme et non prédictible, contrairement à `Math.random()`.
 */

import { randomInt } from 'node:crypto';
import { CARDS, getBooster } from './catalog';
import { RARITY_ORDER } from './rules';
import type { BoosterDefinition, Rarity } from './types';

/** Entier uniforme dans [0, maxExclusive). */
export function secureInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('secureInt attend un entier strictement positif');
  }
  return randomInt(maxExclusive);
}

/** Élément uniforme d'un tableau non vide. */
export function pick<T>(items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick sur un tableau vide');
  return items[secureInt(items.length)];
}

/**
 * Tirage pondéré. Les poids sont des entiers ; un poids nul ou négatif exclut
 * simplement l'entrée.
 */
export function pickWeighted<K extends string>(weights: Record<K, number>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
  if (entries.length === 0) throw new RangeError('pickWeighted sans poids exploitable');
  const total = entries.reduce((sum, [, w]) => sum + Math.trunc(w), 0);
  let roll = secureInt(total);
  for (const [key, weight] of entries) {
    roll -= Math.trunc(weight);
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

const CARDS_BY_RARITY = CARDS.reduce(
  (acc, card) => {
    (acc[card.rarity] ??= []).push(card.id);
    return acc;
  },
  {} as Record<Rarity, string[]>,
);

/**
 * Ouvre un booster et retourne les identifiants de cartes obtenus.
 *
 * La rareté garantie est appliquée après coup : si aucun tirage n'a atteint le
 * palier promis, un emplacement au hasard est relevé à ce palier. On ne
 * « re-roll » jamais l'ensemble, ce qui garderait un biais difficile à auditer.
 */
export function rollBooster(booster: BoosterDefinition): string[] {
  const rarities: Rarity[] = [];
  for (let i = 0; i < booster.cardCount; i += 1) {
    rarities.push(pickWeighted(booster.weights));
  }

  if (booster.guaranteed) {
    const floor = RARITY_ORDER[booster.guaranteed];
    const alreadySatisfied = rarities.some((r) => RARITY_ORDER[r] >= floor);
    if (!alreadySatisfied) {
      rarities[secureInt(rarities.length)] = booster.guaranteed;
    }
  }

  return rarities.map((rarity) => pick(CARDS_BY_RARITY[rarity]));
}

/** Variante par identifiant, utilisée par la route d'ouverture. */
export function rollBoosterById(boosterId: string): string[] | null {
  const booster = getBooster(boosterId);
  return booster ? rollBooster(booster) : null;
}
