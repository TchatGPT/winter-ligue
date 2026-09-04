'use client';

/**
 * Courbe de prix d'une carte, en SVG écrit à la main.
 *
 * Aucune bibliothèque de graphiques : le nuage est simple, un SVG reste net à
 * toutes les tailles et ne pèse rien dans le bundle. Il se met à l'échelle de sa
 * boîte par son `viewBox` — la même courbe sert la page de marché, la fenêtre de
 * cote et la fiche d'une carte, sans réglage.
 *
 * ## L'infobulle est en HTML, pas en SVG
 *
 * Le survol posait un `<title>` : l'infobulle du système, qui met une seconde à
 * venir, ne suit pas la palette du site et n'existe pas au doigt. Celle-ci est
 * une plaque posée au-dessus du graphique, positionnée en pourcentage du
 * `viewBox` — elle suit donc la mise à l'échelle sans calcul supplémentaire, et
 * se compose avec les styles du site comme n'importe quel autre panneau.
 */

import { useRef, useState } from 'react';
import { longDateTime, num, shortDate } from '@/lib/format';

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
  const svg = useRef<SVGSVGElement>(null);
  /** Le point survolé, s'il y en a un. */
  const [actif, setActif] = useState<number | null>(null);

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

  /**
   * Le point le plus proche du curseur, **en abscisse seulement**.
   *
   * C'est délibéré : sur une courbe de prix on cherche « la vente de ce
   * jour-là », pas le point le plus proche à vol d'oiseau. Chercher en deux
   * dimensions oblige à viser le point ; viser sa colonne suffit, et c'est ce
   * qui rend l'infobulle utilisable au doigt.
   */
  function survole(event: React.PointerEvent<SVGSVGElement>) {
    const boite = svg.current?.getBoundingClientRect();
    if (!boite || boite.width === 0) return;
    // De la position à l'écran vers le repère du `viewBox`, puis vers l'intérieur
    // des marges : le SVG est mis à l'échelle, le rapport suffit à le défaire.
    const vx = ((event.clientX - boite.left) / boite.width) * W - PAD.left;
    let proche = 0;
    for (let i = 1; i < coords.length; i += 1) {
      if (Math.abs(coords[i].x - vx) < Math.abs(coords[proche].x - vx)) proche = i;
    }
    setActif(proche);
  }

  if (points.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center px-6 text-center text-xs text-faint">
        Aucune vente conclue pour le moment. La cote apparaîtra dès la première transaction.
      </div>
    );
  }

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${coords.at(-1)!.x.toFixed(1)},${innerH} L${coords[0].x.toFixed(1)},${innerH} Z`;

  const ticks = Array.from({ length: 4 }, (_, i) => yMin + ((yMax - yMin) * i) / 3);
  const gradientId = `spark-${color.replace('#', '')}`;

  const avgY = average != null && average >= yMin && average <= yMax ? y(average) : null;
  const dateLabel = (t: number) => shortDate(new Date(t).toISOString());
  const point = actif !== null ? coords[actif] : null;

  return (
    <div className="relative w-full">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        /* Plus basse sur téléphone : la courbe garde son rapport, mais 260 px
           de haut y coûtent le quart de l'écran pour une information qu'on lit
           en un coup d'œil. */
        className="h-auto max-h-[150px] w-full touch-none sm:max-h-[240px]"
        role="img"
        aria-label={`Évolution du prix sur ${points.length} vente${points.length > 1 ? 's' : ''}`}
        onPointerMove={survole}
        onPointerLeave={() => setActif(null)}
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
                vectorEffect="non-scaling-stroke"
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
            vectorEffect="non-scaling-stroke"
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
                vectorEffect="non-scaling-stroke"
                className="sparkline-avg"
              />
              <text x={innerW - 2} y={avgY - 5} textAnchor="end" fill="#7f95b0" fontSize="9.5">
                {`Moy. ${num(average!)}`}
              </text>
            </>
          )}

          {/* Le réticule du point survolé : deux traits qui vont le chercher sur
              les deux axes. Sans eux, l'infobulle flotte sans qu'on sache à quel
              point elle se rapporte. */}
          {point && (
            <>
              <line
                x1={point.x}
                x2={point.x}
                y1={0}
                y2={innerH}
                stroke={color}
                strokeOpacity="0.45"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0}
                x2={innerW}
                y1={point.y}
                y2={point.y}
                stroke={color}
                strokeOpacity="0.26"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {coords.map((c, i) => (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={actif === i ? 5.5 : i === coords.length - 1 ? 4.5 : 2.5}
              fill={color}
              stroke={actif === i || i === coords.length - 1 ? '#050810' : 'none'}
              strokeWidth={actif === i || i === coords.length - 1 ? 1.5 : 0}
            />
          ))}

          <text y={innerH + 19} fill="#4d6180" fontSize="10">
            {dateLabel(tMin)}
          </text>
          <text x={innerW} y={innerH + 19} textAnchor="end" fill="#4d6180" fontSize="10">
            {dateLabel(tMax)}
          </text>
        </g>
      </svg>

      {/*
        L'infobulle, positionnée en pourcentage du `viewBox`.

        Les deux bornes l'empêchent de sortir du cadre aux extrémités : une
        infobulle coupée au bord droit est exactement celle du dernier prix,
        c'est-à-dire la plus consultée de toutes.
      */}
      {point && (
        <div
          className="glass glass-strong pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 whitespace-nowrap"
          style={{
            left: `${Math.min(86, Math.max(14, ((PAD.left + point.x) / W) * 100))}%`,
            top: `${((PAD.top + point.y) / H) * 100}%`,
            marginTop: -14,
          }}
        >
          <p className="text-[12px] text-muted">{longDateTime(point.at)}</p>
          <p className="num font-display text-[15px] font-black" style={{ color }}>
            ❄ {num(point.price)}
          </p>
        </div>
      )}
    </div>
  );
}
