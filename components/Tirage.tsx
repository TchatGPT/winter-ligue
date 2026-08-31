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
 * Vingt-six : chaque tuile porte une illustration vectorielle d'une quinzaine
 * de tracés, et il faut monter toute la bande avant que la première image ne
 * s'affiche. C'est aussi ce qui règle le rythme — moins de tuiles sur la même
 * durée, c'est un défilement plus lent, donc des hésitations plus lisibles.
 */
const AVANT = 26;

/**
 * Combien restent au-dessus d'elle.
 *
 * La bande descend : ce sont donc les tuiles qui restent visibles **après**
 * l'arrêt, au-dessus du repère. Sans elles, la bande finirait sur du vide.
 */
const APRES = 3;

/** Combien de tuiles tiennent dans la hauteur de la fenêtre. */
const VISIBLES = 3.2;

/**
 * Durée du défilement de la première piste, en millisecondes.
 *
 * Quatre secondes deux pour le premier rouleau, et le dernier s'arrête à 6,3 —
 * la cascade allonge l'ensemble sans allonger chaque rouleau. Le temps de
 * comprendre ce qui défile, il faut que ça dure ; mais cinq rouleaux à cinq
 * secondes chacun feraient une ouverture interminable.
 */
const DUREE = 4200;
const DUREE_REDUITE = 900;

/**
 * Décalage d'arrêt d'un rouleau au suivant, en millisecondes.
 *
 * Les cinq partent ensemble et s'arrêtent de gauche à droite. C'est ce décalage
 * qui fait tout le suspense d'une ouverture à cinq : arrêtés en même temps, on
 * ne regarde nulle part et on ne voit rien ; espacés d'une demi-seconde, chaque
 * arrêt est un évènement, et le dernier rouleau qui tourne encore tient le
 * regard à lui seul.
 */
const RELAIS = 520;

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

/**
 * Les positions où le rail hésite, en index de carte avant la gagnante.
 *
 * Chacune reçoit un leurre de rareté haute, et la bande y ralentit presque
 * jusqu'à l'arrêt avant de repartir. `force` est la fraction de vitesse retirée
 * au creux : à 0,965 il n'en reste qu'un trentième, la bande paraît immobile
 * pendant plus d'une seconde, puis repart et bascule d'une tuile.
 *
 * C'est là tout le sujet. Un freinage qu'on remarque à peine ne trompe
 * personne ; il faut y croire pour que la reprise fasse quelque chose. Le
 * dernier creux est donc deux fois plus large et beaucoup plus profond que les
 * deux autres.
 *
 * Les trois sont groupées dans le dernier tiers, et ce n'est pas un choix
 * esthétique : plus tôt, le rail avale trop de cartes par seconde pour qu'un
 * freinage se voie. Placés à sept et onze cartes de la fin, les mêmes creux ne
 * rapportaient que soixante millisecondes — invisibles.
 */
const APPATS = [
  { avant: 7, force: 0.9, largeur: 0.016 },
  { avant: 4, force: 0.93, largeur: 0.02 },
  { avant: 1, force: 0.99, largeur: 0.055 },
];

/**
 * L'amortissement.
 *
 * L'exposant valait cinq. Simulation à l'appui, une queue aussi raide donnait
 * une seconde et demie sur la dernière carte et cinquante millisecondes sur
 * chacune des dix précédentes : les appâts n'avaient nulle part où mordre. À
 * 2, le temps se répartit sur les six dernières tuiles. Simulation à l'appui,
 * l'appât final tient alors 467 ms et la gagnante 550 : l'arrêt sur le leurre
 * dure presque aussi longtemps que le vrai, ce qui est exactement ce qu'il faut
 * pour y croire. À 2,6 la gagnante en prenait le double et l'appât passait
 * inaperçu.
 *
 * En dessous, on devine la gagnante trop tôt et il ne se passe plus rien.
 */
