'use client';

import { useEffect, useRef, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
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
 * Huit. C'est le réglage qui commande la douceur, et de loin le plus sensible
 * de tout le fichier.
 *
 * Seize cartes à parcourir dans le même temps, c'est une bande qui file à
 * dix-huit pixels par image, qu'il faut ensuite arrêter — et tout ce que
 * l'amortissement rattrape à la fin se paie en à-coups. À huit, la pointe tombe
 * à **cinq** pixels par image et la secousse maximale est divisée par huit.
 *
 * Le second effet est qu'il reste du temps pour les hésitations. Sur seize
 * cartes, la queue d'amortissement mangeait tout et les appâts n'avaient nulle
 * part où mordre ; sur huit, l'appât final tient près de deux secondes.
 *
 * C'est enfin ce qui règle le coût : chaque tuile est une vraie carte — cadre
 * peint, rotation de teinte, illustration vectorielle — et cinq rouleaux de
 * douze font déjà soixante cartes à mettre en page d'un coup.
 */
const AVANT = 8;

/**
 * Combien restent au-dessus d'elle.
 *
 * La bande descend : ce sont donc les tuiles qui restent visibles **après**
 * l'arrêt, au-dessus du repère. Sans elles, la bande finirait sur du vide.
 */
const APRES = 3;

/**
 * Le rapport hauteur/largeur d'une carte, celui du cadre peint.
 *
 * C'est lui qui donne la hauteur d'une tuile, à partir de la largeur mesurée de
 * la colonne. Le nombre de cartes visibles en découle au lieu d'être imposé :
 * les deux ne peuvent pas diverger.
 */
const RATIO_CARTE = 2231 / 1514;

/**
 * Durée du défilement du premier rouleau, en millisecondes.
 *
 * Neuf secondes et demie pour le premier, onze et demie pour le dernier : la
 * cascade
 * allonge l'ensemble sans allonger chaque rouleau. Le temps de comprendre ce qui
 * défile, il faut que ça dure — et c'est cette durée, plus que tout le reste,
 * qui laisse la place aux trois hésitations.
 */
const DUREE = 9500;
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
const RELAIS = 500;

/**
 * Espace vertical entre deux cartes d'un rouleau, en pixels.
 *
 * Trente-quatre, et non quatorze. Quatorze pixels entre deux cartes de deux
 * cents, c'est un empilement : on lit une planche découpée, pas des objets qui
 * défilent. Il en faut assez pour voir le fond passer entre deux.
 *
 * Doit rester d'accord avec l'espacement de `.tirage-rail` : c'est de ce pas
 * que le composant déduit la position d'arrêt, et un écart de quelques pixels
 * décalerait l'arrêt d'une carte entière au bout de seize.
 */
const GOUTTIERE = 34;

/**
 * Les positions où le rail hésite, en index de carte avant la gagnante.
 *
 * Chacune reçoit un leurre de rareté haute, et la bande y ralentit presque
 * jusqu'à l'arrêt avant de repartir. `force` est la fraction de vitesse retirée
 * au creux, `largeur` son étalement en fraction du trajet.
 *
 * ## Le dernier creux est étroit, et c'est contre-intuitif
 *
 * Les deux premiers sont larges : loin de l'arrivée la bande va vite, et un
 * freinage brusque s'y sentirait comme un à-coup plutôt que comme une
 * hésitation. Le dernier, lui, a été **rétréci** de 0,085 à 0,04. Un creux large
 * juste avant la fin se confond avec l'amortissement — tout est lent à cet
 * endroit, donc un ralentissement de plus ne se remarque pas. Simulation à
 * l'appui : à 0,085 le leurre ne tenait que 800 ms contre 650 pour sa voisine,
 * un rapport de 1,2 que personne ne perçoit ; à 0,04 il tient **1 533 ms contre
 * 783**, soit deux fois plus.
 *
 * Le chiffre qui compte est le dernier : l'appât s'arrête **plus longtemps que
 * la gagnante** (1 533 ms contre 900). C'est ce renversement qui fait qu'on y
 * croit vraiment, et que la reprise fait quelque chose.
 */
const APPATS = [
  { avant: 6, force: 0.9, largeur: 0.032 },
  { avant: 3, force: 0.94, largeur: 0.042 },
  { avant: 1, force: 0.95, largeur: 0.04 },
];

/**
 * L'amortissement.
 *
 * L'exposant a valu cinq, puis deux ; il vaut 1,25. Une queue raide concentre
 * toute la décélération sur la dernière poignée d'images : c'est là que naissent
 * les à-coups, et c'est aussi ce qui écrase les appâts, puisque tout est déjà
 * lent quand ils arrivent.
 *
 * Simulation à l'appui, en passant de 2,4 à 1,25 : la vitesse de pointe tombe
 * de 14,6 à 5,2 pixels par image et la secousse maximale de 9,7 à 3,9. La bande
 * ralentit sur presque tout son trajet au lieu de freiner d'un coup à la fin —
 * c'est exactement ce qu'on appelle un mouvement fluide.
 *
 * En dessous, la bande garde sa vitesse jusqu'au bout et l'arrêt claque.
 */
const amorti = (t: number) => 1 - Math.pow(1 - t, 1.25);

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
    /*
     * Jamais nul : un poids nul immobiliserait le rail pour de bon.
     *
     * Mais pas trop haut non plus. À 0,05, le plancher rognait le fond des
     * creux les plus profonds — la bande les traversait plus vite que demandé et
     * les hésitations perdaient un tiers de leur durée sans que rien ne le
     * signale. C'est le genre de garde-fou qui fausse silencieusement le réglage
     * qu'il protège.
     */
    cumul += Math.max(0.02, poids);
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
  onFini,
}: {
  cartes: CarteTirage[];
  gagnante: CarteTirage;
  duree: number;
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
     * La hauteur d'une tuile se déduit de la largeur **mesurée** de la tuile.
     *
     * Pas de celle du rouleau : le rail a des marges intérieures pour laisser
     * respirer le halo, et une carte y est plus étroite que sa colonne. Déduire
     * le pas de la colonne le surestimait de vingt pixels par tuile, soit
     * l'équivalent d'une carte entière au bout de seize — le rail se serait
     * arrêté à côté.
     *
     * Une tuile est une vraie carte, donc son rapport est fixé par le cadre
     * peint : le style n'a rien à décider au-delà de la largeur, et les deux
     * côtés ne peuvent pas diverger sur la hauteur. Une hauteur fixée des deux
     * côtés l'a déjà fait, et le rail s'arrêtait deux tuiles trop loin.
     */
    const tuile = el.firstElementChild;
    const large = tuile ? tuile.getBoundingClientRect().width : boite.clientWidth;
    const hTuile = large * RATIO_CARTE;
    const pas = hTuile + GOUTTIERE;

    /*
     * L'arrivée tombe pile au centre.
     *
     * Un décalage aléatoire avait été introduit pour que l'alignement ne soit pas
     * rigide au pixel près. Avec de vraies cartes, l'effet s'inverse : une carte
     * qui dépasse du repère se lit comme un arrêt raté, pas comme un objet lancé.
     * Ce qui vaut pour des jetons ne vaut pas pour un objet qu'on veut regarder.
     */
    const dedans = 0;

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
    let debut = 0;
    let trame = 0;

    const image = (temps: number) => {
      if (!debut) debut = temps;
      const t = Math.min(1, (temps - debut) / total);
      const x = gauchit(table, amorti(t)) * cible;
      el.style.transform = `translate3d(0, ${(yDebut + x).toFixed(1)}px, 0)`;

      if (t < 1) {
        trame = requestAnimationFrame(image);
        return;
      }
      boite.dataset.arrete = 'true';
      setArrete(true);
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
  }, [duree]);

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
            /*
             * La tuile est la carte elle-même, dans son cadre peint.
             *
             * Elle a longtemps été une pastille — un disque d'illustration dans
             * un anneau — pour tenir la cadence. Mais on ouvre un booster pour
             * voir passer des cartes, pas des logos : la pastille ne disait ni
             * ce qu'on frôlait ni ce qu'on ratait. Le nombre de leurres a été
             * divisé pour compenser le coût.
             */
            <div
              key={`${c.cardId}-${i}`}
              className={`tirage-carte ${i === APRES ? 'tirage-carte-gagnante' : ''}`}
              data-rang={RARITY_ORDER[c.rarity as Rarity] ?? 0}
              style={{ ['--r' as string]: m.color }}
              aria-hidden={i !== APRES}
            >
              <CardFrame
                cardId={c.cardId}
                name={c.name}
                rarity={c.rarity}
                glyph={c.glyph}
                power={c.power}
                nature={c.nature}
              />
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

  const restants = useRef(gagnantes.length);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

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
