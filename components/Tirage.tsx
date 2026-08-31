'use client';

import { useEffect, useRef, useState } from 'react';
import { aUneIllustration, CardArt } from '@/components/CardArt';
import { CardFrame } from '@/components/CardFrame';
import {
  bruitDeCran,
  bruitDeGain,
  bruitDeRoulement,
  bruitDeTension,
} from '@/components/bruitage';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

export interface CarteTirage {
  cardId: string;
  name: string;
  description: string;
  rarity: string;
  glyph: string;
  /** Absents pour une carte de collection, qui ne se joue pas. */
  power?: number;
  nature?: 'bonus' | 'malus';
}

/**
 * Combien de leurres défilent avant la gagnante.
 *
 * Il y a une piste par carte, donc jusqu'à cinq rails montés d'un coup, et
 * chaque carte porte une illustration vectorielle d'une quinzaine de tracés.
 * Vingt-six tient la charge, et sert le rythme : moins de cartes sur la même
 * durée, c'est un défilement plus lent, donc des hésitations plus lisibles.
 */
const AVANT = 26;

/** Combien restent après elle, pour qu'aucune piste ne finisse sur du vide. */
const APRES = 4;

/**
 * Durée du défilement de la première piste, en millisecondes.
 *
 * Cinq secondes deux. Les versions à trois et à trois huit se lisaient comme un
 * mécanisme qui se replace, pas comme un tirage : le temps de comprendre ce qui
 * défile, c'était fini. C'est long — et c'est le sujet : ce qu'on achète en
 * ouvrant un booster, c'est cette attente-là.
 */
const DUREE = 4600;
const DUREE_REDUITE = 900;

/**
 * Durée des bandes suivantes.
 *
 * Deux fois plus court. Le suspense d'un booster se joue à la première carte :
 * après, on veut savoir, on ne veut plus attendre.
 */
const DUREE_SUIVANTE = 2400;

/**
 * Gouttière horizontale entre deux tuiles, en pixels.
 *
 * Zéro : les tuiles sont jointives, découpées par un liseré et non par un vide.
 * C'est la disposition des sites d'ouverture, et elle tient à une raison — une
 * bande continue défile, des tuiles espacées glissent. Le vide entre deux objets
 * casse la lecture du mouvement.
 *
 * Doit rester d'accord avec le `gap` de `.tirage-rail` : c'est de ce pas que
 * le composant déduit la position d'arrêt.
 */
const GOUTTIERE = 0;

/** Rapport hauteur/largeur d'une carte du rail — celui du cadre peint. */
const RATIO = 1.4;

/**
 * Les positions où le rail hésite, en index de carte avant la gagnante.
 *
 * Chacune reçoit un leurre de rareté haute, et le rail y ralentit presque
 * jusqu'à l'arrêt avant de repartir. `force` est la fraction de vitesse retirée
 * au creux : à 0,9 il ne reste qu'un dixième de l'élan, et on croit vraiment que
 * c'est fini.
 *
 * Les trois sont groupées dans le dernier tiers, et ce n'est pas un choix
 * esthétique : plus tôt, le rail avale trop de cartes par seconde pour qu'un
 * freinage se voie. Placés à sept et onze cartes de la fin, les mêmes creux ne
 * rapportaient que soixante millisecondes — invisibles.
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
 * chacune des dix précédentes : les appâts n'avaient nulle part où mordre. À
 * 2,8, le temps se répartit sur les six dernières cartes.
 *
 * En dessous, on devine la gagnante trop tôt et il ne se passe plus rien.
 */
const amorti = (t: number) => 1 - Math.pow(1 - t, 2.8);

/** Résolution de la table de gauchissement. */
const PAS_TABLE = 600;

