/**
 * Une médaille gelée, pour les deuxième et troisième du classement.
 *
 * La même matière que la couronne du leader : un disque de glace
 * translucide, plus bleu et plus dense en bas, une arête claire en haut, une
 * arête sombre en bas, deux facettes en traits pâles, un éclat. Le rang est
 * gravé au centre. Le ruban, en haut, est une courte boucle de glace.
 *
 * Deuxième et troisième se distinguent par une pointe de teinte : argent
 * bleuté pour l'une, cuivre givré pour l'autre — pas de couleur pleine,
 * la glace reste la matière.
 */
export function MedailleGlace({
  rang,
  className = 'h-8 w-8',
  id,
}: {
  rang: 2 | 3;
  className?: string;
  id?: string;
}) {
  const cle = id ?? `medaille-${rang}`;
  const teinte = rang === 2 ? { haut: '#eef6ff', bas: '#8fb6dc', arete: '#d9e9f7' } : { haut: '#f4ecdf', bas: '#b58a63', arete: '#e8cfb3' };

  return (
    <svg viewBox="0 0 40 44" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${cle}-masse`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={teinte.haut} stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#bfe0fa" stopOpacity="0.32" />
          <stop offset="1" stopColor={teinte.bas} stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={`${cle}-arete`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <filter id={`${cle}-ombre`} x="-15%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="0.9" floodColor="#04122a" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter={`url(#${cle}-ombre)`}>
        {/* Le ruban : deux pans courts, en glace. */}
        <path d="M14 2 L20 11 L26 2 L22.5 2 L20 6 L17.5 2 Z" fill={`url(#${cle}-masse)`} stroke="#eaf7ff" strokeOpacity="0.7" strokeWidth="0.8" strokeLinejoin="round" />
        {/* Le disque. */}
        <circle cx="20" cy="26" r="14" fill={`url(#${cle}-masse)`} />
      </g>

      {/* Les facettes : deux traits pâles, une veine. */}
      <g stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.3" fill="none" strokeLinecap="round">
        <path d="M11 20 L16 15 M29 20 L24 15" />
        <path d="M9 30 Q20 24 31 30" strokeOpacity="0.18" />
      </g>
      <path d="M14 34 L26 18" stroke="#3f86c8" strokeWidth="0.7" strokeOpacity="0.3" fill="none" />

      {/* Les arêtes : claire en haut, sombre en bas. */}
      <circle cx="20" cy="26" r="14" fill="none" stroke={`url(#${cle}-arete)`} strokeWidth="1.1" />
      <path d="M8.5 31 A14 14 0 0 0 31.5 31" fill="none" stroke="#1d4f86" strokeOpacity="0.5" strokeWidth="0.9" />
      <circle cx="20" cy="26" r="10.5" fill="none" stroke={teinte.arete} strokeOpacity="0.45" strokeWidth="0.7" />

      {/* Le rang, gravé. */}
      <text x="20" y="31.2" textAnchor="middle" fontFamily="var(--font-display), sans-serif" fontWeight="900" fontSize="15" fill="#f4fbff" stroke="#0e2d52" strokeWidth="0.6" paintOrder="stroke">
        {rang}
      </text>

      {/* L'éclat. */}
      <path d="M12.2 17.6 L13.8 16.2 L14.6 19.4 L13.2 21.4 Z" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}
