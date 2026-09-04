/**
 * Trois petits dessins en glace, pour les étapes de « Comment ça marche ».
 *
 * La même matière que la couronne du leader : un corps translucide qui laisse
 * voir le fond, plus bleu là où la glace est épaisse, un fil blanc sur les
 * arêtes hautes, un fil sombre sur les arêtes basses, quelques facettes en
 * traits pâles, et une ombre de contact courte. Pas de glow.
 *
 * Trois sujets, un par étape : un booster scellé, trois cartes en éventail,
 * deux épées croisées sous un flocon.
 */

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-masse`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2fbff" stopOpacity="0.55" />
        <stop offset="0.5" stopColor="#bfe4ff" stopOpacity="0.38" />
        <stop offset="1" stopColor="#6fb4ea" stopOpacity="0.55" />
      </linearGradient>
      <linearGradient id={`${id}-arete`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="0.7" stopColor="#ffffff" stopOpacity="0.3" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
      </linearGradient>
      <filter id={`${id}-ombre`} x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="1.4" stdDeviation="1" floodColor="#04122a" floodOpacity="0.5" />
      </filter>
    </defs>
  );
}

/** Un bloc de glace : la masse, ses arêtes claire et sombre. */
function Bloc({ id, d, sombre }: { id: string; d: string; sombre?: string }) {
  return (
    <>
      <path d={d} fill={`url(#${id}-masse)`} />
      <path d={d} fill="none" stroke={`url(#${id}-arete)`} strokeWidth="1.1" strokeLinejoin="round" />
      {sombre && <path d={sombre} fill="none" stroke="#1d4f86" strokeOpacity="0.6" strokeWidth="0.9" strokeLinecap="round" />}
    </>
  );
}

const FACETTE = { stroke: '#ffffff', strokeOpacity: 0.32, strokeWidth: 0.6, fill: 'none', strokeLinecap: 'round' as const };

/** Un booster scellé, dents en haut et en bas. */
export function GlaceSachet({ className = 'h-14 w-14' }: { className?: string }) {
  const id = 'glace-sachet';
  const dents = (y: number, sens: 1 | -1) =>
    Array.from({ length: 7 }, (_, i) => `L${16 + i * 5.3} ${y + sens * 2.2}L${18.6 + i * 5.3} ${y}`).join('');
  const corps = `M16 14${dents(14, -1)}L53 14L53 50${dents(50, 1)}L16 50Z`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <Defs id={id} />
      <g filter={`url(#${id}-ombre)`}>
        <Bloc id={id} d={corps} sombre="M17 49.5L52 49.5" />
      </g>
      {/* Les plis de la soudure, et une facette diagonale. */}
      <g {...FACETTE}>
        <path d="M18 18L51 18M18 46L51 46" strokeOpacity={0.45} />
        <path d="M22 41L42 21" />
        <path d="M27 41L44 24" strokeOpacity={0.18} />
      </g>
      {/* Un flocon en creux au centre du sachet. */}
      <g stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round">
        {[0, 60, 120].map((a) => (
          <path key={a} d="M34.5 25L34.5 39M34.5 28.5L32 26.5M34.5 28.5L37 26.5M34.5 35.5L32 37.5M34.5 35.5L37 37.5" transform={`rotate(${a} 34.5 32)`} />
        ))}
      </g>
      <path d="M20 16.5L24 16.5" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Trois cartes en éventail, en glace. */
export function GlaceCartes({ className = 'h-14 w-14' }: { className?: string }) {
  const id = 'glace-cartes';
  const carte = 'M-9 -13L9 -13Q11 -13 11 -11L11 11Q11 13 9 13L-9 13Q-11 13 -11 11L-11 -11Q-11 -13 -9 -13Z';
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <Defs id={id} />
      <g filter={`url(#${id}-ombre)`}>
        {[-18, 0, 18].map((a, i) => (
          <g key={a} transform={`translate(${32 + i * 2 - 2} ${34 + Math.abs(a) * 0.12}) rotate(${a})`}>
            <Bloc id={id} d={carte} sombre="M-9 12.6L9 12.6" />
            <g {...FACETTE}>
              <path d="M-7 -9L7 -9" strokeOpacity={0.5} />
              <path d="M-6 8L6 -6" />
            </g>
          </g>
        ))}
      </g>
      {/* Un éclat sur la carte de devant. */}
      <path d="M40 22L42.6 19.6L43.4 24.2L41.4 27Z" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}

/** Deux épées croisées sous un flocon. */
export function GlaceEpees({ className = 'h-14 w-14' }: { className?: string }) {
  const id = 'glace-epees';
  // Une lame, pointe en haut, garde et pommeau en bas.
  const lame = 'M0 -24L3.2 -18L3.2 8L-3.2 8L-3.2 -18Z';
  const garde = 'M-9 8L9 8L9 11.5L-9 11.5Z';
  const poignee = 'M-2 11.5L2 11.5L2 21L-2 21Z';
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <Defs id={id} />
      <g filter={`url(#${id}-ombre)`}>
        {[-32, 32].map((a) => (
          <g key={a} transform={`translate(32 36) rotate(${a})`}>
            <Bloc id={id} d={lame} sombre="M-2.8 7.5L2.8 7.5" />
            <Bloc id={id} d={garde} />
            <Bloc id={id} d={poignee} sombre="M-1.6 20.6L1.6 20.6" />
            <path d="M0 -21L0 4" {...FACETTE} strokeOpacity={0.5} />
            <circle cx="0" cy="23" r="2.4" fill="#ffffff" opacity="0.85" />
          </g>
        ))}
      </g>
      {/* Le flocon, au-dessus du croisement. */}
      <g stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.1" strokeLinecap="round">
        {[0, 60, 120].map((a) => (
          <path key={a} d="M32 7L32 19M32 10L30 8.2M32 10L34 8.2M32 16L30 17.8M32 16L34 17.8" transform={`rotate(${a} 32 13)`} />
        ))}
      </g>
    </svg>
  );
}
