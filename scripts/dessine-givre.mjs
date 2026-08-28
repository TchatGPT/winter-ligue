/**
 * Dessine le givre du bas des tuiles, et l'écrit dans la feuille de style.
 *
 *     node scripts/dessine-givre.mjs
 *
 * Le tracé est généré ici plutôt qu'écrit à la main : une image SVG en `data:`
 * doit être encodée pour l'URL, et une erreur d'encodage ne se signale pas — la
 * règle est simplement ignorée. Le script retire son propre bloc avant de le
 * reposer, il peut donc être rejoué après un changement de paramètre.
 *
 * ## Ce qui est dessiné, et ce qui ne l'est pas
 *
 * Du **givre de profondeur** : une masse cristalline serrée au sol, et des
 * prismes qui en sortent, effilés, de hauteurs très inégales.
 *
 * Deux versions antérieures se sont trompées de phénomène. La première partait
 * d'une turbulence SVG — une turbulence fait des taches, et des taches claires
 * sur un panneau sombre se lisent comme de la saleté. La seconde dessinait des
 * fougères de givre de vitre, avec leur ramification à soixante degrés : c'est
 * un beau motif, mais ce n'est pas ce qu'on voulait, et une fougère posée sur
 * une carte ressemble à une plante.
 *
 * Un cristal de glace vu de côté est un **prisme**, pas un triangle. Son épaule
 * est haute et large : les deux flancs restent presque parallèles sur presque
 * toute la longueur, et la pointe ne prend que le dernier quart. Une épaule à
 * mi-hauteur donne des triangles, et un champ de triangles se lit comme une
 * rangée de dents.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';

/** Le dessin fait la largeur d'une tuile, et la hauteur de la bande givrée. */
const L = 260;
const H = 64;

