/**
 * Courbe de prix d'une carte, en SVG inline.
 *
 * Aucune bibliothèque de graphiques : le nuage de points est simple, et un SVG
 * écrit à la main reste net à toutes les tailles, se rend côté serveur, et ne
 * pèse rien dans le bundle. Le conteneur gère lui-même son défilement pour que
 * la page ne défile jamais horizontalement.
 */

interface Point {
  at: string;
  price: number;
}

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 14, bottom: 26, left: 46 };

export function PriceChart({ points, color = '#7fd8ff' }: { points: Point[]; color?: string }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-xs text-faint">
        Aucune vente conclue pour le moment — la cote apparaîtra dès la première transaction.
      </div>
    );
  }

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const times = points.map((p) => new Date(p.at).getTime());
  const prices = points.map((p) => p.price);

  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);

  // Marge verticale de 10 % pour que la courbe ne colle pas aux bords.
  const span = pMax - pMin || Math.max(1, pMax * 0.2);
  const yMin = Math.max(0, pMin - span * 0.1);
  const yMax = pMax + span * 0.1;

  const x = (t: number) => (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW);
  const y = (p: number) => innerH - ((p - yMin) / (yMax - yMin)) * innerH;

  const coords = points.map((p, i) => ({ x: x(times[i]), y: y(p.price), price: p.price, at: p.at }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)!.x.toFixed(1)},${innerH} L${coords[0].x.toFixed(1)},${innerH} Z`;

  // Quatre graduations régulières sur l'axe des prix.
  const ticks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * i) / 3);
  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <div className="scroll-x">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[220px] w-full min-w-[520px]"
        role="img"
        aria-label={`Évolution du prix sur ${points.length} vente${points.length > 1 ? 's' : ''}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {ticks.map((tick, i) => (
            <g key={i}>
              <line
                x1={0}
                x2={innerW}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#1e2a3b"
                strokeDasharray="3 4"
              />
              <text
                x={-8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#4d5c72"
                fontSize="10"
                fontFamily="var(--font-sans)"
              >
                {Math.round(tick).toLocaleString('fr-FR')}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 2.5} fill={color}>
              <title>
                {c.price.toLocaleString('fr-FR')} ❄ —{' '}
                {new Date(c.at).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </title>
            </circle>
          ))}

          <text y={innerH + 18} fill="#4d5c72" fontSize="10">
            {new Date(tMin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </text>
          <text x={innerW} y={innerH + 18} textAnchor="end" fill="#4d5c72" fontSize="10">
            {new Date(tMax).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </text>
        </g>
      </svg>
    </div>
  );
}
