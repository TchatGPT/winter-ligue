/**
 * Les caractères qu'on ne voit pas : contrôle, largeur nulle, sens de
 * lecture. Ils servent à faire lire autre chose que ce qui est écrit — au
 * journal, dans un pseudo. On les retire de tout texte qu'un joueur écrit ;
 * tout ce qui se voit reste.
 */
const INVISIBLES = /[\p{Cc}​-‏‪-‮⁠-⁩﻿]/gu;

/** Le texte sans ses caractères invisibles, ni espaces autour. */
export function sansInvisibles(texte: string): string {
  return texte.replace(INVISIBLES, '').trim();
}
