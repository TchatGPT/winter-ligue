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

/** Un texte réduit à ce qu'il dit : sans casse, sans espaces, le signe moins typographique ramené au trait. */
const ramene = (texte: string) => texte.toLowerCase().replace(/\s/g, '').replace(/−/g, '-');

/**
 * Deux textes disent-ils la même chose ? « Game ×1,2 » et « game ×1,2 » :
 * oui. Sert à ne pas écrire deux fois l'intitulé d'une carte et son résumé
 * quand ils tombent pareil.
 */
export function memeTexte(a: string | null | undefined, b: string | null | undefined): boolean {
  return ramene(a ?? '') === ramene(b ?? '');
}

/**
 * Un texte tel qu'on le cherche : sans accents ni casse, et sans les lettres
 * qu'une police confond — un I majuscule et un l minuscule, un 1, un O et un
 * zéro. « Boreal » trouve « Boréal », et « Ales » trouve « AIessandroPeps »,
 * écrit avec un I majuscule (vu dans le registre des subs le 03/11/2026) :
 * dans la police du site, on ne voit pas la différence.
 */
export function pourChercher(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[il1|]/g, 'l')
    .replace(/0/g, 'o');
}
