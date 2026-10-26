/**
 * Le logo de la Winter Ligue : un cristal de glace hexagonal taillé en gemme —
 * six facettes autour d'une table, éclairées d'en haut à gauche — et, posé
 * dessus, un flocon à six branches, avec son ombre. Le favicon (`app/icon.svg`)
 * en est la copie, couleurs en dur.
 *
 * Il a remplacé, le 26/10/2026, le carré bleu et son flocon au trait, avec le
 * sous-titre « Call of Duty Warzone » : on ne les aimait pas.
 */

const EXTERIEUR = 'M24 2.5 L42.62 13.25 L42.62 34.75 L24 45.5 L5.38 34.75 L5.38 13.25 Z';
const TABLE = 'M24 11.5 L34.83 17.75 L34.83 30.25 L24 36.5 L13.17 30.25 L13.17 17.75 Z';
/** Les facettes, chacune avec sa lumière : `eclat` en haut à gauche, `profond` en bas. */
const FACETTES: [string, string][] = [
  ['eclat', 'M5.38 13.25 L24 2.5 L24 11.5 L13.17 17.75 Z'],
  ['clair', 'M24 2.5 L42.62 13.25 L34.83 17.75 L24 11.5 Z'],
  ['moyen-clair', 'M5.38 34.75 L5.38 13.25 L13.17 17.75 L13.17 30.25 Z'],
  ['moyen', 'M42.62 13.25 L42.62 34.75 L34.83 30.25 L34.83 17.75 Z'],
  ['sombre', 'M42.62 34.75 L24 45.5 L24 36.5 L34.83 30.25 Z'],
  ['profond', 'M24 45.5 L5.38 34.75 L13.17 30.25 L24 36.5 Z'],
];
/** Une branche du flocon, vers le haut ; il en a six. */
const BRANCHE = 'M24 24 L24 13 M24 18.4 L20.9 15.3 M24 18.4 L27.1 15.3 M24 15.2 L21.8 13 M24 15.2 L26.2 13';
const ANGLES = [0, 60, 120, 180, 240, 300];

export function LogoCristal({ className }: { className?: string }) {
  return (
    <svg className={`logo-cristal ${className ?? ''}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {FACETTES.map(([teinte, d]) => (
        <path key={teinte} d={d} data-facette={teinte} />
      ))}
      <path d={TABLE} className="logo-cristal-table" />
      <path d={EXTERIEUR} className="logo-cristal-arete" />
      {/* Le flocon, et son ombre portée sur la glace. */}
      <g className="logo-cristal-ombre" transform="translate(0 0.8)">
        {ANGLES.map((a) => (
          <path key={a} d={BRANCHE} transform={`rotate(${a} 24 24)`} />
        ))}
      </g>
      <g className="logo-cristal-flocon">
        {ANGLES.map((a) => (
          <path key={a} d={BRANCHE} transform={`rotate(${a} 24 24)`} />
        ))}
      </g>
      <circle cx="24" cy="24" r="2.1" className="logo-cristal-coeur" />
    </svg>
  );
}

/**
 * La marque : le cristal, « WINTER LIGUE » en grand, et — `saison` — une ligne
 * discrète dessous, « Saison 1 · Warzone ».
 */
export function Marque({ saison, taille = 'grande' }: { saison?: string; taille?: 'grande' | 'petite' }) {
  return (
    <span className="marque" data-taille={taille}>
      <LogoCristal className="marque-cristal" />
      <span className="marque-texte">
        <span className="marque-nom">
          <span>Winter</span> <em>Ligue</em>
        </span>
        {saison && (
          <span className="marque-saison">
            <b>{saison}</b> · Warzone
          </span>
        )}
      </span>
    </span>
  );
}
