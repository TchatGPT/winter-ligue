/**
 * Chute de neige décorative.
 *
 * Les positions sont calculées à partir de l'index, jamais tirées au hasard :
 * le rendu serveur et le rendu client produisent exactement le même HTML, donc
 * pas d'erreur d'hydratation. L'animation est entièrement en CSS et se coupe
 * d'elle-même si le visiteur a demandé des animations réduites.
 */

const FLAKES = Array.from({ length: 40 }, (_, i) => {
  // Répartition pseudo-aléatoire mais déterministe, basée sur le nombre d'or.
  const golden = (i * 0.6180339887) % 1;
  return {
    left: golden * 100,
    size: 6 + ((i * 7) % 11),
    duration: 9 + ((i * 13) % 14),
    delay: -((i * 3) % 18),
    drift: ((i % 7) - 3) * 22,
    opacity: 0.18 + ((i % 5) * 0.11),
  };
});

export function Snowfall() {
  return (
    <div className="snow" aria-hidden="true">
      {FLAKES.map((flake, i) => (
        <span
          key={i}
          style={{
            left: `${flake.left}%`,
            fontSize: `${flake.size}px`,
            opacity: flake.opacity,
            animationDuration: `${flake.duration}s`,
            animationDelay: `${flake.delay}s`,
            ['--drift' as string]: `${flake.drift}px`,
          }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}
