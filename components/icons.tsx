/**
 * Jeu d'icônes, en SVG inline.
 *
 * Aucune police d'icônes ni bibliothèque : quelques tracés pèsent moins qu'une
 * requête réseau, prennent la couleur du texte par `currentColor`, et restent
 * nets à toutes les tailles. Les emojis, eux, imposent leur propre palette et
 * font « jouet » dans une navigation.
 *
 * Un seul style pour toutes : un trait franc et arrondi, et un aplat
 * translucide dans la forme principale (`Fond`) — le « duotone ». Le trait fin
 * d'autrefois, sans aplat, se perdait à 18 px. Pour que trait et aplat restent
 * de la même couleur, on colore une icône par `color`, jamais par `stroke`.
 */

type IconProps = { className?: string };

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
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

/** L'aplat translucide d'une forme : la seconde teinte du duotone. */
function Fond({ d }: { d: string }) {
  return <path d={d} fill="currentColor" fillOpacity={0.24} stroke="none" />;
}

/** Classement — une coupe. */
export function IconTrophy(props: IconProps) {
  const coupe = 'M7 3.5h10V9a5 5 0 0 1-10 0V3.5Z';
  return (
    <Svg {...props}>
      <Fond d={coupe} />
      <path d={coupe} />
      <path d="M7 5.5H4.8a1.3 1.3 0 0 0-1.3 1.4C3.7 9 5.2 10.6 7.2 10.8" />
      <path d="M17 5.5h2.2a1.3 1.3 0 0 1 1.3 1.4c-.2 2.1-1.7 3.7-3.7 3.9" />
      <path d="M12 14v3.5" />
      <path d="M8 20.5h8M9.5 17.5h5" />
    </Svg>
  );
}

/** Boosters — un paquet de cartes, une étoile sur celle du dessus. */
export function IconPack(props: IconProps) {
  const carte = 'M9 3h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z';
  return (
    <Svg {...props}>
      <Fond d={carte} />
      <path d={carte} />
      <path d="M4 7v12a2 2 0 0 0 2 2h9" />
      <path
        d="m13.5 7.2.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z"
        fill="currentColor"
        strokeWidth={1.2}
      />
    </Svg>
  );
}

/** Boosters, dans la navigation : le même paquet de cartes. */
export const IconRocket = IconPack;

/** Duels — deux épées croisées. */
export function IconSwords(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
      <path d="M14.5 6.5 18 3h3v3l-3.5 3.5" />
      <path d="m5 14 4 4M7 17l-3 3M3 19l2 2" />
    </Svg>
  );
}

/** Le reste — trois points, la convention pour « et le reste ». */
export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Collection — des cartes empilées. */
export function IconLayers(props: IconProps) {
  const dessus = 'm12 2.5 9 4.6-9 4.6-9-4.6 9-4.6Z';
  return (
    <Svg {...props}>
      <Fond d={dessus} />
      <path d={dessus} />
      <path d="m3 12.2 9 4.6 9-4.6" />
      <path d="m3 16.9 9 4.6 9-4.6" />
    </Svg>
  );
}

/** Règles, journal — un livre ouvert. */
export function IconBook(props: IconProps) {
  const gauche = 'M2.5 4h5.5a4 4 0 0 1 4 4v12.5a3 3 0 0 0-3-3H2.5V4Z';
  const droite = 'M21.5 4H16a4 4 0 0 0-4 4v12.5a3 3 0 0 1 3-3h6.5V4Z';
  return (
    <Svg {...props}>
      <Fond d={gauche} />
      <Fond d={droite} />
      <path d={gauche} />
      <path d={droite} />
    </Svg>
  );
}

/** Réglages — un engrenage. */
export function IconGear(props: IconProps) {
  const roue =
    'M10.3 3.3a1.7 1.7 0 0 1 3.4 0l.2 1.2a7.6 7.6 0 0 1 1.9 1.1l1.1-.4a1.7 1.7 0 0 1 2.1.8l.1.2a1.7 1.7 0 0 1-.4 2.1l-.9.8a7.6 7.6 0 0 1 0 2.2l.9.8a1.7 1.7 0 0 1 .4 2.1l-.1.2a1.7 1.7 0 0 1-2.1.8l-1.1-.4a7.6 7.6 0 0 1-1.9 1.1l-.2 1.2a1.7 1.7 0 0 1-3.4 0l-.2-1.2a7.6 7.6 0 0 1-1.9-1.1l-1.1.4a1.7 1.7 0 0 1-2.1-.8l-.1-.2a1.7 1.7 0 0 1 .4-2.1l.9-.8a7.6 7.6 0 0 1 0-2.2l-.9-.8a1.7 1.7 0 0 1-.4-2.1l.1-.2a1.7 1.7 0 0 1 2.1-.8l1.1.4a7.6 7.6 0 0 1 1.9-1.1l.2-1.2Z';
  return (
    <Svg {...props}>
      <g transform="translate(0 1.7)">
        <Fond d={roue} />
        <path d={roue} />
      </g>
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

/** Profil, joueurs — une silhouette. */
export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" fill="currentColor" fillOpacity={0.24} />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

/** Une branche de flocon : un axe, une paire de barbes. */
const BRANCHE = 'M12 12V2.5M9.2 4.6 12 7.2l2.8-2.6';

/** Flocon, pour les touches de marque et la saison — six branches barbelées. */
export function IconSnowflake(props: IconProps) {
  return (
    <Svg {...props}>
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <path key={angle} d={BRANCHE} transform={`rotate(${angle} 12 12)`} />
      ))}
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
      <circle cx="12" cy="12" r="3.1" fill="currentColor" fillOpacity={0.24} />
    </Svg>
  );
}

/** Modération — un bouclier, coché. */
export function IconShield(props: IconProps) {
  const ecu = 'M12 2.8 4.5 5.7v5.6c0 4.6 3.2 8.3 7.5 9.9 4.3-1.6 7.5-5.3 7.5-9.9V5.7L12 2.8Z';
  return (
    <Svg {...props}>
      <Fond d={ecu} />
      <path d={ecu} />
      <path d="m8.7 12 2.3 2.3 4.4-4.6" />
    </Svg>
  );
}

/** Vue d'ensemble — un tableau de bord en quatre tuiles. */
export function IconJauge(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.6" fill="currentColor" fillOpacity={0.24} />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.6" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.6" fill="currentColor" fillOpacity={0.24} />
      <rect x="3" y="15" width="7.5" height="6" rx="1.6" />
    </Svg>
  );
}

/** Overlays — une antenne qui émet : ce qui part sur le stream. */
export function IconAntenne(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4" />
      <path d="M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
    </Svg>
  );
}

/** Code cadeau — un paquet noué d'un ruban. */
export function IconCadeau(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="8" width="18" height="4" rx="1" fill="currentColor" fillOpacity={0.24} />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
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

/**
 * Le symbole de Claude, en aplat : c'est un logo. Le tracé est celui de Simple
 * Icons (simple-icons 16.33), tel quel. Il signe le pied de page, rien d'autre.
 */
export function IconClaude(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

export const NAV_ICONS = {
  trophy: IconTrophy,
  pack: IconPack,
  rocket: IconRocket,
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
  cadeau: IconCadeau,
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
