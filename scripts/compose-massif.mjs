/**
 * Compose le massif du fond à partir d'une photo de sommet détourée.
 *
 *     node scripts/compose-massif.mjs <source> <destination.webp>
 *
 * Le décor du site est une chaîne en SVG — cinq crêtes, du plus lointain au
 * plus proche. Elle donne la silhouette et la profondeur, mais pas la matière :
 * ce sont des aplats dégradés, et un aplat n'a aucun détail fin.
 *
 * Or c'est précisément le détail fin qui fait exister le verre. Un
 * `backdrop-filter` ne peut brouiller que ce qui varie ; mesuré sous une plaque,
 * l'ancien fond n'offrait que 1,8 niveau d'écart entre deux pixels voisins.
 * Autant dire un aplat, et un verre posé sur un aplat ne se voit pas.
 *
 * Ce massif apporte cette matière : de la roche, de la neige, des arêtes. Il
 * est composé de trois exemplaires du même sommet, à trois échelles et trois
 * distances — le lointain est plus pâle, plus bleu et plus flou, le proche est
 * net. C'est la perspective atmosphérique, la même règle que celle du SVG.
 */

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import sharp from 'sharp';

/** Dimensions de la planche produite. */
const L = 2600;
const H = 900;

/**
 * Les trois plans.
 *
 * `teinte` tire la roche vers le bleu à mesure qu'elle s'éloigne, `clarte` la
 * délave, `flou` lui retire ses arêtes. Les trois vont ensemble : un lointain
 * net mais pâle se lit comme un objet décoloré, pas comme un objet distant.
 */
const PLANS = [
  { echelle: 0.42, x: 0, bas: 104, flou: 5.5, opacite: 0.4, clarte: 1.18, teinte: { r: 150, g: 178, b: 214 } },
  { echelle: 0.52, x: 0.48, bas: 72, flou: 3.4, opacite: 0.52, clarte: 1.1, teinte: { r: 138, g: 168, b: 208 } },
  { echelle: 0.72, x: 0.16, bas: 0, flou: 0.6, opacite: 0.92, clarte: 0.88, teinte: { r: 176, g: 202, b: 232 } },
];

async function plan(source, p) {
  const large = Math.round(L * p.echelle);
  let img = sharp(source).resize({ width: large });
  img = img.modulate({ brightness: p.clarte, saturation: 0.55 }).tint(p.teinte);
  if (p.flou > 0) img = img.blur(p.flou);

  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // L'opacité s'applique au canal alpha : `sharp` n'a pas d'opérateur d'opacité
  // globale, et passer par une composition en `dest-in` coûterait une passe.
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * p.opacite);

  // Le placement est borné : un plan qui dépasserait la planche ferait
  // échouer la composition au lieu d'être rogné.
  const left = Math.max(0, Math.min(L - info.width, Math.round(p.x * L)));
  const top = Math.max(0, Math.min(H - info.height, H - info.height + p.bas));
  return {
    input: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toBuffer(),
    left,
    top,
  };
}

const [source, sortie] = process.argv.slice(2);
if (!source || !sortie) {
  console.error('usage : node scripts/compose-massif.mjs <source> <destination.webp>');
  process.exit(1);
}

const brut = await readFile(source);
const couches = [];
for (const p of PLANS) couches.push(await plan(brut, p));

const plat = await sharp({
  create: { width: L, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(couches)
  .png()
  .toBuffer();

/*
 * On rogne le ciel vide.
 *
 * La planche est composee dans un cadre plus grand que son contenu, et tout
 * ce vide au-dessus du sommet devient, une fois la planche posee en fond, une
 * bande morte en haut de page. Rogne, le sommet vient toucher le bord — ce
 * qui est exactement la place quon veut lui donner.
 */
const png = await sharp(plat)
  .trim({ threshold: 1 })
  .webp({ quality: 88, alphaQuality: 92, effort: 6 })
  .toBuffer();

await writeFile(sortie, png);
const m = await sharp(png).metadata();
console.log(`${sortie} : ${m.width} x ${m.height}, ${Math.round(png.length / 1024)} Ko`);
