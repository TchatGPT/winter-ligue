'use client';

import { useEffect, useRef, useState } from 'react';
import { aUneIllustration, CardArt } from '@/components/CardArt';
import { RarityIcon } from '@/components/RarityIcon';
import { bruitDArret, bruitDeCran } from '@/components/bruitage';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

export interface CarteTirage {
  cardId: string;
  name: string;
  rarity: string;
  glyph: string;
}

/**
 * Combien de leurres défilent avant la gagnante.
 *
 * Vingt-six, et pas davantage : il y a maintenant une colonne par carte, donc
 * cinq rails montés d'un coup sur un gros booster. Chaque carte porte une
 * illustration vectorielle d'une quinzaine de tracés — à trente-quatre leurres,
 * la révélation commençait par mettre en page deux cents dessins.
 *
 * Le raccourcissement sert aussi le rythme : moins de cartes sur la même durée,
 * c'est un défilement plus lent, donc des hésitations plus lisibles.
 */
const AVANT = 26;

/** Combien restent après elle, pour qu'aucune colonne ne finisse sur du vide. */
const APRES = 4;

/** Durée du défilement de la première colonne, en millisecondes. */
const DUREE = 3800;
const DUREE_REDUITE = 900;

/** Décalage d'arrêt d'une colonne à la suivante. */
const RELAIS = 550;

/** Gouttière verticale entre deux cartes d'une colonne, en pixels. */
const GOUTTIERE = 10;

/** Rapport hauteur/largeur d'une carte du rail — celui du cadre peint. */
const RATIO = 1.4;

/**
 * Les positions où le rail hésite, en index de carte avant la gagnante.
 *
 * Chacune reçoit un leurre de rareté haute, et le rail y ralentit presque
 * jusqu'à l'arrêt avant de repartir. `force` est la fraction de vitesse retirée
 * au creux : à 0,9 il ne reste qu'un dixième de l'élan, et on croit vraiment que
 * c'est fini.
 */
const APPATS = [
  { avant: 5, force: 0.9, largeur: 0.016 },
  { avant: 3, force: 0.9, largeur: 0.015 },
  { avant: 1, force: 0.88, largeur: 0.014 },
];

/**
 * L'amortissement.
 *
 * L'exposant valait cinq. Simulation à l'appui, une queue aussi raide donnait
 * une seconde et demie sur la dernière carte et cinquante millisecondes sur
 * chacune des dix précédentes : les appâts n'avaient nulle part où mordre, et
 * les deux premiers passaient inaperçus. À 2,8, le temps se répartit sur les
 * six dernières cartes, ce qui laisse le freinage se voir.
 *
 * En dessous, on devine la gagnante trop tôt et il ne se passe plus rien.
 */
const amorti = (t: number) => 1 - Math.pow(1 - t, 2.8);

/** Résolution de la table de gauchissement. */
const PAS_TABLE = 600;

/**
 * Construit la table qui fait hésiter le rail.
 *
 * ## Pourquoi une table, et pourquoi une intégrale
 *
 * L'effet recherché — le rail freine sur une légendaire, s'y attarde, puis
 * repart — se décrit naturellement comme une **vitesse** qui s'effondre à
 * certains endroits. Mais l'animation, elle, a besoin d'une **position** à
 * chaque image.
 *
 * Retirer directement une bosse à la position aurait été plus court à écrire, et
 * faux : la courbe cesserait d'être croissante et le rail reculerait au sortir
 * du creux. On part donc d'un poids stricement positif — `1` moins des cloches
 * dont la somme reste sous 1 — et on l'intègre. Une intégrale de fonction
 * positive est croissante par construction : le rail ne peut pas revenir en
 * arrière, quelles que soient les valeurs choisies plus haut.
 *
 * La table est normalisée pour finir exactement à 1, donc l'arrêt tombe sur la
 * gagnante à l'unité près, appâts ou pas.
 */
function integre(centres: number[]): Float64Array {
  const table = new Float64Array(PAS_TABLE + 1);
  let cumul = 0;
  for (let i = 0; i <= PAS_TABLE; i += 1) {
    const u = i / PAS_TABLE;
    let poids = 1;
    for (let k = 0; k < centres.length; k += 1) {
      const a = APPATS[k];
      const d = (u - centres[k]) / a.largeur;
      poids -= a.force * Math.exp(-d * d);
    }
    // Jamais nul : un poids nul immobiliserait le rail pour de bon.
    cumul += Math.max(0.05, poids);
    table[i] = cumul;
  }
  for (let i = 0; i <= PAS_TABLE; i += 1) table[i] /= cumul;
  return table;
}

