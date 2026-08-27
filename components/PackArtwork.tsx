import Image from 'next/image';

/**
 * L'impression d'un sachet de booster.
 *
 * Deux régimes, selon qu'une planche peinte est fournie ou non.
 *
 * **Avec planche** — elle est posée bord à bord et rien ne vient dessus. Une
 * planche de sachet est livrée composée : filet, sceau de rareté et
 * sertissages y sont déjà peints.
 *
 * **Sans planche** — un décor vectoriel prend le relais, teinté aux couleurs du
 * booster : cadre ciselé, nom de la série en haut, mention d'édition en bas et
 * titre répété verticalement sur les montants. Il se rend côté serveur, reste
 * net à toutes les tailles et ne pèse rien, ce qui permet de livrer les quatre
 * illustrations au fil de l'eau sans jamais montrer un sachet vide.
 */

/**
 * Le repère du décor vectoriel.
 *
 * Il doit garder le ratio de la face du sachet (1:1,75, voir `BoosterPack3D`) :
 * le SVG est tracé en `preserveAspectRatio="none"`, donc tout écart entre les
 * deux se paie en étirement du massif et du cadre.
 */
const W = 200;
const H = 350;

/** Marges du cadre, à l'intérieur des sertissages. */
const PAD = 9;

export interface PackArtworkProps {
  name: string;
  cardCount: number;
  /** Les deux teintes du booster : aurore et ciel profond. */
  tint: [string, string];
  /** Décale le bruit et les astres, pour que le dos diffère de la face. */
  variant?: number;
  /**
   * Illustration peinte. Quand elle existe, elle remplace le décor vectoriel :
   * le cadre ciselé et les textes, eux, restent en SVG pour rester nets et
   * identiques d'un sachet à l'autre.
   */
  art?: string | null;
}

/**
 * Étoiles réparties de façon déterministe : même rendu serveur et client, donc
 * aucune erreur d'hydratation.
 *
 * La suite R2 (Roberts) et non deux multiples du nombre d'or : dériver x et y
 * du même index avec des constantes proches les rend corrélés, et les étoiles
 * s'alignent alors sur une diagonale bien visible. R2 est justement construite
 * pour couvrir un plan sans motif apparent.
 */
const R2_X = 0.7548776662466927;
const R2_Y = 0.5698402909980532;

function stars(seed: number) {
  return Array.from({ length: 40 }, (_, i) => {
    const n = i + seed * 17 + 1;
    const a = (0.5 + R2_X * n) % 1;
    const b = (0.5 + R2_Y * n) % 1;
    return {
      x: 18 + a * (W - 36),
      y: 30 + b * 158,
      r: 0.45 + ((i * 7) % 5) * 0.2,
      o: 0.3 + ((i * 3) % 6) * 0.12,
    };
  });
}

/**
 * Le décor vectoriel : ciel, aurore, massif, lac, refuge.
 *
 * Sert de repli tant qu'aucune illustration peinte n'est fournie. Il se teinte
 * avec les couleurs du booster, donc les quatre sachets se lisent d'emblée
 * comme une gamme.
 */