/**
 * Intègre le poids de vitesse pour en faire une position.
 *
 * ## Pourquoi une intégrale
 *
 * L'effet recherché — le rail freine sur une légendaire, s'y attarde, puis
 * repart — se décrit naturellement comme une **vitesse** qui s'effondre à
 * certains endroits. Mais l'animation a besoin d'une **position** à chaque
 * image.
 *
 * Retirer directement une bosse à la position aurait été plus court à écrire, et
 * faux : la courbe cesserait d'être croissante et le rail reculerait au sortir
 * du creux. On part donc d'un poids strictement positif — `1` moins des cloches
 * dont la somme reste sous 1 — et on l'intègre. Une intégrale de fonction
 * positive est croissante par construction : le rail ne peut pas revenir en
 * arrière, quelles que soient les valeurs choisies plus haut.
 *
 * La table est normalisée pour finir exactement à 1, donc l'arrêt tombe sur la
 * gagnante, appâts ou pas.
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
 * Le flou de vitesse, par paliers.
 *
 * Une valeur continue serait plus juste et beaucoup plus chère : un `filter`
 * force le navigateur à re-tramer toute la bande, et le refaire à chaque image
 * coûterait plus que l'animation elle-même. Arrondi à six paliers, le
 * re-tramage n'a lieu que six fois par tirage, et l'œil ne fait pas la
 * différence — c'est la traînée qu'il perçoit, pas son rayon exact.
 */
function flou(vitesse: number): number {
  return Math.min(5, Math.round(vitesse / 9));
}

/**
 * Une piste : un rail horizontal qui s'arrête sur une carte.
 *
 * Les mesures sont prises au montage sur la hauteur réelle de la piste, et non
 * figées en constantes : elle se resserre sur téléphone, et un pas codé en dur
 * y décalerait l'arrêt de plusieurs cartes.
 */
