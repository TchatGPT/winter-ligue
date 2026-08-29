import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

/**
 * Les six badges de rareté.
 *
 * Ils ont d'abord été des sigles — `C`, `PC`, `SR` — puis des glyphes posés dans
 * une pastille de couleur. Les deux ratent la même chose : dans un jeu de
 * cartes, ce n'est pas le signe qui dit la rareté, c'est le **support**. Une
 * commune est un jeton terne ; une légendaire est une pierre sertie qui
 * rayonne. Le badge lui-même doit changer.
 *
 * D'où une échelle à trois montées simultanées, qui se lisent sans avoir appris
 * l'ordre :
 *
 *  - la **forme** — disque, disque cerclé, hexagone taillé, hexagone serti,
 *    brillant à huit pans, losange en couronne ;
 *  - la **matière** — la commune n'a ni facette ni reflet, les suivantes
 *    gagnent une table, une arête vive, un modelé ;
 *  - la **lumière** — le halo n'apparaît qu'à partir de l'ultra rare, et il est
 *    ce qui fait qu'on repère une légendaire dans une grille de cent vignettes.
 *
 * Chaque pierre est faite d'un contour sombre, du corps en couleur de rareté,
 * d'un dégradé de modelé et d'une arête blanche. C'est le minimum pour qu'une
 * forme plate devienne un objet ; sans le contour sombre, tout se confond avec
 * le panneau de nuit qui la porte.
 */

const CENTRE = 16;

function point(angle: number, rayon: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [CENTRE + Math.cos(rad) * rayon, CENTRE + Math.sin(rad) * rayon];
}

const xy = ([x, y]: [number, number]) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** Un polygone régulier, ou une étoile quand les deux rayons diffèrent. */
function polygone(branches: number, exterieur: number, interieur = exterieur, decalage = 0) {
  const sommets: string[] = [];
  const pas = 360 / branches;
  for (let i = 0; i < branches; i += 1) {
    sommets.push(`${i ? 'L' : 'M'}${xy(point(decalage + i * pas, exterieur))}`);
    if (interieur !== exterieur) {
      sommets.push(`L${xy(point(decalage + i * pas + pas / 2, interieur))}`);
    }
  }
  return `${sommets.join('')}Z`;
}

/** Les tailles de chaque pierre, dans le repère de 32. */
const TAILLES: Record<
  Rarity,
  {
    /** Le sertissage, dessiné derrière la pierre. */
    monture?: string;
    contour: string;
    /** La forme qui porte le halo, quand elle diffère du contour. */
    aura?: string;
    corps: string;
    /** La table : la facette plate du dessus, qui capte la lumière. */
    table?: string;
    /** Opacité du halo. Zéro en dessous de l'ultra rare. */
    halo: number;
    /** Les arêtes de taille, sur les pierres à facettes. */
    facettes?: string;
    /** Un disque plutôt qu'un polygone : les deux premières raretés. */
    rond?: boolean;
  }
> = {
  C: { contour: '', corps: '', halo: 0, rond: true },
  PC: { contour: '', corps: '', halo: 0, rond: true },
  R: { contour: polygone(6, 12.6), corps: polygone(6, 9.6), table: polygone(6, 5.2), halo: 0 },
  SR: {
    monture: polygone(6, 14.4, 9.4, 30),
    contour: polygone(6, 11.6),
    corps: polygone(6, 9),
    table: polygone(6, 4.8),
    halo: 0,
  },
  UR: {
    monture: polygone(8, 14.6, 12.4),
    contour: polygone(8, 12.2),
    corps: polygone(8, 9.4),
    table: polygone(8, 5),
    facettes: 'M16 6.6L16 25.4M7.4 16L24.6 16',
    halo: 0.55,
  },
  L: {
    // La couronne *est* le contour : lui superposer une monture donnerait deux
    // étoiles sombres décalées d'un demi-point, et un bord sale.
    contour: polygone(12, 14.8, 10),
    aura: polygone(12, 15.4, 10.4),
    corps: polygone(4, 11.6, 5.4),
    table: polygone(4, 5.6, 2.6),
    halo: 0.6,
  },
};

/**
 * Le badge d'une rareté.
 *
 * Purement décoratif : il est masqué aux lecteurs d'écran, et c'est à l'élément
 * qui le porte d'annoncer la rareté. Sans quoi remplacer le sigle par un dessin
 * aurait rendu la rareté muette pour qui ne voit pas.
 *
 * `taille` accepte une longueur CSS et pas seulement un nombre : sur la carte à
 * collectionner, elle est donnée en `cqw` pour suivre l'échelle du conteneur.
 */
export function RarityIcon({ rarity, taille = 18 }: { rarity: string; taille?: number | string }) {
  const cle = (rarity in TAILLES ? rarity : 'C') as Rarity;
  const t = TAILLES[cle];
  const meta = RARITY_META[cle];

  // Les identifiants sont suffixés par la rareté : deux `defs` de même nom dans
  // une page se marchent dessus, et toutes les gemmes prendraient le dégradé de
  // la première rencontrée.
  const modele = `gem-modele-${cle}`;
  const halo = `gem-halo-${cle}`;

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={modele} x1="0.2" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.34" />
        </linearGradient>
        {t.halo > 0 && (
          <filter id={halo} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        )}
      </defs>

      {t.rond ? (
        <>
          <circle cx="16" cy="16" r={cle === 'C' ? 11 : 11.4} fill={meta.deep} />
          {cle === 'PC' && (
            <circle
              cx="16"
              cy="16"
              r="11.4"
              fill="none"
              stroke={meta.color}
              strokeOpacity="0.55"
              strokeWidth="1.2"
            />
          )}
          <circle cx="16" cy="16" r={cle === 'C' ? 8.6 : 8} fill={meta.color} />
          <circle cx="16" cy="16" r={cle === 'C' ? 8.6 : 8} fill={`url(#${modele})`} />
          {cle === 'PC' && (
            // Le poli : l'arc de lumière qui sépare un jeton mat d'un jeton verni.
            <path
              d="M10.6 12.4A7.2 7.2 0 0 1 19 9.6"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}
        </>
      ) : (
        <>
          {t.halo > 0 && (
            <path
              d={t.aura ?? t.contour}
              fill={meta.color}
              opacity={t.halo}
              filter={`url(#${halo})`}
            />
          )}
          {t.monture && <path d={t.monture} fill={meta.deep} />}
          <path d={t.contour} fill={meta.deep} />
          <path d={t.corps} fill={meta.color} />
          <path d={t.corps} fill={`url(#${modele})`} />
          {t.table && <path d={t.table} fill="#ffffff" opacity="0.36" />}
          {t.facettes && (
            <path d={t.facettes} stroke="#ffffff" strokeOpacity="0.22" strokeWidth="0.7" />
          )}
          <path
            d={t.corps}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.5"
            strokeWidth="0.8"
          />
        </>
      )}
    </svg>
  );
}
