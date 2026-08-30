/**
 * Fabrique un cadre de carte à partir d'une carte finie.
 *
 *     node scripts/decoupe-cadre.mjs <carte.png> <cadre.webp>
 *
 * Les cadres nous arrivent sous forme de cartes complètes, illustration
 * comprise, posées sur du blanc. Il faut en tirer un cadre vide, dans lequel le
 * site viendra loger sa propre illustration et son propre texte. Deux découpes.
 *
 * ## 1. Le blanc autour de la carte
 *
 * Par remplissage depuis les quatre coins, et non par seuil global : le cadre
 * lui-même a des reliefs presque blancs, et un seuil les évideraient de
 * l'intérieur. Seul le blanc joignable depuis l'extérieur disparaît.
 *
 * ## 2. La fenêtre d'illustration
 *
 * Pas en bloc. Le fleuron du haut et les deux volutes d'angle débordent sur la
 * fenêtre, et ce débordement fait tout le charme du cadre — le supprimer donne
 * un rectangle à coins arrondis dans une bordure, c'est-à-dire n'importe quoi.
 *
 * Ils sont conservés par un second remplissage, parti du **bord haut** de la
 * fenêtre et limité aux pixels clairs et peu saturés. Partir du haut n'est pas
 * un détail : les ornements pendent du rail supérieur, alors que le décor de
 * l'illustration — une montagne enneigée, elle aussi claire — touche le bord
 * bas. Sous le rail, la contrainte de saturation tombe, parce que le fleuron a
 * une gemme vive en son centre et que le ciel juste dessous est noir : rien ne
 * peut fuir par là.
 *
 * Les bornes ci-dessous ont été mesurées sur la première planche. Une planche
 * d'un autre gabarit demande de les remesurer — le composant `CardFrame` place
 * ses fenêtres en pourcentage de ces mêmes valeurs.
 */

import sharp from 'sharp';

const [, , SOURCE, SORTIE] = process.argv;
if (!SOURCE || !SORTIE) {
  console.error('usage : node scripts/decoupe-cadre.mjs <carte.png> <cadre.webp>');
  process.exit(1);
}

/** Bornes de la carte dans l'image d'origine. */
const CARTE = { x: 122, y: 52, l: 1514, h: 2231 };

/** Bornes de la fenêtre d'illustration, dans le même repère. */
const FENETRE = { x: 230, y: 148, x1: 1529, y1: 1692 };

/** Rayon des coins de la fenêtre. */
const RAYON = 46;

/** Au-dessus de ce seuil sur les trois canaux, un pixel est du blanc de fond. */
const SEUIL_BLANC = 242;

/** Largeur du fichier produit. Deux fois la plus grande taille d'affichage. */
const LARGEUR = 900;

const F = {
  x: FENETRE.x - CARTE.x,
  y: FENETRE.y - CARTE.y,
  x1: FENETRE.x1 - CARTE.x,
  y1: FENETRE.y1 - CARTE.y,
};

const { data, info } = await sharp(SOURCE)
  .extract({ left: CARTE.x, top: CARTE.y, width: CARTE.l, height: CARTE.h })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: W, height: H } = info;
const idx = (x, y) => y * W + x;

/* -- 1. Le blanc autour ---------------------------------------------------- */

const dehors = new Uint8Array(W * H);
const blanc = (i) =>
  data[i * 4] >= SEUIL_BLANC && data[i * 4 + 1] >= SEUIL_BLANC && data[i * 4 + 2] >= SEUIL_BLANC;

let pile = [idx(0, 0), idx(W - 1, 0), idx(0, H - 1), idx(W - 1, H - 1)];
while (pile.length) {
  const i = pile.pop();
  if (dehors[i] || !blanc(i)) continue;
  dehors[i] = 1;
  const x = i % W;
  const y = (i / W) | 0;
  if (x > 0) pile.push(i - 1);
  if (x < W - 1) pile.push(i + 1);
  if (y > 0) pile.push(i - W);
  if (y < H - 1) pile.push(i + W);
}

/* -- 2. La fenêtre, ornements conservés ------------------------------------ */

const dansFenetre = (x, y) => {
  if (x < F.x || x > F.x1 || y < F.y || y > F.y1) return false;
  const cx = x < F.x + RAYON ? F.x + RAYON : x > F.x1 - RAYON ? F.x1 - RAYON : x;
  const cy = y < F.y + RAYON ? F.y + RAYON : y > F.y1 - RAYON ? F.y1 - RAYON : y;
  if (cx === x && cy === y) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= RAYON * RAYON;
};

const ornement = (i, y) => {
  const r = data[i * 4];
  const g = data[i * 4 + 1];
  const b = data[i * 4 + 2];
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx ? (mx - mn) / mx : 0;
  return lum > 140 && sat < (y < F.y + 140 ? 1 : 0.35);
};

const garde = new Uint8Array(W * H);
pile = [];
for (let x = F.x; x <= F.x1; x++) {
  for (let y = F.y; y < F.y + 4; y++) if (dansFenetre(x, y)) pile.push(idx(x, y));
}
while (pile.length) {
  const i = pile.pop();
  if (garde[i]) continue;
  const x = i % W;
  const y = (i / W) | 0;
  if (!dansFenetre(x, y) || !ornement(i, y)) continue;
  garde[i] = 1;
  if (x > 0) pile.push(i - 1);
  if (x < W - 1) pile.push(i + 1);
  if (y > 0) pile.push(i - W);
  if (y < H - 1) pile.push(i + W);
}

let trou = 0;
let ornements = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (dehors[i]) {
      data[i * 4 + 3] = 0;
    } else if (dansFenetre(x, y)) {
      if (garde[i]) ornements++;
      else {
        data[i * 4 + 3] = 0;
        trou++;
      }
    }
  }
}

await sharp(data, { raw: { width: W, height: H, channels: 4 } })
  .resize({ width: LARGEUR })
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(SORTIE);

console.log(
  `${SORTIE} — fenêtre évidée : ${trou} px, ornements conservés : ${ornements} px, ` +
    `rapport ${(CARTE.l / CARTE.h).toFixed(4)}`,
);
