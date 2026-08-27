/**
 * Jeu d'icônes tracées, en SVG inline.
 *
 * Aucune police d'icônes ni bibliothèque : sept tracés pèsent moins qu'une
 * requête réseau, prennent la couleur du texte par `currentColor`, et restent
 * nets à toutes les tailles. Les emojis, eux, imposent leur propre palette et
 * font « jouet » dans une navigation.
 */

type IconProps = { className?: string };

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg {...BASE} className={className ?? 'h-[22px] w-[22px]'}>
      {children}
    </svg>
  );
}

/** Classement — un trophée. */
export function IconTrophy(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5A1.5 1.5 0 0 0 3 7.5C3 9.4 4.6 11 6.5 11H7" />
      <path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5C21 9.4 19.4 11 17.5 11H17" />
      <path d="M12 14v4" />
      <path d="M8.5 21h7l-.8-3h-5.4l-.8 3Z" />
    </Svg>
  );
}

/** Boosters — un sachet scellé. */
export function IconPack(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6.5h12a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1Z" />
      <path d="M5 4.2c1 .9 2 .9 3 0s2-.9 3 0 2 .9 3 0 2-.9 3 0 2 .9 2 0" />
      <path d="M12 10.5v6" />
      <path d="m9.5 13 2.5-2.5 2.5 2.5" />
    </Svg>
  );
}

/** Hôtel des ventes — un marteau de commissaire-priseur. */
export function IconGavel(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m14.5 3.5 6 6" />
      <path d="m17.5 2.5-2 2 5 5 2-2-5-5Z" />
      <path d="m12.5 8.5 3 3" />
      <path d="M13 10 4 19l1.5 1.5 9-9" />
      <path d="M3 21.5h8" />
    </Svg>
  );
}

/** Collection — des cartes empilées. */
export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 2.5 9 4.6-9 4.6-9-4.6 9-4.6Z" />
      <path d="m3 12.2 9 4.6 9-4.6" />
      <path d="m3 16.9 9 4.6 9-4.6" />
    </Svg>
  );
}

/** Règles — un livre ouvert. */
export function IconBook(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6.5C10.5 5 8.5 4.3 6 4.3c-1 0-1.8.1-2.5.3v14c.7-.2 1.5-.3 2.5-.3 2.5 0 4.5.7 6 2.2" />
      <path d="M12 6.5c1.5-1.5 3.5-2.2 6-2.2 1 0 1.8.1 2.5.3v14c-.7-.2-1.5-.3-2.5-.3-2.5 0-4.5.7-6 2.2" />
      <path d="M12 6.5v14" />
    </Svg>
  );
}

/** Modération — un engrenage. */
export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
    </Svg>
  );
}

/** Profil — une silhouette. */
export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Svg>
  );
}

/** Flocon, pour les touches de marque. */
export function IconSnowflake(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5v19" />
      <path d="m3.8 7.2 16.4 9.6" />
      <path d="m20.2 7.2-16.4 9.6" />
      <path d="m9.2 4.4 2.8 2.4 2.8-2.4" />
      <path d="m9.2 19.6 2.8-2.4 2.8 2.4" />
    </Svg>
  );
}

export const NAV_ICONS = {
  trophy: IconTrophy,
  pack: IconPack,
  gavel: IconGavel,
  layers: IconLayers,
  book: IconBook,
  gear: IconGear,
  user: IconUser,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
