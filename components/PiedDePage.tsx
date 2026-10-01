import { IconClaude, IconSnowflake } from './icons';

/**
 * Le pied de page, sous chaque page du site — jamais sur un overlay du stream,
 * que la mise en page rend à part. Une bande sur toute la largeur, collée au
 * bas de la page comme le menu l'est au bord gauche : c'est le cadre du site,
 * pas un bloc de plus. La marque et les droits de la saison, et la signature
 * de ceux qui ont fait le site, avec le symbole de Claude.
 *
 * Sur la bande, de la neige : trois rangs de congères posés sur son arête
 * haute, du fond au premier plan — plus loin, la neige est plus bleue et plus
 * haute ; devant, presque blanche. Rien ne brille, et aucun trait ne la cerne
 * — une ligne de crête la faisait lire comme des vagues : la profondeur vient
 * de l'étagement, chaque rang plus clair en haut qu'en bas, et de l'ombre de
 * contact là où elle touche la bande. Tout est tiré d'une graine : la
 * silhouette ne change pas d'un rendu à l'autre.
 *
 * `barreMobile` : connecté, une barre de navigation flotte en bas de l'écran
 * des téléphones. La bande se prolonge dessous, et son contenu reste au-dessus.
 */

/** Largeur et hauteur de dessin de la neige. Étirée en largeur, jamais en hauteur. */
const LARGEUR = 1000;
const HAUTEUR = 160;

/** Un tirage déterministe (mulberry32) : même graine, même neige. */
function tirage(graine: string) {
  let h = 1779033703 ^ graine.length;
  for (const c of graine) {
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
 * Un rang de congères : des bosses larges et douces, de hauteur inégale, et
 * dissymétriques — le vent creuse un côté et charge l'autre, la crête n'est
 * jamais au milieu. Renvoie la forme fermée par le bas.
 */
function rang(graine: string, haut: [number, number], creux: [number, number], bosses: number) {
  const rnd = tirage(graine);
  const entre = ([a, b]: [number, number]) => a + (b - a) * rnd();
  const n = bosses * 2;
  const pas = LARGEUR / n;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x =
      i === 0 || i === n
        ? (i / n) * LARGEUR
        : // La crête glisse sous le vent, le creux reste à peu près en place.
          i * pas + (i % 2 === 1 ? entre([0.05, 0.4]) : entre([-0.15, 0.15])) * pas;
    const y = HAUTEUR - (i % 2 === 0 ? entre(creux) : entre(haut));
    return { x, y };
  });

  // Catmull-Rom → Bézier cubique, pour une seule courbe continue.
  const p = (i: number) => pts[Math.max(0, Math.min(n, i))];
  let crete = `M0 ${p(0).y.toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    crete += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return `${crete} L${LARGEUR} ${HAUTEUR} L0 ${HAUTEUR} Z`;
}

const RANGS = [
  { nom: 'fond', forme: rang('neige-fond', [118, 140], [92, 108], 3), haut: 'var(--neige-loin)', bas: 'var(--neige-ombre)' },
  { nom: 'milieu', forme: rang('neige-milieu', [92, 112], [66, 80], 4), haut: 'var(--neige-2)', bas: 'var(--neige-loin)' },
  { nom: 'devant', forme: rang('neige-devant', [62, 78], [44, 54], 5), haut: 'var(--neige-1)', bas: 'var(--neige-3)' },
];

export function PiedDePage({ barreMobile = false }: { barreMobile?: boolean }) {
  return (
    <footer className="pied-de-page" data-barre={barreMobile ? '' : undefined}>
      <div className="pied-de-neige" aria-hidden="true">
        <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} preserveAspectRatio="none">
          <defs>
            {RANGS.map((r) => (
              <linearGradient key={r.nom} id={`neige-sol-${r.nom}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: r.haut }} />
                <stop offset="1" style={{ stopColor: r.bas }} />
              </linearGradient>
            ))}
          </defs>
          {RANGS.map((r) => (
            <path key={r.nom} d={r.forme} fill={`url(#neige-sol-${r.nom})`} />
          ))}
        </svg>
      </div>
      <div className="pied-de-page-bande">
        <div className="pied-de-page-marque">
          <span className="menu-logo grid h-10 w-10 shrink-0 place-items-center" aria-hidden="true">
            <IconSnowflake className="h-5 w-5" />
          </span>
          <span>
            <span className="pied-de-page-nom">
              <span className="givre-texte">Winter</span> <em className="menu-titre-ligue">Ligue</em>
            </span>
            <span className="pied-de-page-droits">© 2026-2027 · Tous droits réservés</span>
          </span>
        </div>
        <p className="pied-de-page-credit">
          <span>
            Développé par <strong>Jeex3</strong> &amp; <strong>Claude</strong>
          </span>
          <span className="pied-de-page-claude" aria-hidden="true">
            <IconClaude />
          </span>
        </p>
      </div>
    </footer>
  );
}
