/**
 * Une couronne de glace, pour le leader du classement.
 *
 * Pas l'emoji : il impose son or et son style « jouet », et rien dans le site
 * n'est doré de cette façon. Celle-ci est un **bloc de glace** taillé, et donc
 * transparent : on voit le fond à travers, plus clair sur les arêtes qui
 * attrapent la lumière, plus bleu là où la glace est épaisse. Ce qui la fait
 * lire comme de la glace et non comme un dessin plat :
 *
 *  - un corps à moitié transparent, à peine plus bleu que le verre derrière ;
 *  - des **arêtes vives** : un fil blanc sur les bords hauts, un fil sombre sur
 *    le bord bas, comme sur un glaçon posé sur une table ;
 *  - des facettes intérieures, traits fins et pâles, qui suggèrent la taille ;
 *  - deux éclats spéculaires, petits, sur les pointes exposées ;
 *  - trois glaçons sous le bandeau, plus transparents vers la pointe.
 *
 * Un `id` par instance pour les dégradés : deux couronnes sur la même page ne
 * doivent pas se partager un `<defs>`.
 */
export function CouronneGlace({
  className = 'h-10 w-10',
  id = 'couronne',
}: {
  className?: string;
  id?: string;
}) {
  // Le contour, réutilisé pour le corps, les arêtes et les éclats.
  const corps = 'M5 12 L14 21 L24 7 L34 21 L43 12 L40 30 L8 30 Z';

  return (
    <svg viewBox="0 0 48 44" className={className} aria-hidden="true">
      <defs>
        {/* La masse : claire en haut, bleue et plus dense en bas, jamais opaque. */}
        <linearGradient id={`${id}-masse`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2fbff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#bfe4ff" stopOpacity="0.36" />
          <stop offset="1" stopColor="#7cc0f2" stopOpacity="0.5" />
        </linearGradient>
        {/* Le bandeau, un peu plus dense : c'est la partie la plus épaisse. */}
        <linearGradient id={`${id}-bandeau`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dff2ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#5ea6e2" stopOpacity="0.5" />
        </linearGradient>
        {/* Le fil de lumière sur les arêtes hautes, qui s'éteint sur les flancs. */}
        <linearGradient id={`${id}-arete`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        {/* Les glaçons : denses à la base, presque rien à la pointe. */}
        <linearGradient id={`${id}-glacon`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfeaff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        {/* Une ombre de contact courte sous la couronne, pour qu'elle pèse. */}
        <filter id={`${id}-ombre`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="0.9" floodColor="#04122a" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter={`url(#${id}-ombre)`}>
        {/* Le corps, transparent. */}
        <path d={corps} fill={`url(#${id}-masse)`} />
        <rect x="7" y="29" width="34" height="6" rx="1.5" fill={`url(#${id}-bandeau)`} />
        <path
          d="M11 35 L12.6 35 L11.9 41 Z M19 35 L20.8 35 L20 43.5 Z M31 35 L32.4 35 L31.8 39.5 Z"
          fill={`url(#${id}-glacon)`}
        />
      </g>

      {/* Les facettes intérieures : des traits pâles, jamais un remplissage. */}
      <g stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.32" fill="none" strokeLinecap="round">
        <path d="M24 7 L21 20 M24 7 L27 20" />
        <path d="M5 12 L12 22 M43 12 L36 22" />
        <path d="M14 21 L16 29 M34 21 L32 29" />
        <path d="M9 30 L39 30" strokeOpacity="0.22" />
      </g>
      {/* Une veine plus bleue, comme une fissure dans l'épaisseur. */}
      <path d="M18 26 L26 14" stroke="#3f86c8" strokeWidth="0.7" strokeOpacity="0.35" fill="none" />

      {/* Les arêtes : blanc vif en haut, sombre en bas — c'est ce qui donne le volume. */}
      <path
        d="M5 12 L14 21 L24 7 L34 21 L43 12"
        fill="none"
        stroke={`url(#${id}-arete)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M5 12 L8 30 M43 12 L40 30" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="0.8" />
      <path d="M8 30 L40 30 M7 35 L41 35" fill="none" stroke="#1d4f86" strokeOpacity="0.55" strokeWidth="0.9" />
      <rect x="7" y="29" width="34" height="6" rx="1.5" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="0.7" />

      {/* Les éclats : deux, petits, sur les pointes exposées à la lumière. */}
      <path d="M23.2 9.5 L24.4 8.2 L25 10.6 L24 12.6 Z" fill="#ffffff" opacity="0.9" />
      <path d="M6.6 13.2 L7.8 14.8 L8.6 17.6 L7.4 16.4 Z" fill="#ffffff" opacity="0.7" />
      <path d="M20.2 36.2 L20.6 39.4" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.5" strokeLinecap="round" />

      {/* Les trois pierres du bandeau : des billes de glace, pas des rubis. */}
      <circle cx="14" cy="32" r="1.3" fill="#ffffff" opacity="0.55" />
      <circle cx="24" cy="32" r="1.5" fill="#ffffff" opacity="0.65" />
      <circle cx="34" cy="32" r="1.3" fill="#ffffff" opacity="0.55" />
    </svg>
  );
}