const amorti = (t: number) => 1 - Math.pow(1 - t, 2);

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
  tension,
  onFini,
}: {
  cartes: CarteTirage[];
  gagnante: CarteTirage;
  duree: number;
  /** Horodatage du dernier cran, partagé par tous les rouleaux. */
  cran: React.RefObject<number>;
  /** Horodatage de la dernière montée de tension, partagé lui aussi. */
  tension: React.RefObject<number>;
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
    const rang = (c: CarteTirage) => RARITY_ORDER[c.rarity as Rarity] ?? 0;
    const hautes = pioche.filter((c) => rang(c) >= 4);
    const rares = hautes.length ? hautes : pioche;

    /*
     * Le dernier appât prend la carte la plus rare qui existe.
     *
     * Pas une rare au hasard : c'est celle sur laquelle la bande va rester
     * immobile plus d'une demi-seconde, à un cran de l'arrêt. Une ultra rare y
     * fait déjà de l'effet ; une légendaire fait le sien.
     */
    const sommet = pioche.reduce((a, b) => (rang(b) > rang(a) ? b : a), pioche[0]);

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
    /*
     * La gagnante est en tête de bande, les leurres derrière elle.
     *
     * La bande descend : ce sont donc les index **supérieurs** à celui de la
     * gagnante qui traversent le repère avant elle. Un appât « à une tuile
     * avant » est celui juste en dessous dans le tableau.
     */
    for (const a of APPATS) {
      items[APRES + a.avant] =
        a.avant === 1 ? sommet : rares[Math.floor(Math.random() * rares.length)];
    }
    items[APRES] = gagnante;
    return items;
  });

  useEffect(() => {
    const boite = cadre.current;
    const el = rail.current;
    if (!boite || !el) return;

    const reduit =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduit ? DUREE_REDUITE : duree;

    const hauteur = boite.clientHeight;
    /*
     * La hauteur d'une tuile est déduite de celle de la fenêtre, et posée en
     * variable CSS.
     *
     * C'est ce qui garantit que le style et le calcul d'arrêt parlent de la même
     * chose. Une hauteur fixée des deux côtés a déjà divergé une fois, et le
     * rail s'arrêtait alors deux tuiles à côté de la bonne.
     */
    const hTuile = hauteur / VISIBLES - GOUTTIERE;
    const pas = hTuile + GOUTTIERE;
    el.style.setProperty('--h-tuile', `${hTuile.toFixed(1)}px`);

    // L'arrivée est décalée dans la tuile, jamais pile au centre : une bande qui
    // s'immobilise exactement sur l'axe se lit comme une grille qui se replace,
    // pas comme un objet lancé qui s'arrête.
    const dedans = (Math.random() - 0.5) * pas * 0.24;

    /*
     * La bande descend, donc elle part d'en haut et revient.
     *
     * La gagnante est à l'index `APRES` ; les leurres qui défilent sont ceux
     * qui la suivent dans le tableau. On démarre la bande remontée de tout le
     * trajet et on la laisse redescendre : les tuiles traversent le repère du
     * haut vers le bas, et l'index sous le repère décroît jusqu'à `APRES`.
     */
    const yFin = hauteur / 2 - (APRES * pas + hTuile / 2) + dedans;
    const cible = AVANT * pas;
    const yDebut = yFin - cible;

    // Les appâts, exprimés en fraction du trajet : c'est ce que la table attend.
    const table = tableAppats(APPATS.map((a) => (cible - a.avant * pas) / cible));

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
    /*
     * Une seule montée de tension pour toute l'ouverture.
     *
     * Cinq rouleaux qui la déclenchent chacun de leur côté ne font pas cinq fois
     * plus de tension : ils font une nappe continue, et une nappe continue
     * n'annonce plus rien. Le premier rouleau qui y a droit la réserve pour tout
     * le monde.
     */
    const minuterie =
      rang >= 4
        ? setTimeout(() => {
            const maintenant = performance.now();
            if (maintenant - tension.current < 2_000) return;
            tension.current = maintenant;
            bruitDeTension();
          }, Math.max(0, total - 800))
        : null;

    let debut = 0;
    let dernier = -1;
    let precedentX = 0;
    let precedentFlou = -1;
    let trame = 0;

    const image = (temps: number) => {
      if (!debut) debut = temps;
      const t = Math.min(1, (temps - debut) / total);
      const x = gauchit(table, amorti(t)) * cible;
      el.style.transform = `translate3d(0, ${(yDebut + x).toFixed(1)}px, 0)`;

      const f = reduit ? 0 : flou(x - precedentX);
      if (f !== precedentFlou) {
        precedentFlou = f;
        el.style.filter = f > 0 ? `blur(0 ${f}px)`.replace('blur(0 ', 'blur(') : '';
      }
      precedentX = x;

      const index = Math.round((hauteur / 2 - (yDebut + x) - hTuile / 2) / pas);
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
      if (minuterie) clearTimeout(minuterie);
    };
  }, [duree, cran, tension, gagnante.rarity]);

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
              className={`tirage-carte ${i === APRES ? 'tirage-carte-gagnante' : ''}`}
              data-rang={RARITY_ORDER[c.rarity as Rarity] ?? 0}
              style={{ ['--r' as string]: m.color, ['--d' as string]: m.deep }}
              aria-hidden={i !== APRES}
            >
              {/* La barre de rareté, en tête de tuile. Dans une colonne
                  étroite, c'est elle qu'on voit passer : le nom et le palier ne
                  se lisent qu'une fois la bande ralentie. */}
              <span className="tirage-barre" aria-hidden="true" />

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

              {/* Le nom, puis le palier. Sans le nom, une bande d'illustrations
                  vues à cent pixels n'est qu'une suite de taches colorées : on ne
                  reconnaît pas ce qui passe, donc on n'espère rien. */}
              <span className="tirage-nom">{c.name}</span>
              <span className="tirage-palier">{m.label}</span>
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
 * Le tirage : un rouleau par carte, tous en parallèle.
 *
 * ## La disposition
 *
 * Autant de colonnes que le booster donne de cartes, côte à côte, et **un seul
 * repère horizontal** qui les traverse toutes. Un repère par colonne donnerait
 * cinq machines juxtaposées ; une seule ligne en fait un appareil.
 *
 * ## Les arrêts en cascade
 *
 * Les rouleaux partent ensemble et s'arrêtent de gauche à droite, à `RELAIS`
 * d'intervalle. C'est là tout le suspense d'une ouverture à cinq : arrêtés en
 * même temps, on ne regarde nulle part et on ne voit rien. Espacés d'une
 * demi-seconde, chaque arrêt est un évènement, et le dernier rouleau qui tourne
 * encore tient le regard à lui seul.
 *
 * ## L'alignement n'est pas rigide
 *
 * Chaque rouleau s'arrête avec un décalage vertical tiré au hasard dans le quart
 * central de sa tuile. Cinq colonnes alignées au pixel près se lisent comme une
 * grille qui se replace ; cinq colonnes légèrement désalignées se lisent comme
 * cinq objets lancés qui se sont arrêtés.
 *
 * ## Rien n'est tiré ici
 *
 * Les cartes gagnantes arrivent en propriété, décidées par le serveur au moment
 * de l'achat — `purchaseAndOpen` tire les cinq d'un coup, débite le prix et
 * renvoie le tableau. Les rouleaux ne mettent en scène que le rythme de leur
 * révélation, et aucun appât ne peut devenir la carte sur laquelle on s'arrête.
 */