/** L'abscisse dont la table donne `valeur`. */
function antecedent(table: Float64Array, valeur: number): number {
  let bas = 0;
  let haut = PAS_TABLE;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (table[milieu] < valeur) bas = milieu + 1;
    else haut = milieu;
  }
  return bas / PAS_TABLE;
}

/**
 * La table, avec les creux calés sur les bonnes cartes.
 *
 * Les positions données sont des fractions du trajet, c'est-à-dire des valeurs
 * en **sortie** de la table ; les creux, eux, se placent en entrée. Les poser
 * directement aux positions visées décalait chaque hésitation d'une carte — le
 * rail freinait sur la voisine du leurre, ce qui ne veut rien dire.
 *
 * Quelques allers-retours suffisent à converger : on construit, on cherche
 * l'antécédent de chaque position, on reconstruit. La table étant strictement
 * croissante, l'antécédent est unique.
 */
function tableAppats(positions: number[]): Float64Array {
  let centres = positions.slice();
  let table = integre(centres);
  for (let n = 0; n < 4; n += 1) {
    centres = positions.map((p) => antecedent(table, p));
    table = integre(centres);
  }
  return table;
}

/** Lit la table avec une interpolation linéaire. */
function gauchit(table: Float64Array, u: number): number {
  const x = Math.min(1, Math.max(0, u)) * PAS_TABLE;
  const i = Math.floor(x);
  if (i >= PAS_TABLE) return table[PAS_TABLE];
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

/**
 * Une colonne : un rail vertical qui s'arrête sur une carte.
 *
 * Les mesures sont prises au montage sur la largeur réelle de la colonne, et
 * non figées en constantes : la grille se resserre sur téléphone, et un pas
 * codé en dur y décalerait l'arrêt de plusieurs cartes.
 */
function Colonne({
  cartes,
  gagnante,
  duree,
  cran,
  onFini,
}: {
  cartes: CarteTirage[];
  gagnante: CarteTirage;
  duree: number;
  /** Horodatage du dernier cran, partagé par toutes les colonnes. */
  cran: React.RefObject<number>;
  onFini: () => void;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  /*
   * La bande, construite une seule fois.
   *
   * Les appâts sont placés ici et pas au hasard : aux index désignés par
   * `APPATS`, on force une carte de rareté haute. C'est tout l'effet — le rail
   * ne peut pas ralentir sur une commune et faire croire à quoi que ce soit.
   */
  const [bande] = useState<CarteTirage[]>(() => {
    const pioche = cartes.length ? cartes : [gagnante];
    const hautes = pioche.filter((c) => (RARITY_ORDER[c.rarity as Rarity] ?? 0) >= 4);
    const rares = hautes.length ? hautes : pioche;

    const items: CarteTirage[] = [];
    for (let i = 0; i < AVANT + 1 + APRES; i += 1) {
      items.push(pioche[Math.floor(Math.random() * pioche.length)]);
    }
    for (const a of APPATS) {
      items[AVANT - a.avant] = rares[Math.floor(Math.random() * rares.length)];
    }
    items[AVANT] = gagnante;
    return items;
  });

  useEffect(() => {
    const boite = cadre.current;
    const el = rail.current;
    if (!boite || !el) return;

    const reduit =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduit ? DUREE_REDUITE : duree;

    const largeur = boite.clientWidth;
    const hauteur = boite.clientHeight;
    const hCarte = largeur * RATIO;
    const pas = hCarte + GOUTTIERE;

    // L'arrivée est décalée dans la carte, jamais pile au centre : un rail qui
    // s'immobilise exactement sur l'axe se lit comme une grille qui se replace,
    // pas comme un objet lancé qui s'arrête.
    const dedans = (Math.random() - 0.5) * pas * 0.28;
    const cible = AVANT * pas + hCarte / 2 - hauteur / 2 + dedans;

    // Les appâts, exprimés en fraction du trajet : c'est ce que la table attend.
    const table = tableAppats(
      APPATS.map((a) => ((AVANT - a.avant) * pas + hCarte / 2 - hauteur / 2) / cible),
    );

    let debut = 0;
    let dernier = -1;
    let trame = 0;

    const image = (temps: number) => {
      if (!debut) debut = temps;
      const t = Math.min(1, (temps - debut) / total);
      const x = gauchit(table, amorti(t)) * cible;
      el.style.transform = `translate3d(0, ${-x.toFixed(1)}px, 0)`;

      const index = Math.round((x + hauteur / 2 - hCarte / 2) / pas);
      if (index !== dernier) {
        dernier = index;
        // Le cran est étranglé à l'échelle de toutes les colonnes : cinq rails
        // qui sonnent chacun pour soi font un bourdonnement, pas un rythme.
        if (temps - cran.current > 55) {
          cran.current = temps;
          bruitDeCran();
        }
      }

      if (t < 1) {
        trame = requestAnimationFrame(image);
        return;
      }
      boite.dataset.arrete = 'true';
      bruitDArret();
      fini.current();
    };

    /*
     * Le départ est décalé d'une image.
     *
     * Au premier `requestAnimationFrame` après le montage, le navigateur n'a pas
     * encore peint les cartes du rail : la première image de l'animation
     * partagerait son budget avec cette mise en page, et le démarrage — le
     * moment le plus rapide, celui où le moindre retard se voit — sauterait.
     */
    let amorce = requestAnimationFrame(() => {
      amorce = requestAnimationFrame(image);
      trame = amorce;
    });
    trame = amorce;

    return () => {
      cancelAnimationFrame(amorce);
      cancelAnimationFrame(trame);
    };
  }, [duree, cran]);

  return (
    <div className="tirage-colonne" ref={cadre} data-arrete="false">
      <span className="tirage-repere" aria-hidden="true" />

      <div className="tirage-rail" ref={rail}>
        {bande.map((c, i) => {
          const meta = RARITY_META[c.rarity as Rarity] ?? RARITY_META.C;
          return (
            <div
              key={`${c.cardId}-${i}`}
              className="tirage-carte"
              style={{ ['--r' as string]: meta.color, ['--d' as string]: meta.deep }}
              aria-hidden={i !== AVANT}
            >
              {aUneIllustration(c.cardId) ? (
                <CardArt cardId={c.cardId} className="tirage-vecteur" />
              ) : (
                <span className="tirage-glyphe">{c.glyph}</span>
              )}
              <span className="tirage-gemme">
                <RarityIcon rarity={c.rarity} taille={16} />
              </span>
            </div>
          );
        })}
      </div>

      <span className="tirage-voile tirage-voile-haut" aria-hidden="true" />
      <span className="tirage-voile tirage-voile-bas" aria-hidden="true" />
    </div>
  );
}

/**
 * Le tirage d'un booster : une colonne par carte.
 *
 * Rien n'est tiré ici. Les cartes gagnantes arrivent en propriété, décidées par
 * le serveur au moment de l'achat ; les rails ne mettent en scène que le rythme
 * de leur révélation. Les cartes qui défilent autour sont des leurres pris dans
 * le catalogue et n'ont aucune existence dans la partie.
 *
 * ## Une colonne par carte, et des arrêts en cascade
 *
 * Une seule colonne, sur la meilleure carte du lot, faisait durer le suspense
 * une fois puis livrait le reste en grille. On voyait donc le booster s'ouvrir
 * une fois pour cinq cartes. Les colonnes s'arrêtent maintenant l'une après
 * l'autre, à `RELAIS` d'intervalle : la tension redémarre à chaque carte, et
 * c'est cette répétition qui donne envie d'en ouvrir un autre.
 *
 * ## Les appâts
 *
 * Aux trois positions de `APPATS`, le rail rencontre une carte de rareté haute
 * et y freine presque jusqu'à l'arrêt avant de repartir. Le joueur croit tenir
 * une ultra rare, et la voit glisser. C'est délibérément frustrant — et c'est
 * honnête : la carte gagnante est décidée avant que la première image ne
 * s'affiche, et aucun appât ne peut devenir la carte sur laquelle on s'arrête.
 *
 * Le défilement est piloté en JavaScript et non en CSS parce qu'il faut savoir,
 * à chaque image, quelle carte passe sous le repère — pour le cran sonore. Une
 * animation CSS ne le dit pas sans forcer un recalcul de style par image.
 */
export function Tirage({
  cartes,
  gagnantes,
  onFini,
}: {
  /** Le catalogue, pour peupler les rails de leurres. */
  cartes: CarteTirage[];
  gagnantes: CarteTirage[];
  onFini: () => void;
}) {
  const cran = useRef(0);
  const restantes = useRef(gagnantes.length);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  const uneDeMoins = () => {
    restantes.current -= 1;
    // Une pause après le dernier arrêt : sans elle, la grille remplace les rails
    // dans l'image qui suit le clac final, et on n'a rien vu.
    if (restantes.current <= 0) setTimeout(() => fini.current(), 700);
  };

  return (
    <div className="tirage" style={{ ['--colonnes' as string]: gagnantes.length }}>
      {gagnantes.map((g, i) => (
        <Colonne
          key={`${g.cardId}-${i}`}
          cartes={cartes}
          gagnante={g}
          duree={DUREE + i * RELAIS}
          cran={cran}
          onFini={uneDeMoins}
        />
      ))}
    </div>
  );
}
