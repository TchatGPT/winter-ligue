import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

/**
 * Les emblèmes du bloc des taux : une médaille hexagonale taillée dans la
 * glace, et dedans une gemme dont la coupe dit le rang.
 *
 *  - **Commune** — un cristal hexagonal vu de dessus, sa table au centre ;
 *  - **Rare** — une gemme taille brillant, couronne et pavillon ;
 *  - **Ultra rare** — trois aiguilles de glace en grappe ;
 *  - **Légendaire** — une couronne de glace, ses trois pointes serties.
 *
 * Pas de halo : la médaille tient par son biseau et son ombre de contact,
 * comme la neige posée sur les blocs. C'est la marque de rareté de tout le
 * site : les taux, la révélation d'une carte, et, par `RarityChip`, la liste
 * des cartes, la fiche d'une carte et les règles. Les anciens flocons de
 * rareté ont été retirés.
 *
 * Décoratif : masqué aux lecteurs d'écran, la ligne dit la rareté en toutes
 * lettres.
 */

/** La médaille : un hexagone pointe en haut, et son biseau intérieur. */
const MEDAILLE = 'M24 3L42.19 13.5V34.5L24 45L5.81 34.5V13.5Z';
const BISEAU = 'M24 6.6L39.07 15.3V32.7L24 41.4L8.93 32.7V15.3Z';

/** Une aiguille de glace, plantée en (24, 35) : deux pans, une pointe. */
function aiguille(longueur: number, largeur: number) {
  const epaule = 35 - longueur + largeur;
  return {
    corps: `M${24 - largeur / 2} 35V${epaule}L24 ${35 - longueur}L${24 + largeur / 2} ${epaule}V35Z`,
    arete: `M24 ${35 - longueur}V35`,
  };
}

const GRANDE = aiguille(22, 6.4);
const PETITE = aiguille(14, 5);

function Gemme({ rarity, fond }: { rarity: Rarity; fond: string }) {
  const corps = { fill: `url(#${fond})`, stroke: '#ffffff', strokeOpacity: 0.85, strokeWidth: 1.1 };
  const facettes = { fill: 'none', stroke: '#ffffff', strokeOpacity: 0.5, strokeWidth: 0.8 };

  switch (rarity) {
    case 'C':
      return (
        <>
          <path {...corps} d="M24 15L31.79 19.5V28.5L24 33L16.21 28.5V19.5Z" />
          {/* La table, plus claire, et les arêtes qui la relient au pourtour. */}
          <path d="M24 19.5L27.9 21.75V26.25L24 28.5L20.1 26.25V21.75Z" fill="#ffffff" fillOpacity={0.3} />
          <path
            {...facettes}
            d="M24 19.5L27.9 21.75V26.25L24 28.5L20.1 26.25V21.75ZM24 15V19.5M31.79 19.5L27.9 21.75M31.79 28.5L27.9 26.25M24 33V28.5M16.21 28.5L20.1 26.25M16.21 19.5L20.1 21.75"
          />
        </>
      );
    case 'R':
      return (
        <>
          <path {...corps} d="M19 15H29L34 20.5L24 34L14 20.5Z" />
          <path {...facettes} d="M14 20.5H34M19 15L21.5 20.5L24 15L26.5 20.5L29 15M21.5 20.5L24 34L26.5 20.5" />
        </>
      );
    case 'UR':
      return (
        <>
          {[-28, 28].map((angle) => (
            <g key={angle} transform={`rotate(${angle} 24 35)`}>
              <path {...corps} d={PETITE.corps} />
              <path {...facettes} d={PETITE.arete} />
            </g>
          ))}
          <path {...corps} d={GRANDE.corps} />
          <path {...facettes} d={GRANDE.arete} />
        </>
      );
    case 'L':
      return (
        <>
          <path {...corps} d="M14 31L12.5 18.5L19 24L24 13L29 24L35.5 18.5L34 31Z" />
          <path {...facettes} d="M19 24L21 31M29 24L27 31M24 13V31" />
          <rect {...corps} x="13" y="31" width="22" height="4.2" rx="1.4" />
          {/* Les trois pointes serties, et la pierre du bandeau. */}
          <circle cx="12.5" cy="18.5" r="1.9" fill="#ffffff" />
          <circle cx="24" cy="13" r="2.3" fill="#ffffff" />
          <circle cx="35.5" cy="18.5" r="1.9" fill="#ffffff" />
          <path d="M24 31.6L25.5 33.1L24 34.6L22.5 33.1Z" fill="#ffffff" fillOpacity={0.9} />
        </>
      );
  }
}

export function EmblemeRarete({
  rarity,
  className,
  style,
}: {
  rarity: Rarity;
  className?: string;
  style?: React.CSSProperties;
}) {
  const meta = RARITY_META[rarity];
  const fond = `embleme-gemme-${rarity}`;
  const reflet = `embleme-reflet-${rarity}`;
  return (
    <svg viewBox="0 0 48 48" className={className} style={style} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={fond} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
          <stop offset="0.45" stopColor={meta.color} />
          <stop offset="1" stopColor={meta.deep} />
        </linearGradient>
        <linearGradient id={reflet} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={meta.color} stopOpacity={0.55} />
          <stop offset="0.7" stopColor={meta.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* La médaille : le fond profond de la rareté, sa couleur qui descend
          du haut, l'arête vive, et le biseau intérieur. */}
      <path d={MEDAILLE} fill={meta.deep} />
      <path d={MEDAILLE} fill={`url(#${reflet})`} stroke={meta.color} strokeWidth={1.6} strokeLinejoin="round" />
      <path d={BISEAU} fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1} strokeLinejoin="round" />
      <Gemme rarity={rarity} fond={fond} />
    </svg>
  );
}
