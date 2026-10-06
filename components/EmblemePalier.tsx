/**
 * Les emblèmes des paliers de subs, dans la manière de ceux des raretés
 * (`EmblemeRarete`) : la même médaille hexagonale taillée dans la glace, et
 * dedans ce que le palier fait tomber.
 *
 *  - **booster** — un booster, sertissage en haut et en bas ;
 *  - **flocons** — un flocon, pour les flocons doublés ;
 *  - **tempete** — une tornade, pour le Booster Commu qui tombe plus souvent.
 *
 * La teinte est une couleur CSS (`var(--aurora)`, la couleur d'une rareté) :
 * la médaille en prend un fond profond, une arête vive et un reflet du haut.
 * Pas de halo : elle tient par son biseau et son ombre de contact. Décoratif.
 */

import type { ReactNode } from 'react';

export type GlyphePalier = 'booster' | 'flocons' | 'tempete';

const MEDAILLE = 'M24 3L42.19 13.5V34.5L24 45L5.81 34.5V13.5Z';
const BISEAU = 'M24 6.6L39.07 15.3V32.7L24 41.4L8.93 32.7V15.3Z';

function Glyphe({ glyphe }: { glyphe: GlyphePalier }) {
  const trait = { fill: 'none', stroke: '#ffffff', strokeWidth: 1.8, strokeLinecap: 'round' as const };
  switch (glyphe) {
    case 'booster':
      return (
        <>
          <rect x="16.5" y="13.5" width="15" height="21" rx="2" fill="#ffffff" fillOpacity={0.92} />
          <path d="M16.5 17.5h15M16.5 30.5h15" stroke="#000000" strokeOpacity={0.28} strokeWidth={1.2} />
          <path d="M24 20.5v7M21 22.25l6 3.5M27 22.25l-6 3.5" stroke="#000000" strokeOpacity={0.45} strokeWidth={1.3} strokeLinecap="round" />
        </>
      );
    case 'flocons':
      return (
        <>
          <path {...trait} d="M24 13v22M14.5 18.5l19 11M33.5 18.5l-19 11" />
          <path {...trait} strokeWidth={1.4} d="M21 14.5l3 2.5 3-2.5M21 33.5l3-2.5 3 2.5M14.6 22.2l3.6-1.3-.6-3.8M33.4 25.8l-3.6 1.3.6 3.8M14.6 25.8l3.6 1.3-.6 3.8M33.4 22.2l-3.6-1.3.6-3.8" />
        </>
      );
    case 'tempete':
      return <path {...trait} d="M14 15h20M16 20.5h16M18.5 26h11M21 31.5h6.5M23 36h2.5" />;
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
