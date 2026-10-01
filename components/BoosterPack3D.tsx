'use client';

import { useMemo } from 'react';
import { PackArtwork } from './PackArtwork';

/**
 * Rapport largeur-hauteur des planches détourées : **1:1,865**.
 *
 * Mesuré sur les quatre après suppression du fond — elles s'accordent à trois
 * millièmes près, et les fichiers livrés ont tous le même gabarit (600 × 1119).
 * Ce n'est pas le rapport d'un sachet vu de face : les planches sont peintes en
 * perspective trois quarts. Mais c'est la planche qui fait foi ; l'écart se
 * paierait en illustration étirée.
 *
 * La **taille**, elle, ne vit plus ici. Le sachet occupe toute la boîte qu'on
 * lui donne, et c'est la rangée qui la fixe — voir `--l-sachet` dans
 * `app/globals.css`. Un gabarit en pixels codé dans le composant obligeait à
 * choisir entre un sachet lisible sur un ordinateur et un sachet qui tienne
 * dans un téléphone.
 */
const RATIO = 1.865;

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
 * Il ne bouge pas tout seul : il est porté par une bande que `app/globals.css`
 * fait traverser le sachet, puis attendre quelques secondes.
 *
 * Les deux tiers du dégradé sont transparents, et ce n'est pas du gaspillage.
 * Il est incliné de douze degrés, et la bande est haute : sur 376 pixels, cette
 * inclinaison décale le dégradé de 78 pixels d'un bord à l'autre. Avec des
 * fondus courts, les bords de la bande tombaient donc dans du non-transparent —
 * on voyait un trait vertical net là où la lumière s'arrêtait, et la marche de
 * couleur avec le sachet en dessous.
 */
const ECLAT = `linear-gradient(102deg,
  rgb(255 255 255 / 0) 0%,
  rgb(255 255 255 / 0) 28%,
  rgb(222 238 252 / 0.07) 37%,
  rgb(233 245 255 / 0.24) 45%,
  rgb(247 252 255 / 0.4) 50%,
  rgb(233 245 255 / 0.24) 55%,
  rgb(222 238 252 / 0.07) 63%,
  rgb(255 255 255 / 0) 72%,
  rgb(255 255 255 / 0) 100%)`;

/**
 * Le rythme du reflet, par rareté garantie.
 *
 * Plus le booster est haut dans l'échelle, plus la lumière le traverse souvent
 * et plus elle est franche. C'est le seul signal continu qui distingue les
 * quatre sachets une fois qu'ils sont alignés : la couleur de la lueur dit
 * laquelle, la fréquence du reflet dit combien.
 *
 * La durée est celle du **cycle entier** — la traversée en occupe un peu moins
 * de la moitié, le reste est un temps mort. Un reflet perpétuel ne se remarque
 * plus ; c'est l'attente qui en fait un évènement.
 *
 * La force est une opacité, donc plafonnée à 1 : l'échelle monte jusque-là au
 * lieu de la dépasser. Une première version culminait à 1,3 pour les deux
 * raretés les plus hautes, et le navigateur ramenait les deux à 1 — elles
 * brillaient exactement pareil.
 */
const REFLET: Record<string, { duree: string; force: string }> = {
  C: { duree: '18s', force: '0.55' },
  R: { duree: '14s', force: '0.75' },
  UR: { duree: '10.5s', force: '0.93' },
  L: { duree: '9s', force: '1' },
};

/** La rareté garantie du booster donne sa couleur au halo. */
const GEMME: Record<string, string> = {
  C: 'var(--ice)',
  R: 'var(--r-r)',
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
        aspectRatio: `1 / ${RATIO}`,
        // Les teintes sont posées ici et non sur le sachet : le halo, qui vit
        // en dehors de la boîte qui tourne, doit les lire lui aussi.
        ['--p1' as string]: gradient[0],
        ['--p2' as string]: gradient[1],
        ['--eclat' as string]: ECLAT,
        ['--gemme' as string]: GEMME[rarete ?? 'C'] ?? GEMME.C,
        ['--duree-reflet' as string]: (REFLET[rarete ?? 'C'] ?? REFLET.C).duree,
        ['--force-reflet' as string]: (REFLET[rarete ?? 'C'] ?? REFLET.C).force,
        // La planche sert trois fois : elle est le sachet, elle est sa lueur
        // floue, et elle découpe le reflet balayant. D'où la variable.
        ...(art ? { ['--planche' as string]: `url("${art}")` } : null),
      }}
    >
      <div
        className={`sachet ${vignette ? 'sachet-veille' : ''} ${frozen ? 'sachet-fige' : ''}`}
        style={{
          ['--retard' as string]: retard,
        }}
        role="img"
        aria-label={`Sachet ${name}, ${cardCount} cartes`}
      >
        <div className="sachet-face">
          {art ? (
            <>
              {/* La lueur est la planche elle-même, floutée et posée derrière.
                  Un halo en forme de boîte ne convenait plus : les planches
                  sont peintes en perspective, leurs coins sont transparents, et
                  la lueur s'y voyait au travers comme un cadre gris. Celle-ci
                  épouse forcément la silhouette, quelle qu'elle soit. */}
              <span
                className={`sachet-lueur ${vignette ? 'sachet-lueur-voisin' : ''}`}
                aria-hidden="true"
              />
              <span className="sachet-planche" aria-hidden="true" />
            </>
          ) : (
            <PackArtwork name={name} cardCount={cardCount} tint={gradient} />
          )}
          {/* Le reflet est découpé par la planche, sinon il peindrait un
              rectangle clair par-dessus les coins transparents. */}
          <span
            className={`sachet-eclat ${art ? 'sachet-eclat-decoupe' : ''}`}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
