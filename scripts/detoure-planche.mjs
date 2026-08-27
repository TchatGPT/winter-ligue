/**
 * Détoure une planche de booster rendue sur fond blanc.
 *
 *     node scripts/detoure-planche.mjs <source.png> <destination.png>
 *
 * Les planches nous arrivent en perspective trois quarts, posées sur du blanc,
 * souvent avec une ombre portée. Le site les affiche sur un panneau très
 * sombre : il faut donc rendre le fond transparent, sans quoi le sachet
 * traîne un rectangle blanc derrière lui.
 *
 * ## Pourquoi un remplissage depuis les bords, et pas un simple seuil
 *
 * Un seuil « tout ce qui est clair devient transparent » perce l'illustration :
 * une planche de glace contient de la neige presque blanche, et on y ouvre des
 * trous. Le remplissage part des bords de l'image et ne progresse que de proche
 * en proche : une zone claire enfermée dans le sachet n'est jamais atteinte,
 * puisqu'il faudrait traverser le film pour y arriver.
 *
 * Une version antérieure de ce détourage avait justement mangé l'illustration
 * de cette façon, et le contournement avait été de recadrer à l'intérieur du
 * sachet — ce qui supprimait les sertissages.
 *
 * ## Les deux passes
 *
 * 1. **Le blanc franc.** Presque saturé, presque gris : c'est le fond du rendu.
 * 2. **L'ombre portée.** Grise, plus sombre, et attenante au fond. On l'efface
 *    aussi : une ombre calculée pour du blanc devient une tache claire sur un
 *    panneau noir. Le critère qui la distingue du sachet est la saturation —
 *    le film le plus pâle garde une teinte bleue, une ombre n'en a aucune.
 *
 * Les pixels de la frontière sont ensuite adoucis proportionnellement à leur
 * blancheur, puis débarrassés de ce que le fond y a déposé : sans quoi le
 * sachet garde un liseré blanc d'un pixel, très visible sur fond sombre.
 */

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import sharp from 'sharp';

/** Un pixel du fond franc : quasiment blanc et quasiment gris. */
const BLANC_MIN = 246;
const BLANC_ECART = 8;

/** Un pixel d'ombre portée : clair, et sans la moindre teinte. */
const OMBRE_MIN = 198;
const OMBRE_ECART = 10;

/**
 * Le liseré de contact, et pourquoi il lui faut sa propre passe.
 *
 * Les rendus posent le sachet sur une surface, et il en reste une bande beige
 * clair juste sous le sertissage du bas. Elle est trop teintée pour l'ombre
 * (treize points d'écart chromatique là où l'ombre en admet dix) et pas assez
 * blanche pour le fond. Elle survivait donc aux deux passes et se voyait comme
 * un trait blanc sous le pli, très net sur le panneau sombre du site.
 *
 * Élargir simplement le critère d'ombre ne va pas : le sachet Givre est un film
 * argenté presque blanc et très peu saturé, et le remplissage se serait mis à
 * lui grignoter les bords. D'où une passe **bornée en profondeur** : elle part
 * du fond déjà trouvé et n'avance que de quelques pixels. Assez pour un liseré,
 * jamais assez pour entamer une illustration.
 */
const LISERE_MIN = 150;
const LISERE_ECART = 32;
const LISERE_PROFONDEUR = 14;

/** Largeur de la frange adoucie, en pixels. */
const FRANGE = 2;

/** En deçà, le pixel est considéré comme absent pour le recadrage. */
const SEUIL_BOITE = 10;

function classe(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const ecart = max - min;
  if (min >= BLANC_MIN && ecart <= BLANC_ECART) return 2;
  if (min >= OMBRE_MIN && ecart <= OMBRE_ECART) return 1;
  return 0;
}