function VectorScene({ uid, aurora, variant }: { uid: string; aurora: string; variant: number }) {
  return (
    <>
      <rect x="0" y="0" width={W} height={H} fill={`url(#${uid}-ciel)`} />
        {stars(variant * 5 + 1).map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#eaf6ff" opacity={s.o} />
        ))}

        {/* Deux voiles d'aurore, flous, qui descendent en biais. */}
        {/* Les rubans sont fins et se recoupent : une aurore est faite de
            draperies, pas d'une nappe uniforme. */}
        <g filter={`url(#${uid}-flou)`} opacity="0.9">
          <path
            d={
              variant === 0
                ? 'M-10,34 C36,8 66,74 106,48 C142,26 164,84 200,52 L200,92 C162,124 138,68 108,90 C70,118 38,60 -10,84 Z'
                : 'M-10,52 C28,22 74,88 112,58 C148,32 170,88 200,62 L200,102 C170,132 138,78 104,100 C64,126 24,72 -10,102 Z'
            }
            fill={`url(#${uid}-voile)`}
          />
          <path
            d={
              variant === 0
                ? 'M-10,96 C32,72 60,128 102,102 C138,80 166,130 200,108 L200,142 C164,166 130,124 98,142 C58,164 26,132 -10,142 Z'
                : 'M-10,112 C26,88 66,142 98,118 C134,92 164,140 200,116 L200,152 C162,176 122,138 90,156 C54,176 22,148 -10,158 Z'
            }
            fill={`url(#${uid}-voile2)`}
          />
          <path
            d={
              variant === 0
                ? 'M-10,66 C40,46 74,102 118,80 C152,62 174,104 200,86 L200,110 C170,130 142,92 112,110 C74,132 34,96 -10,112 Z'
                : 'M-10,80 C34,58 78,116 116,92 C150,72 176,116 200,96 L200,120 C166,142 130,106 96,124 C58,144 20,114 -10,126 Z'
            }
            fill={`url(#${uid}-voile2)`}
            opacity="0.55"
          />
        </g>

        {/* Les contreforts, en retrait. */}
        <path
          d={`M-6,${H * 0.62} L34,${H * 0.5} L66,${H * 0.6} L96,${H * 0.47} L128,${H * 0.58} L162,${H * 0.5} L${W + 6},${H * 0.6} L${W + 6},${H} L-6,${H} Z`}
          fill="#12233c"
          opacity="0.85"
        />

        {/* Le sommet dominant, décalé — une pyramide centrée fait décor. */}
        <path
          d={`M-6,${H * 0.66} L28,${H * 0.58} L58,${H * 0.63} L86,${H * 0.43} L118,${H * 0.6} L150,${H * 0.53} L${W + 6},${H * 0.63} L${W + 6},${H} L-6,${H} Z`}
          fill={`url(#${uid}-mont)`}
        />

        {/* Le névé, accroché juste sous le sommet. */}
        <path
          d={`M86,${H * 0.43} L98,${H * 0.5} L92,${H * 0.505} L86,${H * 0.545} L79,${H * 0.5} L74,${H * 0.505} Z`}
          fill="#e8f4ff"
          opacity="0.82"
        />

        {/* Le lac, et le reflet de l'aurore dessus. */}
        <rect x="-6" y={H * 0.72} width={W + 12} height={H * 0.28} fill={`url(#${uid}-lac)`} />
        <g filter={`url(#${uid}-flou-doux)`} opacity="0.4">
          <path
            d={`M20,${H * 0.75} L${W - 20},${H * 0.75} L${W - 34},${H * 0.79} L34,${H * 0.79} Z`}
            fill={aurora}
          />
        </g>

        {/* Le refuge éclairé : le seul point chaud de l'image, et c'est lui
            qui donne l'échelle du massif. */}
        <g>
          <circle cx={W * 0.72} cy={H * 0.7} r="7" fill="#ffb648" opacity="0.28" filter={`url(#${uid}-flou-doux)`} />
          <path
            d={`M${W * 0.72 - 4},${H * 0.71} L${W * 0.72},${H * 0.685} L${W * 0.72 + 4},${H * 0.71} Z`}
            fill="#ffc978"
          />
        </g>
    </>
  );
}