function Piste({
  cartes,
  gagnante,
  duree,
  cran,
  onFini,
}: {
  cartes: CarteTirage[];
  gagnante: CarteTirage;
  duree: number;
  /** Horodatage du dernier cran, partagé par toutes les pistes. */
  cran: React.RefObject<number>;
  onFini: () => void;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [arrete, setArrete] = useState(false);

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

    /*
     * Aucun doublon à moins de trois cases d'écart.
     *
     * Tiré à plat, le hasard collait deux fois la même carte dans le champ de
     * vision une fois sur trois — et avec vingt-quatre cartes pour cent
     * soixante cases, la bande donnait l'impression d'un jeu de six. Ce n'est
     * pas la fréquence des répétitions qui gêne, c'est de les voir ensemble.
     */
    const items: CarteTirage[] = [];
    for (let i = 0; i < AVANT + 1 + APRES; i += 1) {
      const recents = items.slice(-3).map((c) => c.cardId);
      const libres = pioche.filter((c) => !recents.includes(c.cardId));
      const source = libres.length ? libres : pioche;
      items.push(source[Math.floor(Math.random() * source.length)]);
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
    const lCarte = hauteur / RATIO;
    const pas = lCarte + GOUTTIERE;

    // L'arrivée est décalée dans la carte, jamais pile au centre : un rail qui
    // s'immobilise exactement sur l'axe se lit comme une grille qui se replace,
    // pas comme un objet lancé qui s'arrête.
    const dedans = (Math.random() - 0.5) * pas * 0.28;
    const cible = AVANT * pas + lCarte / 2 - largeur / 2 + dedans;

    // Les appâts, exprimés en fraction du trajet : c'est ce que la table attend.
    const table = tableAppats(
      APPATS.map((a) => ((AVANT - a.avant) * pas + lCarte / 2 - largeur / 2) / cible),
    );

    /*
     * La montée de tension, programmée avant l'arrêt.
     *
     * Elle ne se déclenche qu'à partir de l'ultra rare, et c'est ce qui la rend
     * efficace : entendue à chaque ouverture, elle ne voudrait plus rien dire.
     * Elle démarre huit dixièmes de seconde avant l'arrêt, soit à peu près au
     * moment où le rail franchit le dernier appât — le joueur entend que ça
     * tourne bien avant de voir sur quoi.
     */
    const rang = RARITY_ORDER[gagnante.rarity as Rarity] ?? 0;
    const tension = rang >= 4 ? setTimeout(bruitDeTension, Math.max(0, total - 800)) : null;

    let debut = 0;
    let dernier = -1;
    let precedentX = 0;
    let precedentFlou = -1;
    let trame = 0;

    const image = (temps: number) => {
      if (!debut) debut = temps;
      const t = Math.min(1, (temps - debut) / total);
      const x = gauchit(table, amorti(t)) * cible;
      el.style.transform = `translate3d(${-x.toFixed(1)}px, 0, 0)`;

      const f = reduit ? 0 : flou(x - precedentX);
      if (f !== precedentFlou) {
        precedentFlou = f;
        el.style.filter = f > 0 ? `blur(${f}px)` : '';
      }
      precedentX = x;

      const index = Math.round((x + largeur / 2 - lCarte / 2) / pas);
      if (index !== dernier) {
        dernier = index;
        // Le cran est étranglé à l'échelle de toutes les pistes : cinq rails qui
        // sonnent chacun pour soi font un bourdonnement, pas un rythme.
        if (temps - cran.current > 55) {
          cran.current = temps;
          bruitDeCran();
        }
      }

      if (t < 1) {
        trame = requestAnimationFrame(image);
        return;
      }
      el.style.filter = '';
      boite.dataset.arrete = 'true';
      setArrete(true);
      bruitDeGain(rang);
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
      if (tension) clearTimeout(tension);
    };
  }, [duree, cran, gagnante.rarity]);

  const meta = RARITY_META[gagnante.rarity as Rarity] ?? RARITY_META.C;

  return (
    <div
      className="tirage-piste"
      ref={cadre}
      data-arrete="false"
      data-rang={RARITY_ORDER[gagnante.rarity as Rarity] ?? 0}
      style={{ ['--gagne' as string]: meta.color }}
    >
      <div className="tirage-rail" ref={rail}>
        {bande.map((c, i) => {
          const m = RARITY_META[c.rarity as Rarity] ?? RARITY_META.C;
          return (
            <div
              key={`${c.cardId}-${i}`}
              className={`tirage-carte ${i === AVANT ? 'tirage-carte-gagnante' : ''}`}
              style={{ ['--r' as string]: m.color, ['--d' as string]: m.deep }}
              aria-hidden={i !== AVANT}
            >
              {/* La pilule, en haut à gauche. Elle ne dit rien que la couleur
                  ne dise déjà — c'est justement son rôle : une marque qu'on
                  repère du coin de l'œil quand la bande file trop vite pour
                  qu'on lise le palier écrit en face. */}
              <span className="tirage-pilule" aria-hidden="true" />
              <span className="tirage-palier">{m.label}</span>

              {/* L'objet dans son anneau pointillé. Le disque isole
                  l'illustration du dégradé de la tuile : sans lui, une scène
                  sombre sur un fond sombre n'a plus de contour. */}
              <span className="tirage-rond">
                {aUneIllustration(c.cardId) ? (
                  <CardArt cardId={c.cardId} className="tirage-vecteur" />
                ) : (
                  <span className="tirage-glyphe">{c.glyph}</span>
                )}
                <span className="tirage-anneau" aria-hidden="true" />
              </span>

              {/* Le nom, puis la puissance. Sans le nom, une bande
                  d'illustrations vues à cent pixels n'est qu'une suite de taches
                  colorées : on ne reconnaît pas ce qui passe, donc on n'espère
                  rien. */}
              <span className="tirage-nom">{c.name}</span>
              {c.power !== undefined && <span className="tirage-valeur num">{c.power}</span>}
            </div>
          );
        })}
      </div>

      {/*
       * La vraie carte, à l'arrêt.
       *
       * Le rail ne peut pas faire défiler des cartes complètes : cent cinquante
       * cadres peints, avec leur image et leur rotation de teinte, ne tiennent
       * pas la cadence. Il fait donc défiler des tuiles simplifiées — et c'est
       * exactement pour ça qu'on « ne voyait pas les vraies cartes ».
       *
       * La solution n'est pas d'alourdir le rail mais de poser la vraie carte au
       * moment où elle compte : à l'arrêt, une seule par piste, celle qu'on a
       * gagnée. Elle recouvre sa tuile et c'est elle qu'on regarde.
       */}
      {/* Les rayons n'apparaissent qu'à partir de la super rare : c'est le
          gradient de récompense, et il ne vaut que s'il reste rare. */}
      {arrete && (RARITY_ORDER[gagnante.rarity as Rarity] ?? 0) >= 3 && (
        <span className="tirage-rayons" aria-hidden="true" />
      )}

      {arrete && (
        <div className="tirage-gagnee">
          <CardFrame
            cardId={gagnante.cardId}
            name={gagnante.name}
            description={gagnante.description}
            rarity={gagnante.rarity}
            glyph={gagnante.glyph}
            power={gagnante.power}
            nature={gagnante.nature}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Le tirage : une bande, une carte à la fois.
 *
 * ## Pourquoi une seule bande
 *
 * Il y en avait une par carte, empilées. À cinq pistes dans la hauteur d'un
 * panneau, chacune tombait à cent soixante-dix pixels et les tuiles à cent
 * vingt de large : trop petites pour qu'on lise quoi que ce soit, et cinq
 * rangées qui s'arrêtent à contretemps donnent une grille agitée, pas une
 * machine. Les sites d'ouverture n'en montrent qu'une, et large.
 *
 * Les cartes se tirent donc l'une après l'autre, et celles déjà gagnées
 * s'alignent en dessous. On voit ce qu'on a, on attend ce qui vient.
 *
 * ## Le rythme
 *
 * La première bande prend son temps ; les suivantes vont deux fois plus vite.
 * Le suspense d'un booster se joue à la première carte — après, on veut savoir,
 * on ne veut plus attendre. Cinq cartes tiennent ainsi en une douzaine de
 * secondes au lieu d'une éternité.
 *
 * ## Ce qui n'est pas de moi
 *
 * La disposition de la tuile et du repère est calquée sur une capture
 * d'EmpireDrop fournie par le commanditaire. Leur code est inaccessible — le
 * site répond par une page de vérification de navigateur qui exige d'exécuter
 * du JavaScript — donc rien n'en est copié : seule l'apparence visible a été
 * reproduite, et les mécaniques (table d'appâts, flou de vitesse, graduation
 * par rareté) sont écrites ici.
 *
 * Rien n'est tiré ici non plus. Les cartes gagnantes arrivent en propriété,
 * décidées par le serveur au moment de l'achat ; la bande ne met en scène que
 * le rythme de leur révélation.
 */
export function Tirage({
  cartes,
  gagnantes,
  onFini,
}: {
  /** Le catalogue, pour peupler la bande de leurres. */
  cartes: CarteTirage[];
  gagnantes: CarteTirage[];
  onFini: () => void;
}) {
  const cran = useRef(0);
  const [courante, setCourante] = useState(0);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  // Le roulement couvre tout le tirage et s'arrête avec le composant. Un
  // roulement par bande se rallumerait à chaque carte, ce qui hache l'attente
  // au lieu de la porter.
  useEffect(() => bruitDeRoulement(), []);

  const gagnante = gagnantes[courante];
  const acquises = gagnantes.slice(0, courante);

  const passeALaSuivante = () => {
    // Une pause après l'arrêt : sans elle, la bande suivante démarre dans
    // l'image qui suit le clac, et on n'a pas vu ce qu'on a gagné.
    setTimeout(() => {
      if (courante + 1 >= gagnantes.length) fini.current();
      else setCourante((n) => n + 1);
    }, 1_100);
  };

  if (!gagnante) return null;

  return (
    <div className="tirage">
      <div className="tirage-compte">
        Carte <span className="num">{courante + 1}</span> sur{' '}
        <span className="num">{gagnantes.length}</span>
      </div>

      <div className="tirage-scene">
        <Piste
          // La clé porte l'index : changer de carte doit remonter la bande, pas
          // la réutiliser — sinon l'animation reprendrait là où elle s'est
          // arrêtée.
          key={courante}
          cartes={cartes}
          gagnante={gagnante}
          duree={courante === 0 ? DUREE : DUREE_SUIVANTE}
          cran={cran}
          onFini={passeALaSuivante}
        />

        <span className="tirage-repere" aria-hidden="true" />
        <span className="tirage-voile tirage-voile-gauche" aria-hidden="true" />
        <span className="tirage-voile tirage-voile-droite" aria-hidden="true" />
      </div>

      {/* Les cartes déjà gagnées, alignées sous la bande. */}
      {acquises.length > 0 && (
        <div className="tirage-acquises">
          {acquises.map((c, i) => (
            <div key={`${c.cardId}-${i}`} className="tirage-acquise">
              <CardFrame
                cardId={c.cardId}
                name={c.name}
                description={c.description}
                rarity={c.rarity}
                glyph={c.glyph}
                power={c.power}
                nature={c.nature}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
