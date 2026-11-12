import { useId } from 'react';

/**
 * Une tête de mort gelée, pour les kills (12/11/2026) : la même matière que la
 * couronne et les médailles — une glace claire en haut, plus bleue et plus
 * dense en bas, une arête de givre, un éclat —, les orbites et le nez creusés
 * en bleu nuit. Elle remplace le « k » qu'on ne comprenait pas.
 */
export function CraneGlace({ className = 'h-4 w-4' }: { className?: string }) {
  const cle = useId().replace(/:/g, '');
  const crane = 'M12 2.5a8 8 0 0 0-8 8c0 2.8 1.4 4.8 3.2 6v2.6A1.9 1.9 0 0 0 9.1 21h5.8a1.9 1.9 0 0 0 1.9-1.9v-2.6c1.8-1.2 3.2-3.2 3.2-6a8 8 0 0 0-8-8Z';
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${cle}-glace`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--frost)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--ice)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ice-3)' }} />
        </linearGradient>
      </defs>
      <path d={crane} fill={`url(#${cle}-glace)`} style={{ stroke: 'var(--frost)' }} strokeWidth="0.9" />
      {/* Les orbites et le nez, creusés dans la glace. */}
      <g style={{ fill: 'var(--nuit)' }}>
        <ellipse cx="8.9" cy="11.3" rx="2.3" ry="2.5" />
        <ellipse cx="15.1" cy="11.3" rx="2.3" ry="2.5" />
        <path d="M12 14.2 10.8 16.6h2.4L12 14.2Z" />
      </g>
      {/* Les dents. */}
      <path d="M10.2 21v-2.4M12 21v-2.4M13.8 21v-2.4" style={{ stroke: 'var(--nuit)' }} strokeWidth="0.9" strokeLinecap="round" />
      {/* L'éclat. */}
      <path d="M7.2 6.8 8.6 5.6 9.2 7.6 8 8.8Z" style={{ fill: 'var(--frost)' }} opacity="0.9" />
    </svg>
  );
}
