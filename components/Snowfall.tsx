/**
 * La neige.
 *
 * Trois plans de profondeur : les flocons lointains sont petits, flous et
 * lents, les proches sont gros, nets et rapides. C'est ce décalage qui donne
 * le volume — une seule couche produit une pluie de points, pas de la neige.
 *
 * Les positions sont dérivées de l'index par le nombre d'or, jamais tirées au
 * hasard : le rendu serveur et le rendu client produisent exactement le même
 * HTML, donc aucune erreur d'hydratation.
 */

const GLYPHS = ['❄', '❅', '❆', '✻', '✼', '❉', '✧'];

interface Layer {
  name: 'far' | 'mid' | 'near';
  count: number;
  size: [number, number];
  duration: [number, number];
  sway: [number, number];
}

const LAYERS: Layer[] = [
  { name: 'far', count: 34, size: [5, 9], duration: [26, 40], sway: [3, 6] },
  { name: 'mid', count: 22, size: [10, 16], duration: [17, 27], sway: [4, 8] },
  { name: 'near', count: 11, size: [17, 27], duration: [11, 18], sway: [5, 10] },
];

/** Suite pseudo-aléatoire mais déterministe, répartie par le nombre d'or. */
function spread(index: number, offset = 0): number {
  return ((index + offset) * 0.6180339887498949) % 1;
}

function flakesFor(layer: Layer, seed: number) {
  return Array.from({ length: layer.count }, (_, i) => {
    const a = spread(i, seed);
    const b = spread(i, seed + 37);
    const c = spread(i, seed + 91);

    const [minSize, maxSize] = layer.size;
    const [minDur, maxDur] = layer.duration;
    const [minSway, maxSway] = layer.sway;

    return {
      left: a * 100,
      size: minSize + b * (maxSize - minSize),
      duration: minDur + c * (maxDur - minDur),
      // Délais négatifs : la neige tombe déjà au chargement, elle ne « démarre » pas.
      delay: -(a * (maxDur + 6)),
      sway: minSway + c * (maxSway - minSway),
      swayDelay: -(b * 5),
      glyph: GLYPHS[Math.floor(b * GLYPHS.length) % GLYPHS.length],
    };
  });
}

export function Snowfall() {
  return (
    <div className="snow" aria-hidden="true">
      {LAYERS.map((layer, layerIndex) =>
        flakesFor(layer, layerIndex * 13).map((flake, i) => (
          <i
            key={`${layer.name}-${i}`}
            className={layer.name}
            style={{
              left: `${flake.left}%`,
              fontSize: `${flake.size}px`,
              animationDuration: `${flake.duration}s`,
              animationDelay: `${flake.delay}s`,
            }}
          >
            <span
              style={{
                animationDuration: `${flake.sway}s`,
                animationDelay: `${flake.swayDelay}s`,
              }}
            >
              {flake.glyph}
            </span>
          </i>
        )),
      )}
    </div>
  );
}
