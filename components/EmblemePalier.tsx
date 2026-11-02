/**
 * Les emblèmes des paliers de subs, dans la manière de ceux des raretés
 * (`EmblemeRarete`) : la même médaille hexagonale taillée dans la glace, et
 * dedans ce que le palier fait tomber.
 *
 *  - **commu** — trois cartes en éventail : le Booster Commu, pour tous ;
 *  - **folie** — un éclair : le Booster Folie ;
 *  - **booster** — une carte seule, pour un booster sans glyphe à lui ;
 *  - **flocons** — une montagne et la neige qui en dévale : l'Avalanche ;
 *  - **tempete** — un nuage qui lâche sa neige : la Tempête de neige.
 *
 * Des aplats blancs plutôt que des traits fins (refaits le 02/11/2026) : à
 * 42 px, un trait d'un pixel et demi ne se lisait pas.
 *
 * La teinte est une couleur CSS (`var(--aurora)`, la couleur d'une rareté) :
 * la médaille en prend un fond profond, une arête vive et un reflet du haut.
 * Pas de halo : elle tient par son biseau et son ombre de contact. Décoratif.
 */

import type { ReactNode } from 'react';

export type GlyphePalier = 'commu' | 'folie' | 'booster' | 'flocons' | 'tempete';

const MEDAILLE = 'M24 3L42.19 13.5V34.5L24 45L5.81 34.5V13.5Z';
const BISEAU = 'M24 6.6L39.07 15.3V32.7L24 41.4L8.93 32.7V15.3Z';

/** Une carte debout, vue de face : un liseré, et une petite étoile au centre. */
function Carte({ transform, opacite = 0.95 }: { transform?: string; opacite?: number }) {
  return (
    <g transform={transform}>
      <rect x="18" y="14" width="12" height="17" rx="2" fill="#ffffff" fillOpacity={opacite} />
      <rect x="19.6" y="15.6" width="8.8" height="13.8" rx="1.1" fill="none" stroke="#000000" strokeOpacity={0.18} strokeWidth={0.9} />
      <path d="M24 19.4l1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1z" fill="#000000" fillOpacity={0.32} />
    </g>
  );
}

function Glyphe({ glyphe }: { glyphe: GlyphePalier }) {
  switch (glyphe) {
    case 'commu':
      // Trois cartes en éventail : le booster qui tombe pour tout le monde.
      return (
        <g transform="translate(0 1.5)">
          <Carte transform="rotate(-18 24 33)" opacite={0.55} />
          <Carte transform="rotate(18 24 33)" opacite={0.55} />
          <Carte />
        </g>
      );
    case 'folie':
      // Un éclair, franc, qui déborde un peu : la folie.
      return (
        <>
          <path d="M27.2 11.5L16.6 26.2h6.6l-2.5 10.3 10.8-15.3h-6.7z" fill="#ffffff" fillOpacity={0.95} strokeLinejoin="round" />
          <path d="M27.2 11.5L16.6 26.2h6.6" fill="none" stroke="#000000" strokeOpacity={0.15} strokeWidth={0.8} strokeLinejoin="round" />
        </>
      );
    case 'booster':
      return <Carte transform="translate(0 1.5)" />;
    case 'flocons':
      // L'Avalanche : une montagne, et la neige qui en dévale.
      return (
        <>
          <path d="M11.5 34.5L21 19.5l4.2 6.3 3.3-4.3 8 13z" fill="#ffffff" fillOpacity={0.95} strokeLinejoin="round" />
          <path d="M18.4 23.6l2.6 1.6 1.7-1.9 1.4 2" fill="none" stroke="#000000" strokeOpacity={0.25} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="29.5" cy="14.5" r="1.6" fill="#ffffff" />
          <circle cx="34" cy="18" r="1.2" fill="#ffffff" fillOpacity={0.85} />
          <circle cx="25.5" cy="12.8" r="1" fill="#ffffff" fillOpacity={0.7} />
        </>
      );
    case 'tempete':
      // La Tempête de neige : un nuage qui lâche sa neige, poussée par le vent.
      return (
        <>
          <path
            d="M17 27.5a4.6 4.6 0 0 1-.5-9.2 6.2 6.2 0 0 1 11.8-2 5 5 0 1 1 3.2 11.2z"
            fill="#ffffff"
            fillOpacity={0.95}
          />
          <circle cx="18.5" cy="31.5" r="1.4" fill="#ffffff" />
          <circle cx="24" cy="32.5" r="1.4" fill="#ffffff" />
          <circle cx="29.5" cy="31.5" r="1.4" fill="#ffffff" />
          <circle cx="21" cy="36" r="1.2" fill="#ffffff" fillOpacity={0.8} />
          <circle cx="27" cy="36" r="1.2" fill="#ffffff" fillOpacity={0.8} />
        </>
      );
  }
}

export function EmblemePalier({
  glyphe,
  teinte,
  id,
  className,
}: {
  glyphe: GlyphePalier;
  /** Une couleur CSS : `var(--aurora)`, `#a78bfa`… */
  teinte: string;
  /** Unique sur la page : il nomme le dégradé du reflet. */
  id: string;
  className?: string;
}) {
  const reflet = `palier-reflet-${id}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={reflet} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: teinte, stopOpacity: 0.6 }} />
          <stop offset="0.7" style={{ stopColor: teinte, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={MEDAILLE} style={{ fill: `color-mix(in srgb, ${teinte} 32%, var(--fond))` }} />
      <path d={MEDAILLE} fill={`url(#${reflet})`} style={{ stroke: teinte }} strokeWidth={1.6} strokeLinejoin="round" />
      <path d={BISEAU} fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1} strokeLinejoin="round" />
      <Glyphe glyphe={glyphe} />
    </svg>
  );
}

/**
 * La même médaille, avec une icône du site au lieu d'un glyphe de palier :
 * les tuiles de la modération. L'icône se pose par-dessus, en blanc ; la
 * médaille prend sa teinte comme les autres.
 */
export function Medaille({
  teinte,
  id,
  className,
  children,
}: {
  teinte: string;
  /** Unique sur la page : il nomme le dégradé du reflet. */
  id: string;
  className?: string;
  /** L'icône, déjà dimensionnée. */
  children: ReactNode;
}) {
  const reflet = `medaille-reflet-${id}`;
  return (
    <span className={`medaille ${className ?? ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <defs>
          <linearGradient id={reflet} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: teinte, stopOpacity: 0.6 }} />
            <stop offset="0.7" style={{ stopColor: teinte, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={MEDAILLE} style={{ fill: `color-mix(in srgb, ${teinte} 32%, var(--fond))` }} />
        <path
          d={MEDAILLE}
          fill={`url(#${reflet})`}
          style={{ stroke: teinte }}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path d={BISEAU} fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1} strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}
