import 'server-only';

/**
 * Tirage aléatoire des packs et des affrontements — strictement serveur.
 *
 * L'import `server-only` en tête fait échouer la compilation si ce module est
 * jamais tiré dans un bundle client : personne ne doit pouvoir ni observer ni
 * rejouer le tirage. La source d'entropie est `crypto.randomInt`, uniforme et
 * non prédictible, contrairement à `Math.random()`.
 */

import { randomInt } from 'node:crypto';
import { CARDS, poolDuPack } from './catalog';
import { WEIGHT_TOTAL, WINTER_SPIN } from './rules';
import type { PackDefinition, Rarity } from './types';

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

/** Toutes les cartes, indexées par rareté. Le pool des affrontements. */
export const CARDS_BY_RARITY = CARDS.reduce(
  (acc, card) => {
    (acc[card.rarity] ??= []).push(card.id);
    return acc;
  },
  {} as Record<Rarity, string[]>,
);

/**
 * Tire une carte d'un pool, en redescendant de rareté si le palier est vide.
 *
 * Le cas existe : le pack Commu n'a pas de carte à chaque rareté. Sans ce
 * repli, un tirage tombant sur un palier inhabité ferait échouer l'ouverture,
 * à l'antenne, devant tout le monde.
 */
export function pickFromPool(pool: Record<Rarity, string[]>, wanted: Rarity): string | null {
  const ladder: Rarity[] = ['L', 'UR', 'R', 'C'];
  const from = ladder.indexOf(wanted);
  for (let i = from; i < ladder.length; i += 1) {
    const candidates = pool[ladder[i]];
    if (candidates && candidates.length > 0) return pick(candidates);
  }
  return null;
}

/**
 * Ouvre un pack : une rareté, puis une carte de ce pack à cette rareté.
 *
 * `weights` est la table **déjà poussée par la chance** du joueur, ou celle du
 * pack telle quelle pour un pack collectif. Ce module ne connaît ni le joueur
 * ni son solde : il tire dans ce qu'on lui donne.
 */
export function tirePack(pack: PackDefinition, weights: Record<Rarity, number>): string {
  const rarity = pickWeighted(weights);
  const card = pickFromPool(poolDuPack(pack.id), rarity);
  if (!card) throw new RangeError(`Le pack ${pack.id} n'a aucune carte.`);
  return card;
}

/** Ce qu'une manche d'affrontement produit : des cartes, et les emplacements rejoués. */
export interface TirageDuel {
  /** Les identifiants de cartes, dans l'ordre des emplacements. */
  cards: string[];
  /**
   * Les emplacements où le jeton Winter Spin est tombé.
   *
   * Le client s'en sert pour montrer la relance : la colonne s'arrête sur le
   * jeton, puis repart. Il ne la **décide** pas — elle est déjà faite ici.
   */
  relances: number[];
}

/**
 * Tire les cartes d'une manche d'affrontement, dans tout le catalogue.
 *
 * Le jeton se tire **avant** la rareté et séparément d'elle : la table garde sa
 * somme exacte. Quand il tombe, l'emplacement est rejoué avec la table du
 * jeton. **Une seule relance** — une chaîne sans borne serait invérifiable.
 */
export function tireDuel(weights: Record<Rarity, number>, cartes: number): TirageDuel {
  const cards: string[] = [];
  const relances: number[] = [];
  for (let i = 0; i < cartes; i += 1) {
    let rarity: Rarity;
    if (secureInt(WEIGHT_TOTAL) < WINTER_SPIN.chance) {
      relances.push(i);
      rarity = pickWeighted(WINTER_SPIN.weights);
    } else {
      rarity = pickWeighted(weights);
    }
    const card = pickFromPool(CARDS_BY_RARITY, rarity);
    if (card) cards.push(card);
  }
  return { cards, relances };
}

/** Vérifie qu'une table de poids est exploitable. Utilisée par les tests. */
export function weightsAreValid(weights: Record<Rarity, number>): boolean {
  const values = Object.values(weights) as number[];
  if (values.some((w) => !Number.isInteger(w) || w < 0)) return false;
  return values.reduce((a, b) => a + b, 0) === WEIGHT_TOTAL;
}
