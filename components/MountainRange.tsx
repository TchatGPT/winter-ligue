/**
 * La chaîne himalayenne du fond.
 *
 * Cinq plans de crêtes en SVG, du plus lointain au plus proche, avec de la
 * brume intercalée. La profondeur ne vient pas d'un moteur 3D mais de la
 * perspective atmosphérique : plus une crête est loin, plus elle est pâle,
 * bleue et floue. C'est ce que fait l'œil en montagne, et ça se rend en
 * quelques kilo-octets.
 *
 * Le choix contre un vrai maillage 3D est délibéré : Three.js pèserait plus de
 * 600 Ko et ferait tourner le GPU en continu pour un décor qui ne bouge jamais.
 * Ici, la parallaxe est portée par `animation-timeline: scroll()` — donc par le
 * compositeur, sans une ligne de JavaScript et sans écouteur de défilement.
 */

const LAYERS = [
  {
    key: 'a',
    className: 'mt-far',
    fill: 'url(#ridge-far)',
    d: 'M0,406 L92,334 L152,372 L244,286 L332,356 L412,304 L502,364 L592,300 L682,354 L782,272 L872,344 L962,310 L1052,362 L1142,294 L1232,350 L1322,316 L1402,356 L1440,334 L1440,560 L0,560 Z',
  },
  {
    key: 'b',
    className: 'mt-mid',
    fill: 'url(#ridge-mid)',
    d: 'M0,446 L120,376 L212,416 L322,304 L422,382 L522,340 L622,408 L742,290 L852,376 L952,334 L1072,402 L1182,322 L1292,386 L1382,348 L1440,396 L1440,560 L0,560 Z',
  },
  {
    key: 'c',
    className: 'mt-hero',
    fill: 'url(#ridge-hero)',
    // Le sommet dominant, légèrement décentré : une pyramide centrée fait
    // décor de théâtre, décalée elle fait paysage.
    d: 'M0,472 L120,438 L240,460 L340,406 L440,434 L498,322 L562,188 L622,288 L692,252 L762,342 L842,298 L932,368 L1032,324 L1132,394 L1242,354 L1342,406 L1440,380 L1440,560 L0,560 Z',
  },
  {
    key: 'd',
    className: 'mt-near',
    fill: 'url(#ridge-near)',
    d: 'M0,502 L142,468 L262,494 L382,444 L502,480 L622,432 L762,472 L882,438 L1002,484 L1122,450 L1262,488 L1382,458 L1440,480 L1440,560 L0,560 Z',
  },
] as const;

/** Névés : les plaques de neige accrochées aux sommets. */
const SNOW = [
  // Le sommet principal, avec une arête irrégulière — une ligne droite ferait
  // « chapeau posé » au lieu de « neige accrochée ».
  'M498,322 L520,270 L534,288 L546,246 L562,188 L578,244 L592,228 L606,266 L620,286 L600,278 L584,292 L566,272 L548,296 L528,282 L512,306 Z',
  'M322,304 L338,338 L352,320 L366,346 L380,326 L396,356 L360,352 Z',
  'M742,290 L756,322 L770,306 L786,334 L800,318 L814,346 L774,340 Z',
  'M1182,322 L1196,352 L1210,336 L1224,362 L1238,346 L1250,372 L1214,366 Z',
] as const;

export function MountainRange() {
  return (
    <div className="mountains" aria-hidden="true">
      <svg viewBox="0 0 1440 560" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
        <defs>
          {/* Chaque plan a son propre dégradé : plus il est loin, plus il se
              fond dans le bleu de l'atmosphère. */}
          <linearGradient id="ridge-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1c3450" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0b1a2c" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="ridge-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#152b42" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#081627" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="ridge-hero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f2438" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#071426" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#030a15" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="ridge-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#050f1d" stopOpacity="1" />
            <stop offset="100%" stopColor="#030711" stopOpacity="0.96" />
          </linearGradient>

          <linearGradient id="snowcap" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stopColor="#dceffb" stopOpacity="0.62" />
            <stop offset="60%" stopColor="#a8cee4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7fb0cc" stopOpacity="0.06" />
          </linearGradient>

          {/* Halo derrière le sommet : la lueur froide d'une nuit claire. */}
          <radialGradient id="summit-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#8fdcff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8fdcff" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5f9ec9" stopOpacity="0" />
            <stop offset="100%" stopColor="#3d6d94" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <ellipse cx="562" cy="205" rx="300" ry="180" fill="url(#summit-glow)" />

        {LAYERS.map((layer, index) => (
          <g key={layer.key} className={layer.className}>
            <path d={layer.d} fill={layer.fill} />
            {/* Voile de brume au pied de chaque crête, sauf la plus proche :
                c'est lui qui décolle les plans les uns des autres. */}
            {index < LAYERS.length - 1 && (
              <rect x="0" y={330 + index * 40} width="1440" height="230" fill="url(#haze)" />
            )}
          </g>
        ))}

        <g className="mt-hero">
          {SNOW.map((d, i) => (
            <path key={i} d={d} fill="url(#snowcap)" />
          ))}
        </g>
      </svg>
    </div>
  );
}
