/**
 * Les batailles de boosters : qui gagne, et pourquoi.
 *
 * Module **pur** — aucune entrée-sortie, aucun accès base. Il ne décide pas non
 * plus du contenu des boosters : on lui donne les cartes déjà tirées par le
 * serveur, il dit qui l'emporte. C'est ce découpage qui rend la règle testable
 * sans monter une base, et vérifiable par n'importe qui lisant `tests/`.
 */

import { RARITY_ORDER } from './rules';
import type { Rarity } from './types';

/**
 * Le nombre de boosters qu'une bataille peut mettre en jeu, par camp.
 *
 * Le plancher à un : une bataille d'un seul booster est la plus courte et la
 * plus lisible, c'est celle par laquelle on découvre le mode. Le plafond à cinq
 * n'est pas une contrainte technique mais une contrainte d'écran — au-delà, le
 * rail dépasse la hauteur d'une fenêtre et l'on ne voit plus les deux camps en
 * même temps, ce qui est pourtant tout l'intérêt.
 */
export const MANCHES_MIN = 1;
export const MANCHES_MAX = 5;

/**
 * Ce que vaut une carte dans une bataille.
 *
 * Le rang de sa rareté, plus un : une commune vaut 1, une légendaire 6.
 *
 * ## Pourquoi la rareté et non la cote de marché
 *
 * La cote serait la « vraie » valeur, et c'est précisément le problème : elle
 * bouge tous les jours, et deux joueurs peuvent la gonfler en se vendant une
 * carte entre eux avant de lancer une bataille. Une règle de jeu qui dépend d'un
 * prix manipulable n'est plus une règle.
 *
 * La rareté, elle, est fixée par le catalogue, identique pour tout le monde, et
 * se lit d'un coup d'œil pendant que les rouleaux tournent — le spectateur sait
 * qui mène sans attendre le décompte.
 */
export function valeurCarte(rarity: string): number {
  return (RARITY_ORDER[rarity as Rarity] ?? 0) + 1;
}

/** Le score d'un camp : la somme de ce que valent ses cartes. */
export function scoreCamp(raretes: readonly string[]): number {
  return raretes.reduce((total, r) => total + valeurCarte(r), 0);
}

/** La meilleure carte d'un camp, en valeur. Zéro si le camp n'a rien. */
export function meilleureCarte(raretes: readonly string[]): number {
  return raretes.reduce((max, r) => Math.max(max, valeurCarte(r)), 0);
}

export interface CampBataille {
  /** Les raretés de toutes les cartes tirées par ce camp, manches confondues. */
  raretes: readonly string[];
}

/**
 * Départage deux camps, et rend l'index du vainqueur.
 *
 * Trois critères, dans l'ordre :
 *
 *  1. **La somme des raretés.** C'est la règle annoncée, et elle récompense
 *     l'ensemble du tirage plutôt qu'un coup de chance isolé.
 *  2. **La meilleure carte.** À somme égale, celui qui a sorti la plus haute
 *     l'emporte : entre six peu communes et une légendaire entourée de communes,
 *     c'est la légendaire qu'on a envie de voir gagner.
 *  3. **Le hasard**, fourni par l'appelant. Il faut bien trancher, et une
 *     égalité parfaite sur les deux premiers critères est assez rare pour qu'un
 *     tirage au sort soit la réponse honnête — plutôt que de faire gagner
 *     l'hôte, ce qui donnerait un avantage à celui qui crée la bataille.
 */
export function vainqueur(
  camps: readonly CampBataille[],
  hasard: () => number = Math.random,
): number {
  if (camps.length === 0) return -1;

  const scores = camps.map((c) => scoreCamp(c.raretes));
  const meilleur = Math.max(...scores);
  let candidats = camps.map((_, i) => i).filter((i) => scores[i] === meilleur);
  if (candidats.length === 1) return candidats[0];

  const hautes = camps.map((c) => meilleureCarte(c.raretes));
  const plusHaute = Math.max(...candidats.map((i) => hautes[i]));
  candidats = candidats.filter((i) => hautes[i] === plusHaute);
  if (candidats.length === 1) return candidats[0];

  return candidats[Math.floor(hasard() * candidats.length) % candidats.length];
}