/** Un générateur reproductible : deux exécutions doivent rendre la même image. */
function hasard(graine) {
  let x = graine >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

const p = (a, b) => `${a.toFixed(1)} ${b.toFixed(1)}`;

/** Un prisme de glace, posé sur le sol et pointant vers le haut. */
function eclat(x, base, hauteur, penche, rnd) {
  const sol = H + 4;
  const dx = Math.tan((penche * Math.PI) / 180) * hauteur;
  const ep = 0.72 + rnd() * 0.18;
  const ey = sol - hauteur * ep;
  const eb = base * (0.62 + rnd() * 0.26);
  const ex = x + dx * ep;
  const sx = x + dx + (rnd() - 0.5) * base * 0.4;
  return {
    corps:
      `M${p(x - base / 2, sol)}L${p(ex - eb / 2, ey)}L${p(sx, sol - hauteur)}` +
      `L${p(ex + eb / 2, ey)}L${p(x + base / 2, sol)}Z`,
    // Une seule arête est éclairée : celle qui fait face à la lumière.
    arete: `M${p(x - base / 2, sol)}L${p(ex - eb / 2, ey)}L${p(sx, sol - hauteur)}`,
  };
}

/**
 * Le lit.
 *
 * La masse dense d'où tout sort. Elle est dessinée à part et non laissée à
 * l'accumulation des éclats : au ras du sol, une somme de transparences donne un
 * gris moyen, alors qu'un banc de glace y est franchement clair.
 */
function lit(rnd) {
  const sol = H + 4;
  const points = [`M-8 ${sol}`];
  for (let x = -8; x <= L + 8; x += 5 + rnd() * 7) {
    points.push(`L${p(x, sol - 5 - rnd() * 9)}`);
  }
  points.push(`L${L + 8} ${sol}Z`);
  return points.join('');
}

/*
 * Trois rangs, du fond vers l'avant.
 *
 * Le fond est une foule de petits éclats serrés ; l'avant, quelques grands
 * prismes francs. Sans cette gradation on obtient une haie régulière, pas un
 * amas. La hauteur suit le carré d'un tirage uniforme : beaucoup de courts,
 * quelques longs, sans avoir à le coder.
 */
const RANGS = [
  { n: 150, hMin: 4, hMax: 16, base: [2.5, 6], opacite: 0.085, arete: 0.1 },
  { n: 80, hMin: 7, hMax: 26, base: [3, 7], opacite: 0.1, arete: 0.16 },
  { n: 34, hMin: 11, hMax: 40, base: [3.5, 8], opacite: 0.13, arete: 0.26 },
];

function dessin(graine) {
  const rnd = hasard(graine);
  const couches = RANGS.map((rang) => {
    const corps = [];
    const aretes = [];
    for (let i = 0; i < rang.n; i += 1) {
      const x = rnd() * (L + 24) - 12;
      const r = rnd();
      const hauteur = rang.hMin + r * r * (rang.hMax - rang.hMin);
      const base = rang.base[0] + rnd() * (rang.base[1] - rang.base[0]);
      const t = eclat(x, base, hauteur, (rnd() - 0.5) * 30, rnd);
      corps.push(t.corps);
      aretes.push(t.arete);
    }
    return { corps: corps.join(''), aretes: aretes.join(''), ...rang };
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">` +
    `<path d="${lit(rnd)}" fill="%23ffffff" opacity="0.15"/>` +
    couches.map((c) => `<path d="${c.corps}" fill="%23ffffff" opacity="${c.opacite}"/>`).join('') +
    '<g fill="none" stroke="%23ffffff" stroke-width="0.7" stroke-linejoin="round">' +
    couches.map((c) => `<path d="${c.aretes}" opacity="${c.arete}"/>`).join('') +
    '</g></svg>'
  );
}

const encode = (svg) => svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E');

const regle = `
  /* -- Le givre du bas des tuiles ----------------------------------------- */

  /*
   * Des cristaux de glace montant du bord inférieur.
   *
   * Ils sont **dessinés**, prisme par prisme, et non tirés d'une texture. Voir
   * \`scripts/dessine-givre.mjs\` pour ce qui distingue un cristal d'un triangle,
   * et pourquoi une turbulence ne peut pas en tenir lieu.
   *
   * La bande occupe le bas de la tuile et n'atteint jamais le chiffre : elle
   * fait soixante-quatre pixels, quand la tuile en fait plus du double.
   */
  .glass-givre::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 64px;
    z-index: -1;
    pointer-events: none;
    border-end-start-radius: inherit;
    border-end-end-radius: inherit;
    overflow: hidden;
    background-image: url("data:image/svg+xml,${encode(dessin(19))}");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: bottom;
    /* Les arêtes font moins d'un pixel : sans ce souffle de flou, elles
       scintillent d'un pixel à l'autre au redimensionnement. */
    filter: blur(0.25px);
  }

  /* Deux orientations pour un seul tracé : cinq tuiles alignées portant
     exactement le même givre, cela se remarque immédiatement, et un tracé
     retourné reste du givre. */
  .glass-givre:nth-child(even)::after {
    transform: scaleX(-1);
  }
`;

let c = readFileSync(R + 'app/globals.css', 'utf8');
const ancre = "  /* La réflexion appuyée, pour les plaques qu'on veut voir briller. */";
const debut = c.indexOf('  /* -- Le givre');
if (debut >= 0) c = c.slice(0, debut) + c.slice(c.indexOf(ancre, debut));
if (!c.includes(ancre)) throw new Error('ancre introuvable');
writeFileSync(R + 'app/globals.css', c.replace(ancre, regle + '\n' + ancre));

const composant = R + 'components/ui.tsx';
let t = readFileSync(composant, 'utf8');
const de = '<div className="glass flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">';
const vers = '<div className="glass glass-givre flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">';
if (!t.includes(de) && !t.includes(vers)) throw new Error('StatTile introuvable');
writeFileSync(composant, t.split(de).join(vers));

console.log(`givre posé — ${Math.round(encode(dessin(19)).length / 1024)} Ko de tracé`);
