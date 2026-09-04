/**
 * De la neige accumulée sur l'arête haute d'un container.
 *
 * ## Ce qui fait que ça a l'air tombé là, et pas collé dessus
 *
 *  - **La géométrie.** La neige est un enfant du container, calée sur son
 *    bord haut, et *découpée* par le même rayon que lui : dans les coins elle
 *    suit l'arc et s'arrête à la tangente. Elle ne peut pas déborder sur les
 *    côtés — elle est physiquement dedans.
 *  - **L'épaisseur.** Épaisse là où le bord est horizontal, avec un petit
 *    bourrelet à l'épaule de chaque coin — la neige s'y accumule avant de
 *    glisser — puis de plus en plus fine sur la pente jusqu'à disparaître.
 *  - **La couleur.** Jamais de blanc plein. Un dégradé du haut, presque blanc,
 *    vers une sous-face bleutée : la neige a toujours son ombre dessous. Et une
 *    ombre de contact de trois pixels sous la ligne où elle touche le verre.
 *    Sans elle, n'importe quelle neige flotte.
 *  - **La silhouette.** Une seule courbe, en Bézier, à l'amplitude irrégulière :
 *    quelques bosses hautes, des plats, et une seule coulée qui descend plus bas
 *    que le reste. Pas de stalactites : de la neige fraîche n'en a pas.
 *
 * Tout est tiré d'une graine : deux containers n'ont pas la même neige, et un
 * même container garde la sienne d'un rendu à l'autre.
 *
 * Composant serveur, sans état — un SVG et rien d'autre.
 */

/** Largeur de dessin. La hauteur, elle, est en pixels réels. */
const LARGEUR = 1000;