export function Tirage({
  cartes,
  gagnantes,
  onFini,
}: {
  /** Le catalogue, pour peupler les rouleaux de leurres. */
  cartes: CarteTirage[];
  gagnantes: CarteTirage[];
  onFini: () => void;
}) {
  const cran = useRef(0);
  const tension = useRef(0);
  const restants = useRef(gagnantes.length);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  // Le roulement couvre toute l'ouverture. Un par rouleau ne ferait pas un
  // grondement cinq fois plus fort, il ferait de la boue.
  useEffect(() => bruitDeRoulement(), []);

  const unDeMoins = () => {
    restants.current -= 1;
    // Une pause après le dernier arrêt : sans elle, la grille remplace les
    // rouleaux dans l'image qui suit le dernier clac, et on n'a rien vu.
    if (restants.current <= 0) setTimeout(() => fini.current(), 1_200);
  };

  return (
    <div className="tirage">
      <div
        className="tirage-scene"
        style={{ ['--rouleaux']: gagnantes.length } as React.CSSProperties}
      >
        {gagnantes.map((g, i) => (
          <Piste
            key={`${g.cardId}-${i}`}
            cartes={cartes}
            gagnante={g}
            duree={DUREE + i * RELAIS}
            cran={cran}
            tension={tension}
            onFini={unDeMoins}
          />
        ))}

        {/* Le repère, posé au-dessus des cinq colonnes. */}
        <span className="tirage-repere" aria-hidden="true" />
        <span className="tirage-voile tirage-voile-gauche" aria-hidden="true" />
        <span className="tirage-voile tirage-voile-droite" aria-hidden="true" />
      </div>
    </div>
  );
}
