/**
 * Fabrique les pages de rendu des curseurs de glace.
 *
 * Le tracé vit ici, une seule fois, et sort en quatre pages HTML — deux formes,
 * deux définitions. Un navigateur sans tête les photographie ensuite sur fond
 * transparent : c'est le seul rastériseur disponible dans ce dépôt, et il rend
 * exactement ce que rendra le navigateur du joueur, ce qu'aucune bibliothèque
 * tierce ne garantit.
 */

import { writeFileSync } from 'node:fs';

/** La flèche, taillée en éclat de glace. Repère à la pointe, en (4, 3). */
const FLECHE = `
  <defs>
    <linearGradient id="glace" x1="0" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.42" stop-color="#cdeeff"/>
      <stop offset="1" stop-color="#5fb3e0"/>
    </linearGradient>
    <linearGradient id="facette" x1="0" y1="0" x2="1" y2="0.8">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.08"/>
    </linearGradient>
    <filter id="ombre" x="-40%" y="-40%" width="200%" height="200%">
      <feDropShadow dx="1.4" dy="2" stdDeviation="1.8"
                    flood-color="#05253b" flood-opacity="0.55"/>
    </filter>
  </defs>

  <g filter="url(#ombre)">
    <!-- Le contour blanc : sans lui, le curseur disparaît sur une carte claire. -->
    <path d="M4 3 L4 51.4 L16.1 40.4 L23.8 58 L32.6 53.6 L24.9 37.1 L39.2 37.1 Z"
          fill="url(#glace)" stroke="#ffffff" stroke-width="2.6"
          stroke-linejoin="round"/>
    <!-- La facette éclairée : c'est elle qui fait « taillé » plutôt que « peint ». -->
    <path d="M4 3 L4 51.4 L16.1 40.4 L14.6 36.6 L8.4 30 Z"
          fill="url(#facette)"/>
    <!-- L'arête froide du bas, qui creuse le volume. -->
    <path d="M23.8 58 L32.6 53.6 L24.9 37.1 L20.6 37.1 Z"
          fill="#3f9ccd" opacity="0.42"/>
  </g>`;

/** Un éclat de plus, pour ce qui se clique. */
const ETINCELLE = `
  <g filter="url(#ombre)">
    <path d="M45 10 L47.6 19.4 L57 22 L47.6 24.6 L45 34 L42.4 24.6 L33 22 L42.4 19.4 Z"
          fill="#ffffff" stroke="#8fdcff" stroke-width="1.6" stroke-linejoin="round"/>
  </g>`;

function page(corps, taille) {
  return `<style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block}
  </style>
  <svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 64 64">${corps}</svg>`;
}

const dossier = process.argv[2];
for (const taille of [32, 64]) {
  writeFileSync(`${dossier}/curseur-${taille}.html`, page(FLECHE, taille));
  writeFileSync(`${dossier}/curseur-clic-${taille}.html`, page(FLECHE + ETINCELLE, taille));
}
console.log('pages écrites');