async function detoure(entree, sortie) {
  const image = sharp(await readFile(entree)).ensureAlpha();
  const { width: W, height: H } = await image.metadata();
  const px = await image.raw().toBuffer();

  // 0 = sachet, 1 = fond atteint depuis le bord.
  const fond = new Uint8Array(W * H);
  const file = new Int32Array(W * H);
  let tete = 0;
  let queue = 0;

  const pousse = (i) => {
    if (fond[i]) return;
    const o = i * 4;
    if (!classe(px[o], px[o + 1], px[o + 2])) return;
    fond[i] = 1;
    file[queue += 1] = i;
  };

  for (let x = 0; x < W; x += 1) {
    pousse(x);
    pousse((H - 1) * W + x);
  }
  for (let y = 0; y < H; y += 1) {
    pousse(y * W);
    pousse(y * W + W - 1);
  }

  // Le remplissage progresse de proche en proche : il ne peut pas sauter
  // par-dessus le film pour atteindre une neige claire enfermée dedans.
  while (tete < queue) {
    const i = file[tete += 1];
    const x = i % W;
    const y = (i - x) / W;
    if (x > 0) pousse(i - 1);
    if (x < W - 1) pousse(i + 1);
    if (y > 0) pousse(i - W);
    if (y < H - 1) pousse(i + W);
  }

  /*
   * La passe bornée : le liseré de contact.
   *
   * Elle repart de tout ce que le remplissage a déjà pris et n'avance que de
   * `LISERE_PROFONDEUR` pixels, en acceptant des teintes que les deux premières
   * passes refusaient. La profondeur est comptée par pixel, si bien qu'un
   * liseré fin disparaît entièrement tandis qu'une zone claire large — le film
   * argenté de Givre — n'est entamée que de vingt pixels au plus... et ne l'est
   * en fait jamais, puisqu'il faudrait qu'elle touche le fond.
   */
  const profondeur = new Uint8Array(W * H);
  const bord = [];
  for (let i = 0; i < W * H; i += 1) if (fond[i]) bord.push(i);

  let vague = bord;
  for (let pas = 0; pas < LISERE_PROFONDEUR && vague.length; pas += 1) {
    const suivante = [];
    for (const i of vague) {
      const x = i % W;
      const y = (i - x) / W;
      const voisins = [];
      if (x > 0) voisins.push(i - 1);
      if (x < W - 1) voisins.push(i + 1);
      if (y > 0) voisins.push(i - W);
      if (y < H - 1) voisins.push(i + W);
      for (const j of voisins) {
        if (fond[j]) continue;
        const o = j * 4;
        const min = Math.min(px[o], px[o + 1], px[o + 2]);
        const ecart = Math.max(px[o], px[o + 1], px[o + 2]) - min;
        if (min < LISERE_MIN || ecart > LISERE_ECART) continue;
        fond[j] = 1;
        profondeur[j] = pas + 1;
        suivante.push(j);
      }
    }
    vague = suivante;
  }

  /*
   * Le rognage du pourtour, colonne par colonne et ligne par ligne.
   *
   * C'est ce qui vient réellement à bout du liseré de contact. Les deux passes
   * précédentes progressent de proche en proche depuis le fond, et c'est leur
   * limite : entre le fond et le liseré, le rendu a posé une fine ombre plus
   * sombre que les deux critères refusent. Le remplissage s'y arrête, et tout
   * ce qui est derrière — le liseré lui-même — reste hors d'atteinte.
   *
   * Ici on ne suit plus de chemin. On entre par le bord de la silhouette et on
   * efface tant que les pixels sont clairs et sans teinte, avec un plafond. Un
   * sachet n'a pas de bande beige neutre sur son pourtour ; une surface de
   * rendu, si.
   */
  const TRIM_MIN = 165;
  const TRIM_ECART = 34;
  const TRIM_MAX = 26;

  const rogne = (indices) => {
    let efface = 0;
    // On saute le vide, puis on mange le liseré, puis on s'arrête au sachet.
    let vu = false;
    for (const i of indices) {
      const o = i * 4;
      if (!fond[i] && px[o + 3] > 0) {
        vu = true;
        const min = Math.min(px[o], px[o + 1], px[o + 2]);
        const ecart = Math.max(px[o], px[o + 1], px[o + 2]) - min;
        if (efface < TRIM_MAX && min >= TRIM_MIN && ecart <= TRIM_ECART) {
          fond[i] = 1;
          efface += 1;
          continue;
        }
        return;
      }
      if (vu) return;
    }
  };

  for (let x = 0; x < W; x += 1) {
    const colonne = [];
    for (let y = 0; y < H; y += 1) colonne.push(y * W + x);
    rogne(colonne);
    rogne(colonne.slice().reverse());
  }
  for (let y = 0; y < H; y += 1) {
    const ligne = [];
    for (let x = 0; x < W; x += 1) ligne.push(y * W + x);
    rogne(ligne);
    rogne(ligne.slice().reverse());
  }

  /*
   * La frontière.
   *
   * Le rendu a mélangé, sur un ou deux pixels, le sachet et le blanc derrière
   * lui. Ces pixels restent opaques après le remplissage — ils ne sont pas
   * assez blancs pour être du fond — mais ils sont blanchis. On les rend
   * partiellement transparents à proportion de ce qu'ils ont de blanc, et on
   * retire du reste la part de blanc qu'ils ont reçue.
   */
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (fond[i]) {
        px[i * 4 + 3] = 0;
        continue;
      }

      let proche = false;
      for (let dy = -FRANGE; dy <= FRANGE && !proche; dy += 1) {
        for (let dx = -FRANGE; dx <= FRANGE; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (fond[ny * W + nx]) {
            proche = true;
            break;
          }
        }
      }
      if (!proche) continue;

      const o = i * 4;
      const min = Math.min(px[o], px[o + 1], px[o + 2]);
      const ecart = Math.max(px[o], px[o + 1], px[o + 2]) - min;

      /*
       * Un pixel de frange clair et sans teinte n'appartient pas au sachet.
       *
       * La décontamination plus bas suppose un pixel de sachet *sali* par le
       * fond, et lui rend sa couleur en retirant la part de blanc. Appliquée à
       * un pixel qui est du fond de bout en bout, elle en reconstitue un clair
       * — d'où le filet blanc d'un pixel qui subsistait sous le sertissage du
       * bas après le passage du liseré de contact. Ici on efface, on ne
       * reconstitue pas.
       */
      if (min >= 185 && ecart <= 30) {
        px[o + 3] = 0;
        continue;
      }

      // De 200 à 246, la blancheur passe de nulle à totale.
      const blancheur = Math.min(1, Math.max(0, (min - 200) / 46));
      const alpha = 1 - blancheur;
      if (alpha <= 0.004) {
        px[o + 3] = 0;
        continue;
      }
      px[o + 3] = Math.round(alpha * 255);
      // Décontamination : on enlève la part de blanc, et on rend au pixel la
      // couleur qu'il aurait sans elle.
      for (let k = 0; k < 3; k += 1) {
        px[o + k] = Math.min(255, Math.max(0, Math.round((px[o + k] - 255 * blancheur) / alpha)));
      }
    }
  }

  // Recadrage sur ce qui reste : la planche occupe une partie seulement du
  // rendu, et transporter des centaines de pixels vides jusqu'au navigateur
  // n'aurait aucun intérêt.
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (px[(y * W + x) * 4 + 3] < SEUIL_BOITE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error(`${entree} : rien ne subsiste après détourage`);

  const largeur = x1 - x0 + 1;
  const hauteur = y1 - y0 + 1;
  const png = await sharp(px, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: largeur, height: hauteur })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  await writeFile(sortie, png);

  const opaques = px.reduce((n, _, k) => (k % 4 === 3 && px[k] > SEUIL_BOITE ? n + 1 : n), 0);
  return {
    largeur,
    hauteur,
    ratio: (hauteur / largeur).toFixed(3),
    gardePct: ((100 * opaques) / (W * H)).toFixed(1),
    poidsKo: Math.round(png.length / 1024),
  };
}

const [entree, sortie] = process.argv.slice(2);
if (!entree || !sortie) {
  console.error('usage : node scripts/detoure-planche.mjs <source> <destination>');
  process.exit(1);
}
const r = await detoure(entree, sortie);
console.log(
  `${sortie} : ${r.largeur} x ${r.hauteur} (ratio 1:${r.ratio}), ` +
    `${r.gardePct} % du rendu conservé, ${r.poidsKo} Ko`,
);
