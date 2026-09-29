import type { ReactNode } from 'react';
import { CARDS, RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

/**
 * Les illustrations de cartes, dessinées.
 *
 * Elles étaient jusqu'ici des emojis — 🏰 🥶 🛷 — c'est-à-dire les polices du
 * système d'exploitation du joueur. Trois conséquences : la carte ne ressemblait
 * pas à la même chose sur Windows, sur macOS et sur Android ; la couleur venait
 * de la police et non de la direction artistique, si bien qu'un emoji orange
 * atterrissait dans un cadre bleu nuit ; et la vignette n'était qu'un pictogramme
 * centré, là où une carte à collectionner demande une **scène**.
 *
 * Ce sont donc des vecteurs, et non des fichiers dans `public/cartes/`. Les
 * raisons sont les mêmes que pour {@link RarityIcon} :
 *
 * - le cadre est en `cqw`, l'illustration suit la carte de la vignette de
 *   collection au plein écran de l'ouverture, sans jamais crêper ;
 * - la couleur sort de la rareté — `RARITY_META[…]` — donc changer une teinte de
 *   saison repeint d'un coup les quatre cartes concernées ;
 * - 24 images de bonne facture pèseraient plusieurs centaines de kilooctets et
 *   arriveraient après le reste, alors que l'ouverture d'un booster révèle cinq
 *   cartes d'un coup.
 *
 * `CARD_ART` n'est pas abandonné pour autant : si une vraie illustration est
 * déposée dans `public/cartes/`, {@link CardFrame} la préfère. Ce fichier est
 * le fond de panier, pas un plafond.
 *
 * ## Une grammaire commune, sinon ce n'est pas un jeu de cartes
 *
 * Chaque scène partage le même ciel — un dégradé teinté par la rareté, une
 * lueur basse, une vignette qui enfonce les bords dans le cadre. Ce qui change
 * est la silhouette. C'est ce qui fait qu'on reconnaît une commune d'une
 * légendaire à un mètre de l'écran, avant même de lire son nom.
 */

/** Le repère dans lequel les scènes sont dessinées : un 4/3 paysage. */
const L = 160;

/**
 * La hauteur réelle du dessin, et la descente de la scène dedans.
 *
 * Les scènes ont été composées en 4/3, mais la fenêtre du cadre peint est en
 * portrait — 0,84 de rapport. Laisser `object-fit: cover` s'en charger coûtait
 * 29 % de la largeur : la montagne du Sanctuaire, le cyclone du Blizzard et la
 * clôture de la Congère y perdaient leurs bords, c'est-à-dire ce qui les rendait
 * lisibles.
 *
 * Le dessin est donc rendu dans une boîte plus haute que les scènes. Le fond et
 * la vignette la remplissent entièrement ; la scène y descend de `DECALAGE`,
 * assez bas pour que les scènes bâties sur un sol le posent près du bord, assez
 * haut pour que les scènes à sujet centré ne tombent pas dans le tiers bas.
 */
const HP = 190;
const DECALAGE = 52;

/** Le trait, partout le même : un blanc bleuté, jamais du blanc pur. */
const TRAIT = '#eaf6ff';

/**
 * Le haut du ciel, par rareté.
 *
 * Le bas vient de `RARITY_META[…].deep`, qui est déjà la teinte sombre de la
 * rareté : une seule des deux extrémités est écrite ici, l'autre suit la
 * palette. Indexer le ciel sur la rareté fait de la couleur d'une illustration
 * une information : une carte chaude est une carte rare.
 *
 * Volontairement sombre et peu saturé : la couleur vive est réservée au sujet.
 * Un ciel qui pousse déjà à fond laisse la silhouette sans nulle part où
 * ressortir.
 */
const CIEL_HAUT: Record<Rarity, string> = {
  C: '#0a141d',
  PC: '#04171f',
  R: '#0f0a24',
  SR: '#1c0716',
  UR: '#1a0c04',
  L: '#1a1203',
};

/** Une étoile à quatre branches, la forme d'éclat de tout le jeu. */
function etoile(cx: number, cy: number, r: number, k = 0.3): string {
  const p = r * k;
  return (
    `M${cx} ${cy - r}` +
    `Q${cx + p} ${cy - p} ${cx + r} ${cy}` +
    `Q${cx + p} ${cy + p} ${cx} ${cy + r}` +
    `Q${cx - p} ${cy + p} ${cx - r} ${cy}` +
    `Q${cx - p} ${cy - p} ${cx} ${cy - r}Z`
  );
}

/** Un flocon à six branches, réduit à ses axes. */
function flocon(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI) / 3;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    d += `M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}L${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}`;
  }
  return d;
}

/**
 * Un cristal de givre : six bras, et deux paires de barbes sur chacun.
 *
 * Les barbes ne sont pas un détail décoratif. Une étoile à six branches nues se
 * lit comme un astérisque ; ce sont les ramifications qui la font lire comme du
 * givre, parce que c'est exactement ce qui distingue un flocon d'une croix.
 */
function givre(cx: number, cy: number, r: number): string {
  let d = '';
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    d += `M${cx.toFixed(1)} ${cy.toFixed(1)}L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    for (const [t, b] of [
      [0.44, 0.3],
      [0.72, 0.2],
    ]) {
      const bx = cx + Math.cos(a) * r * t;
      const by = cy + Math.sin(a) * r * t;
      for (const s of [1, -1]) {
        const ba = a + s * 0.9;
        d += `M${bx.toFixed(1)} ${by.toFixed(1)}L${(bx + Math.cos(ba) * r * b).toFixed(1)} ${(by + Math.sin(ba) * r * b).toFixed(1)}`;
      }
    }
  }
  return d;
}

/** Des points de neige, en vrac. `[x, y, rayon]`. */
function Neige({ pts }: { pts: [number, number, number][] }) {
  return (
    <>
      {pts.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={TRAIT} opacity={0.3 + r * 0.28} />
      ))}
    </>
  );
}

/**
 * Le fond commun.
 *
 * Le halo est placé bas et large : il fait office de source lumineuse au sol,
 * et c'est lui qui détache toutes les silhouettes, qui sont posées dessus.
 */
function Fond({ u, rarity, c }: { u: string; rarity: Rarity; c: string }) {
  const haut = CIEL_HAUT[rarity];
  const bas = RARITY_META[rarity].deep;
  return (
    <>
      <defs>
        <linearGradient id={`ciel-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={haut} />
          <stop offset="1" stopColor={bas} />
        </linearGradient>
        {/* La lueur est calée sur le bas de la scène, pas sur le bas de la
            boîte : c'est elle qui détache les silhouettes, et elles sont
            posées là. */}
        <radialGradient id={`lueur-${u}`} cx="50%" cy={`${((DECALAGE + 104) / HP) * 100}%`} r="62%">
          <stop offset="0" stopColor={c} stopOpacity="0.5" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={L} height={HP} fill={`url(#ciel-${u})`} />
      <rect width={L} height={HP} fill={`url(#lueur-${u})`} />
    </>
  );
}

