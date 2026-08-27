'use client';

import { useMemo } from 'react';
import { PackArtwork } from './PackArtwork';

/**
 * Dimensions d'affichage, en pixels.
 *
 * Elles suivent le ratio de la planche détourée — 1258 × 2139, soit **1:1,700**.
 * Un booster du commerce est un peu plus élancé (1:1,75), mais c'est la planche
 * qui fait foi : l'écart se paierait en visages étirés.
 */
const W = 200;
const H = 340;

/**
 * Le reflet qui balaie le sachet.
 *
 * Uniquement du presque-blanc : la teinte du booster n'y entre pas. Elle y est
 * entrée un temps, par `color-mix`, et deux des quatre accents sont sombres —
 * un ambre et un violet. Là où le mode de fusion `screen` ne s'appliquait pas,
 * ils se peignaient tels quels sur un ciel clair et traçaient un trait noir le
 * long du sachet. La couleur du booster est portée par le halo, pas par la
 * lumière qui le traverse.
 *
 * Il ne bouge pas tout seul : sa position vient de `--balayage`, animée sur le
 * sachet.
 */
const ECLAT = `linear-gradient(102deg,
  rgb(255 255 255 / 0) 0%,
  rgb(222 238 252 / 0.09) 26%,
  rgb(233 245 255 / 0.3) 44%,
  rgb(247 252 255 / 0.44) 50%,
  rgb(233 245 255 / 0.3) 56%,
  rgb(222 238 252 / 0.09) 74%,
  rgb(255 255 255 / 0) 100%)`;

/**
 * Largeur du calque de reflet.
 *
 * Plus du double du sachet, et c'est le point : le dégradé le recouvre alors
 * entièrement quelle que soit sa position, et son déplacement se lit comme une
 * lumière qui parcourt toute la surface. Une version antérieure tenait dans la
 * largeur du sachet avec un cœur étroit — on ne voyait qu'une bande passer.
 */
const LARGEUR_ECLAT = Math.round(W * 2.2);

/**
 * L'impression du recto, en SVG embarqué.
 *
 * Le titre doit rester lisible sur une illustration très contrastée, tantôt
 * neige presque blanche, tantôt roche sombre : d'où le contour foncé passé sous
 * le remplissage. L'effet de glace ensuite — un dégradé du blanc au bleu pâle
 * du haut vers le bas, plus un doublon décalé d'un pixel qui fait l'arête
 * givrée.
 *
 * Le SVG est un document isolé : les polices du site ne l'atteignent pas, d'où
 * une pile générique.
 */