export function PackArtwork({ name, cardCount, tint, variant = 0, art }: PackArtworkProps) {
  const [aurora, deep] = tint;
  const uid = `pk${variant}-${name.replace(/[^a-zA-Z]/g, '')}`;

  /**
   * Sachet illustré : la planche EST l'impression, on ne dessine rien dessus.
   *
   * C'est l'inverse de la règle des cartes, et pour une raison concrète : une
   * carte est un gabarit répété 24 fois, donc son cadre doit être en code pour
   * rester rigoureusement identique. Un sachet, lui, arrive déjà composé — son
   * filet, son sceau de rareté et ses sertissages sont peints dedans, calés sur
   * l'illustration. Reposer le cadre ciselé par-dessus doublerait le filet et
   * masquerait le sceau.
   *
   * `object-cover` plutôt que `fill` : si une planche arrive avec un ratio un
   * peu différent du sachet, mieux vaut la recadrer que déformer un visage.
   */
  if (art) {
    return (
      <Image
        src={art}
        alt=""
        aria-hidden="true"
        draggable={false}
        fill
        sizes="260px"
        className="pointer-events-none select-none object-cover"
        priority
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Le ciel : nuit profonde en haut, horizon plus clair. */}
        <linearGradient id={`${uid}-ciel`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#05091a" />
          <stop offset="45%" stopColor={deep} />
          <stop offset="100%" stopColor="#0a1730" />
        </linearGradient>

        {/* Les voiles d'aurore, dans la teinte du booster. */}
        <linearGradient id={`${uid}-voile`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={aurora} stopOpacity="0" />
          <stop offset="35%" stopColor={aurora} stopOpacity="0.95" />
          <stop offset="70%" stopColor="#8ff5d0" stopOpacity="0.6" />
          <stop offset="100%" stopColor={aurora} stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${uid}-voile2`} x1="0.2" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7de3ff" stopOpacity="0" />
          <stop offset="45%" stopColor="#7de3ff" stopOpacity="0.7" />
          <stop offset="100%" stopColor={aurora} stopOpacity="0" />
        </linearGradient>

        {/* Le massif : sombre au pied, éclairé au sommet par l'aurore. */}
        <linearGradient id={`${uid}-mont`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#4a6b92" />
          <stop offset="35%" stopColor="#1c3352" />
          <stop offset="100%" stopColor="#070f1f" />
        </linearGradient>

        <linearGradient id={`${uid}-lac`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={aurora} stopOpacity="0.32" />
          <stop offset="60%" stopColor="#0a1730" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#04091a" />
        </linearGradient>

        {/* Le foil du cadre : un argent qui varie, jamais un gris plat. */}
        <linearGradient id={`${uid}-argent`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="30%" stopColor="#b9cfe4" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#8fa9c4" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#e8f2ff" stopOpacity="0.9" />
        </linearGradient>

        <filter id={`${uid}-flou`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.6" />
        </filter>

        <filter id={`${uid}-flou-doux`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>

        {/* La fenêtre d'illustration, arrondie comme sur un vrai sachet. */}
        <clipPath id={`${uid}-fenetre`}>
          <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} rx="9" />
        </clipPath>
      </defs>

      {/* ------------------------- L'illustration ------------------------- */}
      <g clipPath={`url(#${uid}-fenetre)`}>
        {art ? (
          <image
            href={art}
            x="0"
            y="0"
            width={W}
            height={H}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <VectorScene uid={uid} aurora={aurora} variant={variant} />
        )}

      </g>

      {/* ---------------------------- Le cadre ---------------------------- */}
      <g fill="none" stroke={`url(#${uid}-argent)`}>
        <rect x={PAD} y={PAD} width={W - PAD * 2} height={H - PAD * 2} rx="9" strokeWidth="1.6" />
        <rect
          x={PAD + 4}
          y={PAD + 4}
          width={W - (PAD + 4) * 2}
          height={H - (PAD + 4) * 2}
          rx="6"
          strokeWidth="0.7"
          opacity="0.65"
        />
      </g>

      {/* Volutes d'angle : le détail qui fait « édition soignée ». */}
      <g fill="none" stroke={`url(#${uid}-argent)`} strokeWidth="1.1" strokeLinecap="round">
        {[
          { x: PAD + 5, y: PAD + 5, sx: 1, sy: 1 },
          { x: W - PAD - 5, y: PAD + 5, sx: -1, sy: 1 },
          { x: PAD + 5, y: H - PAD - 5, sx: 1, sy: -1 },
          { x: W - PAD - 5, y: H - PAD - 5, sx: -1, sy: -1 },
        ].map((c, i) => (
          <g key={i} transform={`translate(${c.x},${c.y}) scale(${c.sx},${c.sy})`}>
            <path d="M0,16 C0,7 7,0 16,0" />
            <path d="M3,20 C3,10 10,3 20,3" opacity="0.55" />
            <path d="M6,15 C6,10 10,6 15,6 C12,9 9,12 6,15 Z" fill={`url(#${uid}-argent)`} stroke="none" opacity="0.5" />
          </g>
        ))}
      </g>

      {/* ---------------------------- Les textes -------------------------- */}
      <text
        x={W / 2}
        y={PAD + 17}
        textAnchor="middle"
        fill="#eaf4ff"
        fontSize="7.5"
        letterSpacing="2.4"
        fontWeight="600"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {`WINTER LIGUE · ${name.toUpperCase()}`}
      </text>

      <text
        x={W / 2}
        y={H - PAD - 11}
        textAnchor="middle"
        fill="#eaf4ff"
        fontSize="8.5"
        letterSpacing="3"
        fontWeight="600"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {`${cardCount} CARTES`}
      </text>

      {/* Le titre répété sur les montants, comme sur un vrai sachet. */}
      {[
        { x: PAD + 12, rotate: -90, anchor: 'middle' as const },
        { x: W - PAD - 12, rotate: 90, anchor: 'middle' as const },
      ].map((side, i) => (
        <text
          key={i}
          transform={`translate(${side.x},${H / 2}) rotate(${side.rotate})`}
          textAnchor={side.anchor}
          fill="#cfe2f5"
          fontSize="6.5"
          letterSpacing="2.6"
          fontWeight="500"
          opacity="0.75"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {`${name.toUpperCase()} PACK`}
        </text>
      ))}
    </svg>
  );
}