/**
 * La vignette, posée en dernier : elle assombrit les angles et creuse le cadre.
 *
 * Le fondu du bas est ajouté par-dessus, et il n'est pas décoratif : les scènes
 * bâties sur un sol s'arrêtent une dizaine d'unités avant le bord de la boîte
 * portrait, et sans lui on verrait une bande de ciel sous la neige. Assombrie,
 * la même bande se lit comme l'ombre au pied du décor.
 */
function Vignette({ u }: { u: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`vig-${u}`} cx="50%" cy={`${((DECALAGE + 55) / HP) * 100}%`} r="70%">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </radialGradient>
        <linearGradient id={`pied-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect width={L} height={HP} fill={`url(#vig-${u})`} />
      <rect y={HP - 34} width={L} height={34} fill={`url(#pied-${u})`} />
    </>
  );
}

/* ========================================================================== */
/*  Les scènes                                                                */
/* ========================================================================== */

const SCENES: Record<string, (u: string, c: string) => ReactNode> = {
  /* ---- GLACE — verrouiller ce qui est acquis ---------------------------- */

  /**
   * La congère : trois bancs qui s'empilent, et la lèvre que le vent retourne.
   *
   * Le relief est monté haut dans le cadre — une congère plaquée au bas de
   * l'image se lit comme une nappe d'eau, pas comme un tas.
   */
  congere: (u, c) => (
    <>
      <Neige
        pts={[
          [22, 16, 1.6],
          [56, 10, 1.2],
          [90, 22, 1.8],
          [126, 14, 1.3],
          [40, 34, 1.2],
          [112, 40, 1.5],
          [146, 28, 1],
          [70, 44, 1.3],
          [16, 50, 1],
        ]}
      />
      {/* Le banc du fond. */}
      <path d="M0 120V96C34 94 60 82 92 68S140 44 160 40v80Z" fill={c} opacity="0.26" />
      {/*
       * La clôture, avalée par la droite.
       *
       * C'est elle qui fait la congère, et trois versions sans elle ont échoué :
       * des bandes empilées, si molles soient-elles, se lisent comme des vagues.
       * Il faut aussi que la clôture reste **à peu près horizontale** pendant que
       * le tas monte — dans une version où les deux montaient ensemble, les
       * piquets sortaient de la même hauteur d'un bout à l'autre, et plus rien
       * n'était enseveli.
       */}
      <path d="M8 58 152 72" stroke={TRAIT} strokeWidth="2.4" opacity="0.4" />
      <path
        d="M20 58v50M52 61v46M84 65v34M116 68v22M146 71v14"
        stroke={TRAIT}
        strokeWidth="3.2"
        opacity="0.5"
        strokeLinecap="round"
      />
      {/*
       * Le banc principal, en aplat **opaque**.
       *
       * Peint en blanc translucide, il laissait voir les piquets au travers —
       * et une clôture qu'on voit sous la neige n'est pas ensevelie, elle est
       * derrière une vitre. C'est aussi pour cela que le banc a sa propre
       * rampe de gris bleutés plutôt que la teinte de la rareté : de la neige
       * de nuit n'est pas bleue, c'est son ombre qui l'est.
       */}
      <defs>
        <linearGradient id={`neige-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf4fd" />
          <stop offset="0.55" stopColor="#a9cbe2" />
          <stop offset="1" stopColor="#5f8dad" />
        </linearGradient>
      </defs>
      <path
        d="M0 120V108C30 106 52 96 78 82S120 58 160 50v70Z"
        fill={`url(#neige-${u})`}
      />
      <path
        d="M0 108C30 106 52 96 78 82S120 58 160 50"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2.6"
        opacity="0.95"
      />
      {/* La lèvre retournée par le vent, au sommet de la crête. */}
      <path d="M124 58q20-10 36-8-18 2-28 10Z" fill={TRAIT} opacity="0.9" />
      {/* L'ombre bleue au creux du banc. */}
      <path d="M0 120v-6c34-2 60-12 88-22s48-12 72-8v36Z" fill={c} opacity="0.28" />
    </>
  ),

  /** Le bouclier, et le cristal qui le tient. */
  'bouclier-givre': (u, c) => (
    <>
      <path
        d="M80 16 122 32v32c0 26-19 42-42 52-23-10-42-26-42-52V32Z"
        fill={c}
        opacity="0.3"
      />
      <path
        d="M80 16 122 32v32c0 26-19 42-42 52-23-10-42-26-42-52V32Z"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2.4"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <path
        d="M80 24 114 37v27c0 22-15 36-34 44-19-8-34-22-34-44V37Z"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1"
        opacity="0.35"
      />
      <path
        d={givre(80, 62, 26)}
        stroke={TRAIT}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="80" cy="62" r="4" fill={TRAIT} />
    </>
  ),

  /** Un bloc hexagonal, et l'éclat pris dedans pour de bon. */
  'gel-eternel': (u, c) => (
    <>
      <path d="M80 18 120 42v42L80 108 40 84V42Z" fill={c} opacity="0.18" />
      <path
        d="M80 18 120 42v42L80 108 40 84V42Z"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M80 18v90M40 42l80 42M120 42 40 84"
        stroke={TRAIT}
        strokeWidth="1"
        opacity="0.28"
      />
      <path d={etoile(80, 63, 15)} fill={TRAIT} opacity="0.9" />
      <path d={etoile(80, 63, 26, 0.16)} fill={TRAIT} opacity="0.22" />
      <path
        d="M56 32 66 40M104 32 94 40M56 94l10-8M104 94l-10-8"
        stroke={TRAIT}
        strokeWidth="1.2"
        opacity="0.4"
        strokeLinecap="round"
      />
    </>
  ),

  /**
   * Le second souffle : ce qui était tombé remonte.
   *
   * Le trait part du bas, s'enroule et ressort par le haut avec une pointe. La
   * flèche est au bout du souffle et non posée à côté — c'est elle qui donne le
   * sens de lecture, et un chevron flottant ne veut rien dire.
   */
  'second-souffle': (u, c) => (
    <>
      <path
        d="M46 112c18-6 10-26 22-38s30-6 34-22-8-24-8-24"
        fill="none"
        stroke={c}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M94 28l-6 16 20-4Z" fill={c} />
      <path
        d="M70 116c14-8 6-24 18-34s24-6 26-18"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path d={etoile(40, 44, 7)} fill={TRAIT} opacity="0.7" />
      <path d={etoile(128, 66, 5)} fill={TRAIT} opacity="0.55" />
      <path d={etoile(30, 76, 4)} fill={TRAIT} opacity="0.4" />
      <path d={etoile(136, 30, 3.5)} fill={TRAIT} opacity="0.35" />
    </>
  ),

  /** Le rempart : deux tours, une courtine crénelée, et des stalactites. */
  'rempart-polaire': (u, c) => (
    <>
      <path d={etoile(80, 26, 8)} fill={TRAIT} opacity="0.55" />
      <path
        d="M24 106V44h10v-8h10v8h10v14h52V44h10v-8h10v8h10v62Z"
        fill={c}
        opacity="0.4"
      />
      <path
        d="M24 106V44h10v-8h10v8h10v14h52V44h10v-8h10v8h10v62Z"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2.2"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Les créneaux de la courtine, entre les deux tours. */}
      <path
        d="M56 58h8v-8h8v8h8v-8h8v8h8v-8h8v8"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {/* Les meurtrières : creusées, donc plus sombres que le mur — un
          rectangle clair se lirait comme une fenêtre éclairée. */}
      <path
        d="M32 72h14v22H32ZM114 72h14v22h-14ZM74 78h12v28H74Z"
        fill="#04101c"
        opacity="0.55"
      />
      {/* Les stalactites : un rempart de glace n'en est un que s'il pend
          quelque chose dessous. */}
      <path
        d="M22 106l4 16 4-16ZM46 106l5 22 5-22ZM70 106l4 14 4-14ZM96 106l5 20 5-20ZM122 106l4 18 4-18ZM142 106l4 14 4-14Z"
        fill={TRAIT}
        opacity="0.7"
      />
      <path d="M0 106h160" stroke={TRAIT} strokeWidth="1.8" opacity="0.45" />
    </>
  ),

  /** Le sanctuaire : trois cimes sur un socle, et le halo qui les couronne. */
  sanctuaire: (u, c) => (
    <>
      <circle cx="80" cy="52" r="30" fill="none" stroke={c} strokeWidth="1.4" opacity="0.45" />
      <circle cx="80" cy="52" r="38" fill="none" stroke={c} strokeWidth="1" opacity="0.22" />
      <path d="M22 100 58 44l22 32 16-22 42 46Z" fill={c} opacity="0.24" />
      <path
        d="M22 100 58 44l22 32 16-22 42 46Z"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M58 44 46 62l12 6 10-8Z" fill={TRAIT} opacity="0.75" />
      <path d="M112 68 104 78l8 5 7-6Z" fill={TRAIT} opacity="0.6" />
      <path d="M14 100h132v8H14Z" fill={c} opacity="0.45" />
      <path d="M8 108h144" stroke={TRAIT} strokeWidth="2.4" opacity="0.6" strokeLinecap="round" />
      <path d="M14 100h132" stroke={TRAIT} strokeWidth="1.2" opacity="0.5" />
    </>
  ),

  /* ---- TEMPÊTE — multiplier la casse ------------------------------------ */

  /** La rafale : trois traits de vitesse, rien de plus. */
  rafale: (u, c) => (
    <>
      <path
        d="M18 44h74c10 0 16-6 16-13s-6-11-13-11"
        fill="none"
        stroke={c}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M12 64h96c12 0 20-8 20-17"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M26 84h60c9 0 15 5 15 12s-5 12-12 12"
        fill="none"
        stroke={c}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <Neige
        pts={[
          [136, 52, 1.4],
          [144, 72, 1],
          [128, 96, 1.2],
        ]}
      />
    </>
  ),

  /** La rose des vents, pointée au nord. */
  'vent-du-nord': (u, c) => (
    <>
      <circle cx="80" cy="60" r="30" fill="none" stroke={TRAIT} strokeWidth="1.4" opacity="0.4" />
      <circle cx="80" cy="60" r="37" fill="none" stroke={TRAIT} strokeWidth="1" opacity="0.2" />
      <path d="M80 26 91 60 80 53 69 60Z" fill={c} />
      <path d="M80 94 69 60l11 7 11-7Z" fill={TRAIT} opacity="0.42" />
      <path
        d="M50 60h-8M118 60h-8M80 30v-8M80 90v8"
        stroke={TRAIT}
        strokeWidth="1.6"
        opacity="0.45"
        strokeLinecap="round"
      />
      <path
        d="M12 34h26M12 88h34"
        stroke={c}
        strokeWidth="2"
        opacity="0.5"
        strokeLinecap="round"
      />
      <path
        d="M122 34h26M114 88h34"
        stroke={c}
        strokeWidth="2"
        opacity="0.5"
        strokeLinecap="round"
      />
    </>
  ),

  /** La percée : le mur de traits, et ce qui le traverse. */
  percee: (u, c) => (
    <>
      <path
        d="M52 16v88M68 16v88M84 16v88M100 16v88"
        stroke={TRAIT}
        strokeWidth="2"
        opacity="0.22"
        strokeLinecap="round"
      />
      <path
        d="M20 60h96"
        stroke={c}
        strokeWidth="3"
        opacity="0.4"
        strokeLinecap="round"
      />
      <path d="M96 38 138 60 96 82l10-22Z" fill={c} />
      <path
        d="M96 38 138 60 96 82l10-22Z"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M60 44l-6-10M76 78l-5 11M92 40l-4-10"
        stroke={TRAIT}
        strokeWidth="1.4"
        opacity="0.35"
        strokeLinecap="round"
      />
    </>
  ),

  /**
   * Le blizzard : deux bras de cyclone autour d'un œil.
   *
   * La spirale d'Archimède a été essayée et abandonnée : enroulée serré, elle se
   * lit comme une oreille. Deux virgules opposées autour d'un centre vide, c'est
   * le signe de la tempête partout où on le voit.
   */
  blizzard: (u, c) => (
    <>
      <path
        d="M80 34c26 0 44 10 44 22 0 8-8 14-20 14-10 0-16-4-16-10"
        fill="none"
        stroke={c}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M80 86c-26 0-44-10-44-22 0-8 8-14 20-14 10 0 16 4 16 10"
        fill="none"
        stroke={c}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M96 30c20 4 32 12 34 22M64 90c-20-4-32-12-34-22"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.4"
      />
      <circle cx="80" cy="60" r="5" fill={TRAIT} opacity="0.85" />
      <path
        d={flocon(28, 24, 7)}
        stroke={TRAIT}
        strokeWidth="1.6"
        opacity="0.6"
        strokeLinecap="round"
      />
      <path
        d={flocon(136, 96, 6)}
        stroke={TRAIT}
        strokeWidth="1.4"
        opacity="0.5"
        strokeLinecap="round"
      />
      <path
        d={flocon(140, 26, 4.5)}
        stroke={TRAIT}
        strokeWidth="1.2"
        opacity="0.38"
        strokeLinecap="round"
      />
      <path
        d={flocon(24, 96, 5)}
        stroke={TRAIT}
        strokeWidth="1.2"
        opacity="0.42"
        strokeLinecap="round"
      />
    </>
  ),

  /** Le sang-froid : le cœur pris dans la glace, et le tracé qui ne bouge pas. */
  'sang-froid': (u, c) => (
    <>
      <path d="M80 24 116 44v36L80 100 44 80V44Z" fill={c} opacity="0.14" />
      <path
        d="M80 24 116 44v36L80 100 44 80V44Z"
        fill="none"
        stroke={c}
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M80 82c-16-11-22-19-22-28a11 11 0 0 1 22-5 11 11 0 0 1 22 5c0 9-6 17-22 28Z"
        fill={c}
        opacity="0.55"
      />
      <path
        d="M38 62h20l8-12 8 24 8-16 6 4h24"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </>
  ),

  /** La nuit polaire : le disque éteint, et la couronne qui reste. */
  'nuit-polaire': (u, c) => (
    <>
      <circle cx="80" cy="54" r="36" fill="none" stroke={c} strokeWidth="2" opacity="0.55" />
      <circle cx="80" cy="54" r="46" fill="none" stroke={c} strokeWidth="1" opacity="0.2" />
      <circle cx="80" cy="54" r="30" fill="#04080f" />
      <path
        d="M80 8v10M80 90v10M34 54h-10M136 54h-10M47 21l-7-7M120 94l-7-7M113 21l7-7M40 94l7-7"
        stroke={c}
        strokeWidth="1.6"
        opacity="0.45"
        strokeLinecap="round"
      />
      <path d="M0 104q40-14 80-2t80-4v22H0Z" fill="#04080f" opacity="0.9" />
      <Neige
        pts={[
          [22, 30, 1.2],
          [140, 40, 1],
          [128, 16, 0.9],
        ]}
      />
    </>
  ),

  /* ---- AURORE — points et flocons --------------------------------------- */

  /** L'étincelle : une seule, mais nette. */
  etincelle: (u, c) => (
    <>
      <path d={etoile(80, 58, 34, 0.14)} fill={c} opacity="0.2" />
      <path d={etoile(80, 58, 26)} fill={c} opacity="0.85" />
      <path d={etoile(80, 58, 14)} fill={TRAIT} />
      <path d={etoile(126, 30, 7)} fill={TRAIT} opacity="0.6" />
      <path d={etoile(36, 88, 6)} fill={TRAIT} opacity="0.5" />
      <path d={etoile(40, 32, 4.5)} fill={c} opacity="0.6" />
    </>
  ),

  /** L'étoile polaire, et ce qui s'aligne dessous. */
  'etoile-polaire': (u, c) => (
    <>
      <path
        d="M80 34 106 66 128 92M80 34 54 60 34 92M80 34v56"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1"
        opacity="0.28"
      />
      <path d={etoile(80, 34, 30, 0.12)} fill={c} opacity="0.22" />
      <path d={etoile(80, 34, 20)} fill={c} />
      <path d={etoile(80, 34, 10)} fill={TRAIT} />
      <circle cx="106" cy="66" r="3" fill={TRAIT} opacity="0.8" />
      <circle cx="128" cy="92" r="2.4" fill={TRAIT} opacity="0.6" />
      <circle cx="54" cy="60" r="3" fill={TRAIT} opacity="0.8" />
      <circle cx="34" cy="92" r="2.4" fill={TRAIT} opacity="0.6" />
      <circle cx="80" cy="90" r="2.6" fill={TRAIT} opacity="0.7" />
    </>
  ),

  /** La pluie de flocons : beaucoup, et tous différents. */
  'pluie-de-flocons': (u, c) => (
    <>
      {(
        [
          [30, 30, 9],
          [70, 20, 6],
          [110, 34, 10],
          [46, 62, 7],
          [92, 62, 6],
          [132, 66, 7],
          [24, 92, 6],
          [66, 96, 8],
          [112, 96, 5],
        ] as [number, number, number][]
      ).map(([x, y, r], i) => (
        // Les gros flocons sont ramifiés, les petits réduits à leurs axes : au
        // rayon de six pixels, les barbes se referment en pâté.
        <path
          key={i}
          d={r >= 8 ? givre(x, y, r) : flocon(x, y, r)}
          stroke={i % 3 === 0 ? c : TRAIT}
          strokeWidth={r >= 8 ? 1.5 : 1.3}
          strokeLinecap="round"
          opacity={0.4 + r * 0.05}
        />
      ))}
    </>
  ),

  /** La manne : ce qui tombe, et la corbeille ouverte qui le reçoit. */
  manne: (u, c) => (
    <>
      <path d="M80 12 93 32 80 52 67 32Z" fill={TRAIT} opacity="0.92" />
      <path d="M44 28 55 44 44 60 33 44Z" fill={c} opacity="0.85" />
      <path d="M118 32l10 14-10 14-10-14Z" fill={c} opacity="0.7" />
      <path d="M60 58l8 10-8 10-8-10Z" fill={TRAIT} opacity="0.55" />
      <path d="M102 62l7 9-7 9-7-9Z" fill={TRAIT} opacity="0.5" />
      {/* La corbeille : une vasque large et basse, pas un verre à pied. Ouverte,
          parce que ce qui compte est qu'elle reçoive. */}
      <path d="M40 84h80l-10 26H50Z" fill={c} opacity="0.42" />
      <path
        d="M40 84h80l-10 26H50Z"
        fill="none"
        stroke={c}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M34 84h92" stroke={TRAIT} strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      <path
        d="M58 92l4 12M80 92v12M102 92l-4 12"
        stroke={TRAIT}
        strokeWidth="1.2"
        opacity="0.35"
      />
    </>
  ),

  /** Le mécène : la couronne, et la pierre au milieu. */
  mecene: (u, c) => (
    <>
      <path
        d="M34 84 26 38l24 18 30-32 30 32 24-18-8 46Z"
        fill={c}
        opacity="0.32"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M32 90h96v10H32Z" fill={c} opacity="0.45" />
      <path d="M32 90h96v10H32Z" fill="none" stroke={c} strokeWidth="1.6" />
      <path d="M80 46 92 60 80 76 68 60Z" fill={TRAIT} opacity="0.95" />
      <circle cx="26" cy="34" r="4" fill={TRAIT} opacity="0.7" />
      <circle cx="134" cy="34" r="4" fill={TRAIT} opacity="0.7" />
      <path d={etoile(112, 22, 5)} fill={TRAIT} opacity="0.55" />
      <path d={etoile(48, 20, 4)} fill={TRAIT} opacity="0.45" />
    </>
  ),

  /** L'aurore : les voiles, et la crête en dessous. */
  'aurore-boreale': (u, c) => (
    <>
      <defs>
        <linearGradient id={`voile-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.05" />
          <stop offset="0.32" stopColor={c} stopOpacity="0.72" />
          <stop offset="0.74" stopColor={TRAIT} stopOpacity="0.5" />
          <stop offset="1" stopColor={TRAIT} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/*
       * Le rideau est fait de striations fines, pas de panaches épais.
       *
       * Deux versions ont échoué avant celle-ci — en rubans obliques, l'aurore
       * se lisait comme des plumes ; en gros traits arrondis, comme des flammes.
       * Ce qu'une aurore a de reconnaissable est sa **texture** : des dizaines
       * de raies verticales presque parallèles, qui s'éteignent par le bas.
       */}
      {Array.from({ length: 17 }, (_, i) => {
        const x = 8 + i * 9;
        const a = Math.sin(i * 1.1) * 7;
        const b = Math.cos(i * 0.8) * 5;
        const bas = 76 + ((i * 13) % 22);
        return (
          <path
            key={i}
            d={`M${x} -6C${(x + a).toFixed(1)} 18 ${(x - b).toFixed(1)} 32 ${(x + a * 0.6).toFixed(1)} 50S${(x - b * 0.9).toFixed(1)} 68 ${(x + b * 0.5).toFixed(1)} ${bas}`}
            fill="none"
            stroke={`url(#voile-${u})`}
            strokeWidth={i % 4 === 0 ? 5 : i % 3 === 0 ? 2 : 3.4}
            strokeLinecap="round"
            opacity={i % 5 === 0 ? 0.55 : 0.95}
          />
        );
      })}
      <path d="M0 120v-16l30-18 26 16 24-14 34 20 46-14v26Z" fill="#050a14" opacity="0.92" />
      <Neige
        pts={[
          [42, 24, 1.2],
          [98, 18, 1],
          [140, 40, 1.1],
          [22, 52, 0.9],
        ]}
      />
    </>
  ),

  /* ---- SOLSTICE — le chaos et les malus --------------------------------- */

  /**
   * La boule de neige : la pente, la trace, et ce qui grossit en descendant.
   *
   * La pente va du haut-gauche au bas-droit, et les trois boules suivent cette
   * ligne en gagnant du volume. C'est la progression qui raconte la carte : une
   * boule seule ne dit pas qu'elle roule.
   */
  'boule-de-neige': (u, c) => (
    <>
      <path d="M0 40 160 94v26H0Z" fill={TRAIT} opacity="0.14" />
      <path d="M0 40 160 94" stroke={TRAIT} strokeWidth="2.2" opacity="0.5" />
      {/* La trace, en amont de chaque boule. */}
      <path
        d="M18 50q16 2 26 8M62 66q16 2 26 8"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1.4"
        opacity="0.3"
        strokeLinecap="round"
      />
      <circle cx="36" cy="46" r="7" fill={c} opacity="0.35" />
      <circle cx="36" cy="46" r="7" fill="none" stroke={TRAIT} strokeWidth="1.2" opacity="0.5" />
      <circle cx="76" cy="58" r="12" fill={c} opacity="0.45" />
      <circle cx="76" cy="58" r="12" fill="none" stroke={TRAIT} strokeWidth="1.6" opacity="0.6" />
      <circle cx="124" cy="66" r="21" fill={c} opacity="0.55" />
      <circle cx="124" cy="66" r="21" fill="none" stroke={TRAIT} strokeWidth="2.4" opacity="0.9" />
      <path
        d="M112 58a12 12 0 0 1 16 4M116 78a14 14 0 0 0 16-6"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1.6"
        opacity="0.5"
        strokeLinecap="round"
      />
    </>
  ),

  /** Le givre mordant : deux rangées de crocs qui se referment. */
  'givre-mordant': (u, c) => (
    <>
      <path
        d="M20 8h120l-10 26-12-18-12 26-12-22-12 30-12-24-12 20-12-26-16 18Z"
        fill={c}
        opacity="0.5"
      />
      <path
        d="M20 112h120l-10-26-12 18-12-26-12 22-12-30-12 24-12-20-12 26-16-18Z"
        fill={c}
        opacity="0.5"
      />
      <path
        d="M18 8h124M18 112h124"
        stroke={TRAIT}
        strokeWidth="2"
        opacity="0.4"
        strokeLinecap="round"
      />
      <path d={etoile(80, 60, 10)} fill={TRAIT} opacity="0.75" />
      <path
        d="M46 58h14M100 58h14"
        stroke={TRAIT}
        strokeWidth="1.4"
        opacity="0.3"
        strokeLinecap="round"
      />
    </>
  ),

  /** Le contre-courant : ce qui repart d'où ça venait. */
  'contre-courant': (u, c) => (
    <>
      <path
        d="M110 46a34 34 0 1 0 0 28"
        fill="none"
        stroke={c}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path d="M110 32 122 48l-20 4Z" fill={c} />
      <path d="M110 88 98 72l20-4Z" fill={c} />
      <path
        d="M14 40h30M14 60h20M14 80h30"
        stroke={TRAIT}
        strokeWidth="2"
        opacity="0.35"
        strokeLinecap="round"
      />
      <path
        d="M146 40h-14M146 80h-14"
        stroke={TRAIT}
        strokeWidth="2"
        opacity="0.35"
        strokeLinecap="round"
      />
      <path d={etoile(80, 60, 8)} fill={TRAIT} opacity="0.6" />
    </>
  ),

  /**
   * Le traîneau percé, vu de côté.
   *
   * Le patin est en deux morceaux, séparés par une fêlure. C'est le seul point
   * qui doit se voir : un traîneau intact et un traîneau cassé se dessinent
   * pareil, à cette rupture près.
   */
  'traineau-perce': (u, c) => (
    <>
      {/* Le dossier, à l'arrière. */}
      <path
        d="M120 58V36q0-6-6-6h-10"
        fill="none"
        stroke={c}
        strokeWidth="3.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/*
       * La caisse, pleine et non en lattes.
       *
       * Dessinée en trois traits horizontaux, elle se confondait avec le patin
       * juste en dessous : le tout se lisait comme un ressort. Il faut une masse
       * pour que les pièces fines qui l'entourent se lisent comme des pièces.
       */}
      <path d="M30 58h88v22H30Z" fill={c} opacity="0.5" />
      <path
        d="M30 58h88v22H30Z"
        fill="none"
        stroke={c}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path d="M30 69h88" stroke={TRAIT} strokeWidth="1.4" opacity="0.4" />
      {/* Les montants qui portent la caisse. */}
      <path
        d="M46 80v14M104 80v14"
        stroke={TRAIT}
        strokeWidth="3"
        opacity="0.7"
        strokeLinecap="round"
      />
      {/*
       * Le patin, en deux brins. Le nez se relève en crosse à l'avant : c'est
       * cette courbe, et elle seule, qui fait lire « traîneau » plutôt que
       * « banc ».
       */}
      <path
        d="M74 98H38q-16 0-16-14 0-8 8-10"
        fill="none"
        stroke={c}
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M90 98h46"
        fill="none"
        stroke={c}
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      {/* La fêlure, entre les deux brins. */}
      <path
        d="M76 98l7-12 3 14 4-12"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d={etoile(83, 96, 15, 0.14)} fill={TRAIT} opacity="0.25" />
      <Neige
        pts={[
          [40, 30, 1.4],
          [96, 24, 1.2],
          [128, 40, 1.1],
          [24, 50, 1],
        ]}
      />
    </>
  ),

  /** La tempête de verglas : ce qui tombe, et ce qui reste planté. */
  'tempete-de-verglas': (u, c) => (
    <>
      <path
        d="M18 30q22-14 44-4t42-2 38 8"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2"
        opacity="0.3"
        strokeLinecap="round"
      />
      <path d="M88 20 62 62h18l-10 38 34-46H86Z" fill={c} />
      <path
        d="M88 20 62 62h18l-10 38 34-46H86Z"
        fill="none"
        stroke={TRAIT}
        strokeWidth="1.2"
        opacity="0.55"
        strokeLinejoin="round"
      />
      <path
        d="M30 48l-8 22M132 46l8 24M40 78l-6 16M124 80l6 16"
        stroke={TRAIT}
        strokeWidth="1.6"
        opacity="0.4"
        strokeLinecap="round"
      />
      <path
        d="M0 120l14-24 8 24 10-18 8 18h80l10-20 8 20 12-22 10 22Z"
        fill={c}
        opacity="0.3"
      />
    </>
  ),

  /** Le grand froid : le soleil bas, et ce qui pend dessous. */
  'grand-froid': (u, c) => (
    <>
      <circle cx="80" cy="50" r="26" fill={c} opacity="0.24" />
      <circle cx="80" cy="50" r="26" fill="none" stroke={c} strokeWidth="2" opacity="0.7" />
      <circle cx="80" cy="50" r="36" fill="none" stroke={c} strokeWidth="1" opacity="0.25" />
      <path
        d="M80 10v8M80 82v8M40 50h-8M128 50h-8M52 22l-6-6M114 84l-6-6M108 22l6-6M46 84l6-6"
        stroke={c}
        strokeWidth="1.8"
        opacity="0.45"
        strokeLinecap="round"
      />
      <path d={etoile(80, 50, 12)} fill={TRAIT} opacity="0.5" />
      {/* La corniche et ses stalactites. Elles portent tout le froid de la carte :
          sans elles, il ne reste qu'un soleil pâle. */}
      <path d="M0 88h160v6H0Z" fill={TRAIT} opacity="0.3" />
      <path
        d="M6 94l4 22 4-22ZM26 94l5 30 5-30ZM50 94l4 18 4-18ZM72 94l5 26 5-26ZM96 94l4 20 4-20ZM118 94l5 32 5-32ZM142 94l4 22 4-22Z"
        fill={TRAIT}
        opacity="0.75"
      />
      <path d="M0 88h160" stroke={TRAIT} strokeWidth="2" opacity="0.6" />
    </>
  ),

  /* ---- LES ACTIONS DES ROUES — les scènes des cartes venues de la Summer -- */

  /** Le filet : tendu entre deux piquets, il retient ce qui tombe. */
  filet: (u, c) => (
    <>
      <Neige
        pts={[
          [30, 14, 1.4],
          [64, 8, 1.1],
          [118, 18, 1.6],
          [142, 34, 1.1],
          [14, 38, 1.2],
        ]}
      />
      <path d="M24 34v74M136 34v74" stroke={TRAIT} strokeWidth="3.2" opacity="0.55" strokeLinecap="round" />
      {/* La poche du filet : deux cordes, et les mailles entre elles. */}
      <path d="M24 44Q80 124 136 44Q80 70 24 44Z" fill={c} opacity="0.2" />
      <path
        d="M40 50.4v13.2M56 54.6v22.1M72 56.7v26.5M88 56.7v26.5M104 54.6v22.1M120 50.4v13.2"
        stroke={TRAIT}
        strokeWidth="1.1"
        opacity="0.45"
      />
      <path d="M24 44Q80 97 136 44" fill="none" stroke={TRAIT} strokeWidth="1.1" opacity="0.45" />
      <path d="M24 44Q80 70 136 44" fill="none" stroke={TRAIT} strokeWidth="2" opacity="0.85" />
      <path d="M24 44Q80 124 136 44" fill="none" stroke={c} strokeWidth="2.4" />
      {/* Ce qu'il rattrape. */}
      <path d="M80 30 92 48 80 66 68 48Z" fill={c} opacity="0.9" />
      <path d="M80 30 86 48 80 66 74 48Z" fill={TRAIT} opacity="0.85" />
      <path d="M14 108h132" stroke={TRAIT} strokeWidth="2" opacity="0.5" strokeLinecap="round" />
    </>
  ),

  /** La poudreuse : de la neige fraîche, et deux traces dedans. */
  poudreuse: (u, c) => (
    <>
      <path d={givre(42, 30, 13)} stroke={TRAIT} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <path d={givre(114, 22, 9)} stroke={c} strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path d={flocon(84, 46, 5)} stroke={TRAIT} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <path d={flocon(138, 52, 4)} stroke={TRAIT} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      <path d="M0 120V84C30 70 60 66 92 76S140 92 160 84v36Z" fill={c} opacity="0.26" />
      <defs>
        <linearGradient id={`poudre-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf4fd" />
          <stop offset="0.55" stopColor="#a9cbe2" />
          <stop offset="1" stopColor="#5f8dad" />
        </linearGradient>
      </defs>
      <path d="M0 120V100C40 84 72 86 102 96S142 104 160 96v24Z" fill={`url(#poudre-${u})`} />
      <path d="M0 100C40 84 72 86 102 96S142 104 160 96" fill="none" stroke={TRAIT} strokeWidth="2.4" opacity="0.95" />
      {/* Les traces : deux courbes parallèles qui descendent la pente. */}
      <path
        d="M54 90C70 98 80 108 82 122M64 88C80 96 90 106 92 122"
        fill="none"
        stroke={c}
        strokeWidth="1.8"
        opacity="0.7"
        strokeLinecap="round"
      />
    </>
  ),

  /** L'écho : la cime, et la voix qui revient trois fois. */
  echo: (u, c) => (
    <>
      <path d="M8 104 60 34l20 26 14-16 58 60Z" fill={c} opacity="0.24" />
      <path
        d="M8 104 60 34l20 26 14-16 58 60Z"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M60 34 48 52l12 6 9-8Z" fill={TRAIT} opacity="0.8" />
      {/* Les trois ondes, de plus en plus pâles. */}
      <path d="M81 14A30 30 0 0 1 95.5 45.2" fill="none" stroke={TRAIT} strokeWidth="2.4" opacity="0.85" strokeLinecap="round" />
      <path d="M89 0.2A46 46 0 0 1 111.3 48" fill="none" stroke={TRAIT} strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      <path d="M97 -13.7A62 62 0 0 1 127 50.8" fill="none" stroke={TRAIT} strokeWidth="1.6" opacity="0.28" strokeLinecap="round" />
      <path d="M4 104h152" stroke={TRAIT} strokeWidth="2.2" opacity="0.6" strokeLinecap="round" />
    </>
  ),

  /** Le redoux : le soleil revient derrière la butte, et la neige goutte. */
  redoux: (u, c) => (
    <>
      <circle cx="104" cy="58" r="34" fill={c} opacity="0.16" />
      <circle cx="104" cy="58" r="23" fill={c} opacity="0.9" />
      <circle cx="104" cy="58" r="13" fill={TRAIT} opacity="0.75" />
      <path
        d="M104 18v9M64 58h9M76 30l6 6M132 30l-6 6M144 58h-9"
        stroke={c}
        strokeWidth="2"
        opacity="0.6"
        strokeLinecap="round"
      />
      <path d="M40 26c5 8 7 13 0 17-7-4-5-9 0-17Z" fill={TRAIT} opacity="0.8" />
      <path d="M24 52c4 6 5 10 0 13-5-3-4-7 0-13Z" fill={TRAIT} opacity="0.55" />
      <path d="M56 58c3 5 4 8 0 10-4-2-3-5 0-10Z" fill={TRAIT} opacity="0.45" />
      <defs>
        <linearGradient id={`butte-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf4fd" />
          <stop offset="0.55" stopColor="#a9cbe2" />
          <stop offset="1" stopColor="#5f8dad" />
        </linearGradient>
      </defs>
      <path d="M0 122V98C40 76 84 78 116 92S148 100 160 96v26Z" fill={`url(#butte-${u})`} />
      <path d="M0 98C40 76 84 78 116 92S148 100 160 96" fill="none" stroke={TRAIT} strokeWidth="2.4" opacity="0.95" />
    </>
  ),

  /** Le chassé-croisé : deux trajectoires qui s'échangent leur arrivée. */
  'chasse-croise': (u, c) => (
    <>
      <Neige
        pts={[
          [80, 14, 1.5],
          [20, 104, 1.2],
          [140, 102, 1.4],
          [80, 108, 1.1],
        ]}
      />
      <path d="M28 38C74 38 86 84 132 84" fill="none" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M132 84l-13-3M132 84l-8-11" stroke={c} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M132 38C86 38 74 84 28 84" fill="none" stroke={TRAIT} strokeWidth="3.4" strokeLinecap="round" opacity="0.9" />
      <path d="M28 84l13-3M28 84l8-11" stroke={TRAIT} strokeWidth="3.4" strokeLinecap="round" opacity="0.9" />
      <circle cx="28" cy="38" r="8" fill={c} />
      <circle cx="28" cy="38" r="3.4" fill={TRAIT} />
      <circle cx="132" cy="38" r="8" fill={TRAIT} opacity="0.9" />
      <circle cx="132" cy="38" r="3.4" fill={c} />
    </>
  ),

  /** Le socle : trois blocs de glace empilés, et ce qu'ils portent. */
  socle: (u, c) => (
    <>
      <path d={etoile(80, 30, 24, 0.14)} fill={c} opacity="0.22" />
      <path d={etoile(80, 30, 15)} fill={TRAIT} opacity="0.95" />
      <path d="M62 66h36l-5-16H67Z" fill={c} opacity="0.55" />
      <path d="M48 86h64l-6-20H54Z" fill={c} opacity="0.42" />
      <path d="M32 108h96l-8-22H40Z" fill={c} opacity="0.3" />
      <path
        d="M62 66h36l-5-16H67ZM48 86h64l-6-20H54ZM32 108h96l-8-22H40Z"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* L'arête vive de chaque bloc : c'est elle qui en fait de la glace. */}
      <path d="M67 50h26M54 66h52M40 86h80" stroke={TRAIT} strokeWidth="1.6" opacity="0.7" strokeLinecap="round" />
      <path d="M22 108h116" stroke={TRAIT} strokeWidth="2.4" opacity="0.6" strokeLinecap="round" />
    </>
  ),

  /** Le dégel : la glace goutte, et la plus basse remonte au niveau des autres. */
  degel: (u, c) => (
    <>
      <path d="M0 2h160v7H0Z" fill={TRAIT} opacity="0.3" />
      <path
        d="M16 9l5 24 5-24ZM48 9l6 34 6-34ZM98 9l5 20 5-20ZM130 9l6 28 6-28Z"
        fill={TRAIT}
        opacity="0.75"
      />
      <path d="M21 40c3 5 4 8 0 10-4-2-3-5 0-10Z" fill={TRAIT} opacity="0.7" />
      <path d="M136 44c3 5 4 8 0 10-4-2-3-5 0-10Z" fill={TRAIT} opacity="0.6" />
      {/* Trois games : la pire, au milieu, remonte jusqu'à la moyenne. */}
      <path d="M26 108V64h26v44Z" fill={c} opacity="0.45" />
      <path d="M108 108V72h26v36Z" fill={c} opacity="0.45" />
      <path d="M67 108V96h26v12Z" fill={c} opacity="0.85" />
      <path d="M67 96V78h26v18" fill="none" stroke={TRAIT} strokeWidth="1.6" strokeDasharray="3 3" opacity="0.8" />
      <path d="M80 94V66M80 66l-7 8M80 66l7 8" fill="none" stroke={TRAIT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 78h132" stroke={c} strokeWidth="1.6" strokeDasharray="5 4" opacity="0.8" />
      <path d="M14 108h132" stroke={TRAIT} strokeWidth="2.2" opacity="0.6" strokeLinecap="round" />
    </>
  ),

  /** Le verglas : une plaque, et la fêlure qui la coupe en deux. */
  verglas: (u, c) => (
    <>
      <path d="M80 14 120 36v46L80 104 40 82V36Z" fill={c} opacity="0.26" />
      <path
        d="M80 14 120 36v46L80 104 40 82V36Z"
        fill="none"
        stroke={c}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M52 44l12-7M100 84l12-7M54 74l8-4" stroke={TRAIT} strokeWidth="1.4" opacity="0.4" strokeLinecap="round" />
      {/* La fêlure, et ses deux branches. */}
      <path
        d="M80 14l-9 20 13 14-11 18 9 16-2 22"
        fill="none"
        stroke={TRAIT}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M84 48l14-6M73 66l-15 6" stroke={TRAIT} strokeWidth="1.6" opacity="0.7" strokeLinecap="round" />
      <path d="M30 110l8-6 6 6ZM114 112l6-8 8 8Z" fill={TRAIT} opacity="0.5" />
    </>
  ),

  /** Le reflet : le cristal, et son double sous la glace. */
  reflet: (u, c) => (
    <>
      <path d={etoile(34, 26, 6)} fill={TRAIT} opacity="0.6" />
      <path d={etoile(128, 38, 5)} fill={TRAIT} opacity="0.5" />
      <path d="M80 6 104 38 80 64 56 38Z" fill={c} opacity="0.9" />
      <path d="M80 6 90 38 80 64 70 38Z" fill={TRAIT} opacity="0.85" />
      <path d="M56 38h48" stroke={TRAIT} strokeWidth="1.2" opacity="0.6" />
      {/* Le double : le même, renversé, et plus pâle. */}
      <path d="M80 132 104 100 80 74 56 100Z" fill={c} opacity="0.3" />
      <path d="M80 132 90 100 80 74 70 100Z" fill={TRAIT} opacity="0.22" />
      <path d="M8 69h144" stroke={TRAIT} strokeWidth="2.4" opacity="0.75" strokeLinecap="round" />
      <path d="M24 78h26M108 80h30M44 90h16" stroke={TRAIT} strokeWidth="1.2" opacity="0.3" strokeLinecap="round" />
    </>
  ),

  /** Le refuge : une cabane sous la neige, et sa fenêtre allumée. */
  refuge: (u, c) => (
    <>
      <Neige
        pts={[
          [20, 18, 1.5],
          [52, 10, 1.1],
          [126, 16, 1.6],
          [146, 40, 1.2],
          [10, 54, 1.1],
        ]}
      />
      <path d="M0 104 38 52l24 30 22-24 40 46Z" fill={c} opacity="0.2" />
      <path d="M54 72h52v34H54Z" fill={c} opacity="0.5" />
      <path d="M54 72h52v34H54Z" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
      <path d="M92 60V44h8v22Z" fill={c} opacity="0.7" />
      <path d="M96 38c-5-7 5-9 0-16" fill="none" stroke={TRAIT} strokeWidth="1.6" opacity="0.45" strokeLinecap="round" />
      {/* Le toit, sous sa neige. */}
      <path d="M44 74 80 42l36 32Z" fill={TRAIT} opacity="0.92" />
      <path d="M44 74 80 42l36 32" fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
      <path d="M74 106V86h12v20Z" fill="#0a141d" opacity="0.8" />
      <path d="M60 80h9v9h-9Z" fill={TRAIT} />
      <path d="M92 80h9v9h-9Z" fill={TRAIT} opacity="0.85" />
      <path d="M0 106h160v12H0Z" fill={c} opacity="0.4" />
      <path d="M0 106h160" stroke={TRAIT} strokeWidth="2.4" opacity="0.7" />
    </>
  ),

  /** La cordée : trois grimpeurs, une corde, et personne laissé en bas. */
  cordee: (u, c) => (
    <>
      <path d={etoile(132, 22, 9)} fill={TRAIT} opacity="0.7" />
      <path d="M0 112 160 42v80H0Z" fill={c} opacity="0.24" />
      <path d="M0 112 160 42" stroke={TRAIT} strokeWidth="2.4" opacity="0.8" strokeLinecap="round" />
      {/* La corde passe à la taille de chacun. */}
      <path d="M40 84.5 80 67 120 49.5" fill="none" stroke={c} strokeWidth="1.8" />
      {(
        [
          [40, 94.5],
          [80, 77],
          [120, 59.5],
        ] as [number, number][]
      ).map(([x, y], i) => (
        <g key={i} stroke={TRAIT} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity={0.7 + i * 0.15}>
          <circle cx={x} cy={y - 22} r="4.2" fill={TRAIT} stroke="none" />
          <path d={`M${x} ${y - 17}v12M${x} ${y - 5}l-4 6M${x} ${y - 5}l5 3M${x} ${y - 14}l6 -3`} />
        </g>
      ))}
    </>
  ),

  /** L'étoile du Nord : huit branches, et les montagnes qu'elle éclaire. */
  'etoile-du-nord': (u, c) => (
    <>
      <circle cx="80" cy="46" r="44" fill="none" stroke={c} strokeWidth="1" opacity="0.22" />
      <path d={etoile(80, 46, 42, 0.1)} fill={c} opacity="0.24" />
      <g transform="rotate(45 80 46)">
        <path d={etoile(80, 46, 24, 0.2)} fill={c} opacity="0.7" />
      </g>
      <path d={etoile(80, 46, 32)} fill={c} />
      <path d={etoile(80, 46, 16)} fill={TRAIT} />
      <path d={etoile(24, 30, 5)} fill={TRAIT} opacity="0.6" />
      <path d={etoile(138, 24, 6)} fill={TRAIT} opacity="0.55" />
      <path d="M0 112 28 94l18 10 24-18 24 18 24-12 42 20v10H0Z" fill={c} opacity="0.3" />
      <path d="M0 112 28 94l18 10 24-18 24 18 24-12 42 20" fill="none" stroke={TRAIT} strokeWidth="1.6" opacity="0.5" strokeLinejoin="round" />
    </>
  ),

  /** Le Grand Nord : une boussole, l'aiguille au nord. */
  'grand-nord': (u, c) => (
    <>
      <circle cx="80" cy="56" r="44" fill={c} opacity="0.12" />
      <circle cx="80" cy="56" r="38" fill="none" stroke={c} strokeWidth="2.4" />
      <circle cx="80" cy="56" r="30" fill="none" stroke={c} strokeWidth="1" opacity="0.4" />
      <path
        d="M80 12v10M80 90v10M36 56h10M114 56h10M50 26l6 6M110 26l-6 6M50 86l6-6M110 86l-6-6"
        stroke={TRAIT}
        strokeWidth="2"
        opacity="0.6"
        strokeLinecap="round"
      />
      <path d="M80 24 91 56 80 62 69 56Z" fill={TRAIT} />
      <path d="M80 88 91 56 80 50 69 56Z" fill={c} opacity="0.7" />
      <circle cx="80" cy="56" r="3.4" fill="#0a141d" />
    </>
  ),
};

/** La rareté de chaque carte, pour choisir le ciel et la couleur d'accent. */
const RARETE_DE: Record<string, Rarity> = Object.fromEntries(
  CARDS.map((carte) => [carte.id, carte.rarity]),
);

/**
 * L'illustration d'une carte.
 *
 * Rend `null` pour un identifiant inconnu : c'est l'appelant qui décide du
 * repli — {@link CardFrame} retombe alors sur le glyphe.
 */
export function CardArt({ cardId, className }: { cardId: string; className?: string }) {
  const rarity = RARETE_DE[cardId];
  const scene = SCENES[cardId];
  if (!rarity || !scene) return null;

  const c = RARITY_META[rarity].color;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${L} ${HP}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <Fond u={cardId} rarity={rarity} c={c} />
      <g transform={`translate(0 ${DECALAGE})`}>{scene(cardId, c)}</g>
      <Vignette u={cardId} />
    </svg>
  );
}

/** Y a-t-il une illustration dessinée pour cette carte ? */
export function aUneIllustration(cardId: string): boolean {
  return cardId in SCENES && cardId in RARETE_DE;
}