function rectoImprime(nom: string) {
  const police = "font-family='Arial Narrow, Haettenschweiler, Arial, sans-serif'";
  const titre = nom.toUpperCase();

  // Largeur imposée, écartement laissé libre. Les noms vont de cinq à dix
  // lettres : à corps constant, « Givre » serait perdu au milieu du sachet là
  // où « Hors-Piste » déborderait. En fixant la largeur et en n'ajustant que
  // l'espacement, les quatre sachets portent un titre de même emprise — et
  // aucune police manquante ne peut le faire dépasser.
  const largeur = (W * 0.78).toFixed(1);
  const corps = Math.min(30, 270 / Math.max(1, titre.length)).toFixed(1);

  // `textLength` doit être porté par chaque `<text>` : sur un `<g>` il est
  // ignoré sans le moindre avertissement, et le titre reprend sa largeur
  // naturelle — « HORS-PISTE » sortait alors du sachet par la droite.
  const cadre = `textLength='${largeur}' lengthAdjust='spacing'`;

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>` +
    `<defs><linearGradient id='gel' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0%' stop-color='#ffffff'/>` +
    `<stop offset='42%' stop-color='#dff1ff'/>` +
    `<stop offset='100%' stop-color='#8cc8ef'/>` +
    `</linearGradient></defs>` +
    `<g text-anchor='middle' ${police}>` +
    // La série, sous le pli : posée sur le sertissage, elle serait écrasée par
    // les stries et coupée par l'arête.
    `<text x='${W / 2}' y='${(H * 0.155).toFixed(1)}' font-size='8.5' font-weight='700' ` +
    `letter-spacing='3' fill='#eaf6ff' stroke='#06121f' stroke-width='2.4' ` +
    `paint-order='stroke' stroke-linejoin='round' opacity='0.94'>WINTER LIGUE</text>` +
    // Le nom, au milieu. L'arête givrée est le doublon décalé vers le haut.
    `<g font-size='${corps}' font-weight='900'>` +
    `<text x='${W / 2}' y='${(H * 0.535).toFixed(1)}' ${cadre} fill='none' stroke='#05141f' ` +
    `stroke-width='5' paint-order='stroke' stroke-linejoin='round' opacity='0.62'>${titre}</text>` +
    `<text x='${W / 2}' y='${(H * 0.535 - 1).toFixed(1)}' ${cadre} fill='#ffffff' opacity='0.5'>${titre}</text>` +
    `<text x='${W / 2}' y='${(H * 0.535).toFixed(1)}' ${cadre} fill='url(#gel)'>${titre}</text>` +
    `</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** La rareté garantie du booster donne sa couleur au halo. */
const GEMME: Record<string, string> = {
  C: 'var(--ice)',
  PC: 'var(--r-pc)',
  R: 'var(--r-r)',
  SR: 'var(--r-sr)',
  UR: 'var(--r-ur)',
  L: 'var(--r-l)',
};

export interface Pack3DProps {
  name: string;
  cardCount: number;
  gradient: [string, string];
  /** Planche peinte du sachet. Absente, on retombe sur le sachet dessiné. */
  art?: string | null;
  /** Coupe le balancement, pendant l'ouverture par exemple. */
  frozen?: boolean;
  /** Rareté garantie : elle donne sa couleur au halo. */
  rarete?: string | null;
  /**
   * Sachet du présentoir plutôt que sachet de tête.
   *
   * Il se balance plus lentement et de moins loin, et n'a pas de halo : quatre
   * lueurs colorées de 132 % de large se recouvraient derrière la rangée et
   * faisaient des taches entre les sachets.
   */
  vignette?: boolean;
  className?: string;
}

/**
 * Le sachet de booster.
 *
 * **La planche EST le sachet** : elle n'est ni recadrée, ni encadrée, ni
 * recouverte. On lui pose son titre, une lumière qui la traverse, un halo
 * derrière, et on la fait respirer.
 *
 * Une coque en trois dimensions a précédé, et a été retirée. Elle découpait la
 * planche en près de deux cents tuiles posées sur un profil en lentille, avec
 * épaisseur, parois de tranche et maillage allégé pour les voisins. Elle était
 * juste géométriquement et fausse à l'œil : à la taille où un sachet est
 * affiché, chaque tuile est un rectangle de quelques pixels dont les bords
 * adoucis ne se raccordent jamais tout à fait, et le tout se lisait comme une
 * mosaïque un peu sale plutôt que comme un objet. Elle coûtait par ailleurs
 * deux cents éléments composités par image.
 *
 * La planche, elle, est déjà peinte comme un sachet gonflé : ses plis, son
 * sertissage et son galbe sont dans l'image. Les redessiner en CSS revenait à
 * discuter avec le dessin.
 */
export function BoosterPack3D({
  name,
  cardCount,
  gradient,
  art,
  frozen = false,
  rarete = null,
  vignette = false,
  className,
}: Pack3DProps) {
  // L'impression ne dépend que du nom : inutile de reconstruire le SVG et de le
  // ré-encoder à chaque image d'animation.
  const recto = useMemo(() => rectoImprime(name), [name]);

  /*
   * Décalage de la respiration, tiré du nom du booster.
   *
   * Quatre sachets qui oscillent à l'unisson se lisent comme un seul mécanisme,
   * pas comme quatre objets posés là. Un retard négatif démarre l'animation en
   * cours de route, et le tirer du nom plutôt qu'au hasard garantit la même
   * valeur au rendu serveur et dans le navigateur.
   */
  const retard = useMemo(() => {
    let somme = 0;
    for (let i = 0; i < name.length; i += 1) somme += name.charCodeAt(i);
    return `-${(somme % 97) / 7}s`;
  }, [name]);

  return (
    <div
      className={`sachet-scene ${className ?? ''}`}
      style={{
        width: W,
        height: H,
        // Les teintes sont posées ici et non sur le sachet : le halo, qui vit
        // en dehors de la boîte qui tourne, doit les lire lui aussi.
        ['--p1' as string]: gradient[0],
        ['--p2' as string]: gradient[1],
        ['--eclat' as string]: ECLAT,
        ['--gemme' as string]: GEMME[rarete ?? 'C'] ?? GEMME.C,
        ['--largeur-eclat' as string]: `${LARGEUR_ECLAT}px`,
      }}
    >
      {/* Le halo ne tourne pas avec le sachet : c'est un éclairage de vitrine
          posé derrière lui, pas une propriété de l'objet. */}
      {!vignette && <span className="sachet-halo" aria-hidden="true" />}
      <span className="sachet-lisiere" aria-hidden="true" />

      <div
        className={`sachet ${frozen ? '' : vignette ? 'sachet-veille' : 'sachet-tourne'}`}
        style={{
          width: W,
          height: H,
          ...(vignette ? { ['--retard' as string]: retard } : null),
        }}
        role="img"
        aria-label={`Sachet ${name}, ${cardCount} cartes`}
      >
        <div className="sachet-face">
          {art ? (
            // Le titre et la planche dans le même calque : deux fonds d'une
            // seule boîte se recadrent ensemble, là où deux éléments empilés
            // peuvent glisser l'un par rapport à l'autre.
            <span
              className="sachet-planche"
              style={{ backgroundImage: `${recto}, url("${art}")` }}
              aria-hidden="true"
            />
          ) : (
            <PackArtwork name={name} cardCount={cardCount} tint={gradient} />
          )}
          <span className="sachet-eclat" aria-hidden="true" />
        </div>
        <span className="sachet-ombre" aria-hidden="true" />
      </div>
    </div>
  );
}
