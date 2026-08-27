/**
 * Courbe de prix d'une carte, en SVG écrit à la main.
 *
 * Aucune bibliothèque de graphiques : le nuage est simple, un SVG reste net à
 * toutes les tailles, se rend côté serveur et ne pèse rien dans le bundle. Le
 * conteneur gère son propre défilement horizontal pour que la page, elle, ne
 * défile jamais.
 */

import { num, shortDate, shortDateTime } from '@/lib/format';

interface Point {
  at: string;
  price: number;
}

const W = 760;
const H = 240;
const PAD = { top: 14, right: 16, bottom: 28, left: 52 };

export function PriceChart({
  points,
  color = '#7fd8ff',
  average,
}: {
  points: Point[];
  color?: string;
  average?: number | null;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center px-6 text-center text-xs text-faint">
        Aucune vente conclue pour le moment. La cote apparaîtra dès la première transaction.
      </div>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const times = points.map((p) => new Date(p.at).getTime());
  const prices = points.map((p) => p.price);

  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);

  // Marge verticale de 12 % pour que la courbe ne colle pas aux bords.
  const span = pMax - pMin || Math.max(1, pMax * 0.25);
  const yMin = Math.max(0, pMin - span * 0.12);
  const yMax = pMax + span * 0.12;

  const x = (t: number) => (tMax === tMin ? innerW / 2 : ((t - tMin) / (tMax - tMin)) * innerW);
  const y = (p: number) => innerH - ((p - yMin) / (yMax - yMin)) * innerH;

  const coords = points.map((p, i) => ({
    x: x(times[i]),
    y: y(p.price),
    price: p.price,
    at: p.at,
  }));

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${coords.at(-1)!.x.toFixed(1)},${innerH} L${coords[0].x.toFixed(1)},${innerH} Z`;

  const ticks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * i) / 3);
  const gradientId = `spark-${color.replace('#', '')}`;

  const avgY = average != null && average >= yMin && average <= yMax ? y(average) : null;

  const dateLabel = (t: number) => shortDate(new Date(t).toISOString());

  return (
    <div className="scroll-x">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[240px] w-full min-w-[540px]"
        role="img"
        aria-label={`Évolution du prix sur ${points.length} vente${points.length > 1 ? 's' : ''}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
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
                stroke="#1a2739"
                strokeDasharray="3 5"
              />
              <text
                x={-9}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#4d6180"
                fontSize="10"
              >
                {num(tick)}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Ligne de moyenne : le repère qui dit si le dernier prix est cher. */}
          {avgY !== null && (
            <>
              <line
                x1={0}
                x2={innerW}
                y1={avgY}
                y2={avgY}
                stroke="#7f95b0"
                strokeWidth="1"
                className="sparkline-avg"
              />
              <text x={innerW - 2} y={avgY - 5} textAnchor="end" fill="#7f95b0" fontSize="9.5">
                {`Moy. ${num(average!)}`}
              </text>
            </>
          )}

          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={i === coords.length - 1 ? 4.5 : 2.5}
              fill={color}
              stroke={i === coords.length - 1 ? '#050810' : 'none'}
              strokeWidth={i === coords.length - 1 ? 1.5 : 0}
            >
              {/* Un seul enfant textuel, jamais plusieurs expressions : dans un
                  <title> SVG, React concatène côté serveur et crée des nœuds
                  distincts côté client, ce qui casse l'hydratation. */}
              <title>{`${num(c.price)} ❄ — ${shortDateTime(c.at)}`}</title>
            </circle>
          ))}

          <text y={innerH + 19} fill="#4d6180" fontSize="10">
            {dateLabel(tMin)}
          </text>
          <text x={innerW} y={innerH + 19} textAnchor="end" fill="#4d6180" fontSize="10">
            {dateLabel(tMax)}
          </text>
        </g>
      </svg>
    </div>
  );
}
