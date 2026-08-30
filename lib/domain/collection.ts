/**
 * Collection — ce que le joueur a découvert.
 *
 * Une carte jouée est consommée, mais sa *découverte* est définitive : elle
 * reste inscrite dans la collection du joueur.
 *
 * ## Il n'y a plus de bonus de collection
 *
 * Ce fichier portait quatre familles de cartes, et compléter une famille
 * donnait des places de réserve, un pourcentage de kills permanent, des flocons
 * par game et des remises. Tout cela est retiré, et c'est une décision de règle,
 * pas un nettoyage : ces bonus étaient des **récompenses individuelles qui
 * grossissaient avec le nombre de boosters ouverts**. Le multiplicateur de kills
 * en particulier réécrivait rétroactivement toutes les games de la saison — sur
 * soixante games, ses +7 % valaient à peu près la carte la plus forte du jeu,
 * dont le plafond est pourtant fixé à 25 points.
 *
 * C'était exactement la pression que le reste des règles interdit : les paliers
 * de subs versent à tous les joueurs actifs, jamais à un seul. La collection
 * sert désormais à jouer des cartes et à les revendre, pas à marquer plus au
 * kill que le voisin.
 *
 * La réserve a disparu avec eux : il n'y a plus de plafond de détention, donc
 * plus rien à agrandir.
 */

import { CARDS } from './catalog';

/** Pourcentage de complétion global, pour l'affichage du profil. */
export function completionRatio(discovered: readonly string[]): number {
  const known = new Set(CARDS.map((c) => c.id));
  const valid = new Set(discovered.filter((id) => known.has(id)));
  return CARDS.length === 0 ? 0 : valid.size / CARDS.length;
}
