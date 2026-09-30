import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

/**
 * Les quatre badges de rareté : des cristaux de glace.
 *
 * Ils ont été des sigles, puis des pierres serties. Cette version les taille
 * dans la glace, la matière du site : chaque rareté est un **flocon** dans sa
 * couleur, et c'est la complexité du flocon qui dit le rang, comme dans la
 * nature où un cristal grossit en se ramifiant.
 *
 *  - **Commune** — un petit cristal hexagonal, plat, sans branche ;
 *  - **Rare** — six bras ramifiés deux fois, autour d'une plaque hexagonale ;
 *  - **Ultra rare** — des bras doubles, des pointes perlées, un léger halo ;
 *  - **Légendaire** — douze rayons, un cœur en gemme, le halo le plus fort.
 *
 * Chaque flocon est fait d'un trait de la couleur de rareté, d'un trait blanc
 * plus fin par-dessus (l'arête de glace qui prend la lumière) et d'un cœur en
 * dégradé. Le halo n'existe qu'à partir de l'ultra rare : c'est lui qui fait
 * repérer une légendaire dans une grille de cent vignettes.
 *
 * Purement décoratif : masqué aux lecteurs d'écran, c'est à l'élément qui le
 * porte d'annoncer la rareté.
 */

const C = 16;

/** Un bras de flocon, dessiné vers le haut depuis le centre ; tourné six fois. */
function bras(longueur: number, ramifications: { a: number; l: number }[], double = false) {
  let d = `M${C} ${C}L${C} ${C - longueur}`;
  for (const r of ramifications) {
    // Une paire de ramifications en V, à la hauteur `a`, de longueur `l`.
    const y = C - r.a;
    const dx = r.l * Math.sin(Math.PI / 3);
    const dy = r.l * Math.cos(Math.PI / 3);
    d += `M${C} ${y}L${(C - dx).toFixed(2)} ${(y - dy).toFixed(2)}M${C} ${y}L${(C + dx).toFixed(2)} ${(y - dy).toFixed(2)}`;
  }
  if (double) {
    // Un second trait parallèle très court à la base, pour épaissir le bras.
    d += `M${C - 1.1} ${C - 2}L${C - 1.1} ${C - longueur * 0.45}M${C + 1.1} ${C - 2}L${C + 1.1} ${C - longueur * 0.45}`;
  }
  return d;
}

function hexagone(rayon: number, decalage = 0) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = ((decalage + i * 60 - 90) * Math.PI) / 180;
    pts.push(`${i ? 'L' : 'M'}${(C + Math.cos(a) * rayon).toFixed(2)} ${(C + Math.sin(a) * rayon).toFixed(2)}`);
  }
  return `${pts.join('')}Z`;
}

function etoile(branches: number, ext: number, int: number) {
  const pts: string[] = [];
  const pas = 360 / branches;
  for (let i = 0; i < branches; i += 1) {
    for (const [angle, r] of [
      [i * pas, ext],
      [i * pas + pas / 2, int],
    ] as const) {
      const a = ((angle - 90) * Math.PI) / 180;
      pts.push(`${pts.length ? 'L' : 'M'}${(C + Math.cos(a) * r).toFixed(2)} ${(C + Math.sin(a) * r).toFixed(2)}`);
    }
  }
  return `${pts.join('')}Z`;
}

interface Dessin {
  /** Le bras répété six fois (ou douze), en trait. */
  bras?: string;
  branches?: number;
  /** Le cœur, en aplat dégradé. */
  coeur?: string;
  /** Une plaque intérieure, en trait fin. */
  plaque?: string;
  /** Des perles au bout des bras. */
  perles?: number;
  /** Opacité du halo, zéro pour rien. */
  halo: number;
  epaisseur: number;
}