/** Un tirage déterministe (mulberry32) : même graine, même neige. */
function tirage(graine: string | number) {
  let h = 1779033703 ^ String(graine).length;
  for (const c of String(graine)) {
    h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * La ligne de la neige, en points, puis lissée en Bézier (Catmull-Rom).
 *
 * Renvoie la silhouette ouverte, de gauche à droite.
 */
function silhouette(graine: string | number, epaisseur: number) {
  const rnd = tirage(graine);
  const entre = (a: number, b: number) => a + (b - a) * rnd();

  // Une dizaine de points, à des abscisses irrégulières.
  const n = 10 + Math.floor(rnd() * 4);
  const xs: number[] = [0];
  for (let i = 1; i < n - 1; i += 1) xs.push((i / (n - 1)) * LARGEUR + entre(-28, 28));
  xs.push(LARGEUR);
  // L'épaule tout près du bord : la neige retombe vite à rien, en quelques
  // dizaines de pixels, au lieu de s'effiler en lame le long de l'arc du coin.
  xs[1] = 26 + entre(0, 10);
  xs[n - 2] = LARGEUR - 26 - entre(0, 10);

  // La coulée : un seul point qui descend franchement plus bas.
  const coulee = 2 + Math.floor(rnd() * (n - 4));
  // Deux zones presque plates, hors coulée.
  const plats = new Set<number>();
  while (plats.size < 2) {
    const p = 1 + Math.floor(rnd() * (n - 2));
    if (Math.abs(p - coulee) > 1) plats.add(p);
  }

  const ys: number[] = xs.map((_, i) => {
    // Aux extrémités : rien du tout. La neige a glissé de la pente, et la
    // silhouette rejoint le bord avant le coin — un filet qui courrait le long
    // de l'arc se lirait comme un débord, même découpé au pixel près.
    if (i === 0 || i === n - 1) return 0;
    // À l'épaule : le bourrelet, là où elle s'accumule avant la pente.
    if (i === 1 || i === n - 2) return epaisseur * entre(0.5, 0.66);
    if (i === coulee) return epaisseur * 1.0;
    if (plats.has(i)) return epaisseur * entre(0.4, 0.48);
    return epaisseur * entre(0.32, 0.78);
  });
  // Un plat est deux points de suite à la même hauteur.
  for (const p of plats) if (p + 1 < n - 1 && p + 1 !== coulee) ys[p + 1] = ys[p] + entre(-1, 1);

  // Catmull-Rom → Bézier cubique, pour une seule courbe continue.
  const pt = (i: number) => ({ x: xs[Math.max(0, Math.min(n - 1, i))], y: ys[Math.max(0, Math.min(n - 1, i))] });
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pt(i - 1);
    const p1 = pt(i);
    const p2 = pt(i + 1);
    const p3 = pt(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return { ligne: d, finY: ys[n - 1] };
}

export function SnowCap({
  radius,
  seed,
  epaisseur = 22,
}: {
  /** Le rayon du container, tel quel : `52`, `'var(--r-xl)'`… La neige est découpée par lui. */
  radius: string | number;
  /** Deux containers, deux graines, deux silhouettes. */
  seed: string | number;
  /** Épaisseur maximale de la neige, en pixels. */
  epaisseur?: number;
}) {
  const { ligne, finY } = silhouette(seed, epaisseur);
  // Le corps : la silhouette fermée par le bord haut.
  const corps = `${ligne} L ${LARGEUR} 0 L 0 0 Z`;
  // De la marge sous la neige pour l'ombre de contact.
  const hauteur = epaisseur + 8;
  const id = `neige-${String(seed).replace(/[^a-z0-9]/gi, '')}`;
  const rayon = typeof radius === 'number' ? `${radius}px` : radius;

  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        // Un pixel en retrait du bord, avec un rayon concentrique : le lissage
        // du bord découpé reste **dans** le biseau au lieu de baver dessus.
        // C'est ce pixel qui séparait « posée dedans » de « qui dépasse ».
        top: 1,
        left: 1,
        right: 1,
        // Au moins aussi haut que le rayon. Un rayon plus grand que la boîte
        // est réduit par le navigateur pour tenir dedans — sur une bande de
        // 34 px, un coin de 50 px devenait un coin de 34 px, et la neige
        // débordait de l'arc du container de sept pixels sans qu'aucune valeur
        // calculée ne le dise.
        height: `max(${hauteur}px, ${rayon})`,
        overflow: 'hidden',
        borderTopLeftRadius: `calc(${rayon} - 2px)`,
        borderTopRightRadius: `calc(${rayon} - 2px)`,
        // `overflow: hidden` seul ne suffit pas : le filtre de flou du liseré
        // fait composer le SVG à part, et Chrome ne lui applique alors qu'un
        // rectangle — la neige filait jusqu'au coin. `clip-path` s'applique
        // aussi aux calques composés.
        clipPath: `inset(0 round calc(${rayon} - 2px) calc(${rayon} - 2px) 0 0)`,
        pointerEvents: 'none',
        zIndex: 4,
      }}
    >
      <svg
        width="100%"
        height={hauteur}
        viewBox={`0 0 ${LARGEUR} ${hauteur}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        <defs>
          {/* Du haut presque blanc vers une sous-face froide : la neige a une ombre dessous. */}
          <linearGradient id={`${id}-corps`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fafcff" />
            <stop offset="0.55" stopColor="#e6eef9" />
            <stop offset="1" stopColor="#c8d6e8" />
          </linearGradient>
          {/* L'ombre de contact, très courte, qui s'éteint en trois pixels. */}
          <linearGradient id={`${id}-ombre`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#071427" stopOpacity="0.55" />
            <stop offset="1" stopColor="#071427" stopOpacity="0.55" />
          </linearGradient>
          <filter id={`${id}-flou`} x="-2%" y="-20%" width="104%" height="140%">
            <feGaussianBlur stdDeviation="1" />
          </filter>
          {/* Aux deux bouts, l'ombre et le liseré s'éteignent : décalés de
              trois pixels, ils dépasseraient de la pointe de la neige et
              saliraient le coin. */}
          <linearGradient id={`${id}-bouts`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" />
            <stop offset="0.035" stopColor="#fff" />
            <stop offset="0.965" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <mask id={`${id}-masque`} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill={`url(#${id}-bouts)`} />
          </mask>
        </defs>

        {/* L'ombre de contact : le même corps, décalé de trois pixels sous la neige. */}
        <g transform="translate(0 3)" opacity="0.7" mask={`url(#${id}-masque)`}>
          <path d={corps} fill={`url(#${id}-ombre)`} vectorEffect="non-scaling-stroke" />
        </g>

        {/* La neige. */}
        <path d={corps} fill={`url(#${id}-corps)`} />

        {/* Le liseré haut, flouté d'un pixel pour casser le bord vectoriel : la
            seule chose floue ici. */}
        <path
          d={`${ligne} L ${LARGEUR} ${finY.toFixed(1)}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeOpacity="0.85"
          vectorEffect="non-scaling-stroke"
          filter={`url(#${id}-flou)`}
          mask={`url(#${id}-masque)`}
        />
      </svg>
    </span>
  );
}
