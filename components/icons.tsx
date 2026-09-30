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

/** Batailles — deux lames croisées. */
export function IconSwords(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 3.5H20v5.5l-8.5 8.5-5.5-5.5 8.5-8.5Z" />
      <path d="m3.5 20.5 3-3" />
      <path d="M9.5 3.5H4v5.5l3.2 3.2" />
      <path d="m20.5 20.5-3-3" />
      <path d="m12.3 12.3 3.2 3.2" />
    </Svg>
  );
}

/** Le reste — trois points, la convention pour « et le reste ». */
export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
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

/**
 * Puissance d'une carte — un impact.
 *
 * Un éclair aurait fait doublon avec la Tempête de Verglas du catalogue, et le
 * ⚡ qui tenait ce rôle jusqu'ici imposait la palette jaune de la police du
 * système au beau milieu d'un bandeau de rareté.
 */
export function IconImpact(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v4.2M12 16.8V21M3 12h4.2M16.8 12H21" />
      <path d="M6 6l2.8 2.8M15.2 15.2 18 18M18 6l-2.8 2.8M8.8 15.2 6 18" />
      <circle cx="12" cy="12" r="3.1" />
    </Svg>
  );
}

/** Administration — un bouclier, avec un flocon en son cœur. */
export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 4.5 6v5c0 4.6 3.1 8 7.5 10 4.4-2 7.5-5.4 7.5-10V6L12 3Z" />
      <path d="M12 8v8M8.6 10l6.8 4M8.6 14l6.8-4" />
    </Svg>
  );
}

/** Boosters — une fusée, dans la colonne. */
export function IconRocket(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 3.5c2.6-.6 5 .2 6 1.2-.2 3-1.6 6.2-4.2 8.8l-3.6 3.6-4.8-4.8 3.6-3.6c.9-.9 1.9-1.6 3-2.1Z" />
      <path d="M8.6 12.3 5.4 12l-2 2 3.6 1.2M11.7 15.4l.3 3.2-2 2-1.2-3.6" />
      <circle cx="15.6" cy="8.4" r="1.4" />
      <path d="M6.2 17.8c-1 1-1.5 3-1.5 3s2-.5 3-1.5" />
    </Svg>
  );
}

/** Vue d'ensemble — un cadran, son aiguille levée. */
export function IconJauge(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M12 17l3.6-5.2" />
      <circle cx="12" cy="17" r="1.3" />
      <path d="M6.3 12.2l1.2.7M12 9v1.3M17.7 12.2l-1.2.7" />
    </Svg>
  );
}

/** Overlays — une antenne qui émet : ce qui part sur le stream. */
export function IconAntenne(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="10" r="1.6" />
      <path d="M12 11.6 9 21M12 11.6 15 21M10 18h4" />
      <path d="M8.2 6.2a5.4 5.4 0 0 0 0 7.6M15.8 6.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.4 3.4a9.4 9.4 0 0 0 0 13.2M18.6 3.4a9.4 9.4 0 0 1 0 13.2" />
    </Svg>
  );
}

/** Le glyphe de Twitch, en aplat : c'est un logo, pas un pictogramme au trait. */
export function IconTwitch(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4.3 2 3 5.4v13.5h4.6V22h2.6l3.1-3.1h3.7L21 14.9V2H4.3Zm14.9 12-2.9 2.9h-4.6l-2.6 2.6v-2.6H5.4V3.7h13.8V14Zm-2.9-6.9v5.1h-1.7V7.1h1.7Zm-4.6 0v5.1H10V7.1h1.7Z" />
    </svg>
  );
}

export const NAV_ICONS = {
  trophy: IconTrophy,
  pack: IconPack,
  rocket: IconRocket,
  gavel: IconGavel,
  swords: IconSwords,
  plus: IconPlus,
  layers: IconLayers,
  book: IconBook,
  gear: IconGear,
  shield: IconShield,
  user: IconUser,
  snowflake: IconSnowflake,
  jauge: IconJauge,
  antenne: IconAntenne,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
