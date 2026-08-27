import 'server-only';

/**
 * Tirage aléatoire des boosters — strictement serveur.
 *
 * L'import `server-only` en tête fait échouer la compilation si ce module est
 * jamais tiré dans un bundle client : le joueur ne doit pouvoir ni observer ni
 * rejouer le tirage. La source d'entropie est `crypto.randomInt`, uniforme et
 * non prédictible, contrairement à `Math.random()`.
 */

import { randomInt } from 'node:crypto';
import { CARDS } from './catalog';
import { RARITY_ORDER, WEIGHT_TOTAL } from './rules';
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
 * Tirage pondéré sur 100 000.
 *
 * Travailler en entiers plutôt qu'en pourcentages flottants permet d'exprimer
 * 0,02 % exactement, et rend le tirage vérifiable : la somme des poids doit
 * valoir précisément le total, sinon on lève plutôt que de biaiser en silence.
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

/** Cartes à effet, indexées par rareté. */
export const EFFECT_BY_RARITY = CARDS.reduce(
  (acc, card) => {
    (acc[card.rarity] ??= []).push(card.id);
    return acc;
  },
  {} as Record<Rarity, string[]>,
);

/**
 * Tire une carte d'un pool, en redescendant de rareté si le palier est vide.
 *
 * Le cas se produit vraiment : au lancement de la saison, aucune carte Joueur
 * n'est encore Légendaire. Sans ce repli, un emplacement de collection tombant
 * sur une rareté inhabitée ferait échouer toute l'ouverture — et le joueur
 * aurait payé pour rien.
 */
function pickFromPool(pool: Record<Rarity, string[]>, wanted: Rarity): string | null {
  const ladder: Rarity[] = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
  const from = ladder.indexOf(wanted);
  for (let i = from; i < ladder.length; i += 1) {
    const candidates = pool[ladder[i]];
    if (candidates && candidates.length > 0) return pick(candidates);
  }
  return null;
}

/**
 * Ouvre un booster et retourne les identifiants de cartes obtenus.
 *
 * Chaque emplacement tire sa rareté dans la table du booster, puis une carte
 * dans le pool correspondant à sa nature. La garantie ne porte que sur les
 * emplacements d'effet : promettre « une super rare » et livrer une carte
 * Joueur super rare ne serait pas ce que le joueur croit acheter.
 *
 * La garantie est appliquée après coup, sur un emplacement au hasard. On ne
 * « re-roll » jamais l'ensemble, ce qui introduirait un biais difficile à
 * auditer.
 */
export function rollBooster(
  booster: BoosterDefinition,
  collectionPool: Record<Rarity, string[]> = {} as Record<Rarity, string[]>,
): string[] {
  const effetRarities: Rarity[] = [];
  for (let i = 0; i < booster.slots.effet; i += 1) {
    effetRarities.push(pickWeighted(booster.weights));
  }

  if (booster.guaranteed && effetRarities.length > 0) {
    const floor = RARITY_ORDER[booster.guaranteed];
    const satisfied = effetRarities.some((r) => RARITY_ORDER[r] >= floor);
    if (!satisfied) effetRarities[secureInt(effetRarities.length)] = booster.guaranteed;
  }

  const drawn: string[] = [];
  for (const rarity of effetRarities) {
    const card = pickFromPool(EFFECT_BY_RARITY, rarity);
    if (card) drawn.push(card);
  }

  for (let i = 0; i < booster.slots.collection; i += 1) {
    const card = pickFromPool(collectionPool, pickWeighted(booster.weights));
    // Pool de collection vide au tout début de la saison : l'emplacement se
    // reporte sur une carte à effet plutôt que de rendre un booster amputé.
    drawn.push(card ?? pickFromPool(EFFECT_BY_RARITY, 'C')!);
  }

  return drawn;
}

/** Vérifie qu'une table de poids est exploitable. Utilisée par les tests. */
export function weightsAreValid(weights: Record<Rarity, number>): boolean {
  const values = Object.values(weights) as number[];
  if (values.some((w) => !Number.isInteger(w) || w < 0)) return false;
  return values.reduce((a, b) => a + b, 0) === WEIGHT_TOTAL;
}
