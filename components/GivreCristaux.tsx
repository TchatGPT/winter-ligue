/**
 * Le givre de la colonne de navigation : les rainures des séparateurs, la
 * congère du coin, la fêlure de l'administration.
 *
 * Tout est décoratif, masqué aux lecteurs d'écran, sans pointeur.
 */

/**
 * Une rainure gelée : le séparateur du panneau. Un pixel sombre, un pixel
 * clair dessous, sur un tracé très légèrement irrégulier — jamais un trait
 * droit uniforme.
 */
export function Rainure({ className = '' }: { className?: string }) {
  const d = 'M0 2 L22 2.3 L48 1.7 L70 2.2 L96 1.8 L118 2.4 L140 1.9 L166 2.2 L184 1.8 L200 2';
  return (
    <svg className={`givre-rainure ${className}`} viewBox="0 0 200 5" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="#04122a" strokeOpacity="0.75" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#e2f2ff" strokeOpacity="0.16" strokeWidth="1" transform="translate(0 1)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Une congère dans le coin inférieur gauche : une seule courbe, mate, ombrée. */
export function DeriveNeige() {
  return (
    <svg className="givre-derive" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="givre-derive-deg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fafcff" />
          <stop offset="1" stopColor="#c8d6e8" />
        </linearGradient>
      </defs>
      <path d="M0 40 L0 22 C14 19 22 12 38 15 C52 18 60 26 78 28 C96 30 108 36 120 40 Z" fill="url(#givre-derive-deg)" />
      <path d="M0 22 C14 19 22 12 38 15 C52 18 60 26 78 28 C96 30 108 36 120 40" fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * La fêlure qui sépare l'administration du reste : une ligne irrégulière,
 * plus claire au centre, éteinte aux deux bouts. Un trait clair doublé d'un
 * trait sombre décalé d'un pixel, pour qu'elle se lise comme une profondeur.
 */
export function Felure() {
  const d = 'M0 3 L18 2.4 L34 3.8 L52 2.2 L66 3.4 L84 1.8 L100 3.2 L118 2.6 L134 3.9 L150 2.3 L168 3.3 L186 2.1 L200 3';
  return (
    <svg className="givre-felure" viewBox="0 0 200 6" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="givre-felure-deg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="#04122a" strokeOpacity="0.7" strokeWidth="1" transform="translate(0 1)" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="url(#givre-felure-deg)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