const DESSINS: Record<Rarity, Dessin> = {
  C: { coeur: hexagone(9), plaque: hexagone(4.8), halo: 0, epaisseur: 1.4 },
  R: {
    bras: bras(13, [
      { a: 6.5, l: 3.4 },
      { a: 10, l: 3.6 },
    ]),
    branches: 6,
    coeur: hexagone(4.2),
    plaque: hexagone(7, 30),
    halo: 0,
    epaisseur: 1.5,
  },
  UR: {
    bras: bras(
      13.4,
      [
        { a: 6, l: 3.2 },
        { a: 9.5, l: 3.8 },
      ],
      true,
    ),
    branches: 6,
    coeur: hexagone(4.6),
    perles: 13.4,
    halo: 0.5,
    epaisseur: 1.5,
  },
  L: {
    bras: bras(13.8, [{ a: 8, l: 3.4 }]),
    branches: 12,
    coeur: etoile(6, 6.2, 3.4),
    plaque: hexagone(8.6, 30),
    perles: 13.8,
    halo: 0.65,
    epaisseur: 1.4,
  },
};

export function RarityIcon({ rarity, taille = 18 }: { rarity: string; taille?: number | string }) {
  const cle = (rarity in DESSINS ? rarity : 'C') as Rarity;
  const d = DESSINS[cle];
  const meta = RARITY_META[cle];
  const idCoeur = `flocon-coeur-${cle}`;
  const idHalo = `flocon-halo-${cle}`;
  const branches = d.branches ?? 6;
  const pas = 360 / branches;

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={idCoeur} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor={meta.color} stopOpacity="0.95" />
          <stop offset="1" stopColor={meta.deep} />
        </radialGradient>
        {d.halo > 0 && (
          <filter id={idHalo} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        )}
      </defs>

      {/* Le halo : le flocon lui-même, flouté, derrière. */}
      {d.halo > 0 && d.bras && (
        <g filter={`url(#${idHalo})`} opacity={d.halo} stroke={meta.color} strokeWidth={3} strokeLinecap="round">
          {Array.from({ length: branches }, (_, i) => (
            <path key={i} d={d.bras} transform={`rotate(${i * pas} ${C} ${C})`} />
          ))}
        </g>
      )}

      {/* Les bras : trait sombre, trait de couleur, arête blanche. */}
      {d.bras &&
        (
          [
            [meta.deep, d.epaisseur + 1.6, 0.9],
            [meta.color, d.epaisseur, 1],
            ['#ffffff', Math.max(0.5, d.epaisseur - 0.9), 0.85],
          ] as const
        ).map(([couleur, largeur, opacite], k) => (
          <g key={k} stroke={couleur} strokeWidth={largeur} strokeOpacity={opacite} strokeLinecap="round" strokeLinejoin="round">
            {Array.from({ length: branches }, (_, i) => (
              <path key={i} d={d.bras} transform={`rotate(${i * pas} ${C} ${C})`} />
            ))}
          </g>
        ))}

      {/* Les perles au bout des bras. */}
      {d.perles &&
        Array.from({ length: branches }, (_, i) => {
          const a = ((i * pas - 90) * Math.PI) / 180;
          return (
            <circle
              key={i}
              cx={(C + Math.cos(a) * d.perles!).toFixed(2)}
              cy={(C + Math.sin(a) * d.perles!).toFixed(2)}
              r={cle === 'L' && i % 2 ? 0.9 : 1.3}
              fill="#ffffff"
              stroke={meta.color}
              strokeWidth={0.6}
            />
          );
        })}

      {/* La plaque intérieure, en trait fin. */}
      {d.plaque && (
        <path d={d.plaque} stroke="#ffffff" strokeWidth={0.7} strokeOpacity={0.7} fill={meta.color} fillOpacity={0.18} />
      )}

      {/* Le cœur, en glace de la couleur de rareté. */}
      {d.coeur && (
        <>
          <path d={d.coeur} fill={meta.deep} transform={`translate(0.4 0.6)`} opacity={0.8} />
          <path d={d.coeur} fill={`url(#${idCoeur})`} stroke="#ffffff" strokeWidth={0.7} strokeOpacity={0.85} />
        </>
      )}
    </svg>
  );
}
