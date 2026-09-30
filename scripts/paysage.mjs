// Le décor du site : une nuit d'hiver, écrite en SVG statique une fois pour
// toutes. Rien n'est calculé au runtime, et rien n'y bouge.
//
//   node scripts/paysage.mjs
//
// écrit dans public/fond/ trois plans, du fond vers l'avant :
//
//  - etoiles.svg : le champ d'étoiles, une tuile de 1600 × 900 qui se répète —
//    de la poussière, des étoiles, et quelques brillantes à quatre branches ;
//  - aurore.svg : les rideaux de l'aurore boréale (1600 × 800). Chaque rideau
//    suit une courbe ; tout du long, des rais verticaux partent de la lisière
//    basse, vive et verte, et s'éteignent en montant vers le violet.
//    L'intensité des rais varie vite (les stries), leur hauteur lentement (la
//    houle), et le grand rideau se replie sur lui-même au milieu du ciel. Un
//    flou étroit adoucit les rais, un flou large fait le halo ;
//  - montagnes.svg : deux chaînes (la lointaine, pâle, et la grande), une nappe
//    de brume au pied de chacune, puis trois rangs de congères arrondies
//    (3200 × 1000). Chaque pic a sa face à la lumière et sa face à l'ombre,
//    séparées par une arête, et une calotte de neige qui descend en larges
//    langues entre les rochers. L'image se raccorde bord à bord : sur un écran
//    très large, elle se répète sans couture.
//
// Le ciel lui-même, le dégradé de la nuit vers l'horizon, est en CSS : voir
// « LE DÉCOR » dans app/globals.css. Graines fixes : les fichiers ne changent
// pas d'une génération à l'autre.
import { writeFileSync } from 'node:fs';

const DOSSIER = new URL('../public/fond/', import.meta.url);

function tirage(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une coordonnée : un chiffre après la virgule au plus. */
const n = (v) => String(Math.round(v * 10) / 10 || 0);
/** Une opacité, bornée : deux chiffres. */
const o = (v) => String(Math.round(Math.min(1, Math.max(0, v)) * 100) / 100);
const entre = (rnd, a, b) => a + rnd() * (b - a);
const lisse = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const trace = (pts, ferme = true) =>
  'M' + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L') + (ferme ? 'Z' : '');
const svg = (w, h, defs, corps) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${corps}</svg>\n`;
/** Un dégradé vertical ; `montant` le fait partir du bas. */
const degrade = (id, arrets, montant = false) =>
  `<linearGradient id="${id}" x1="0" y1="${montant ? 1 : 0}" x2="0" y2="${montant ? 0 : 1}">` +
  arrets.map(([t, c, a = 1]) => `<stop offset="${t}" stop-color="${c}" stop-opacity="${a}"/>`).join('') +
  '</linearGradient>';

/** Un bruit de valeurs lissé, à une dimension, sur quelques octaves. */
function bruit(rnd) {
  const N = 1024;
  const v = Array.from({ length: N }, () => rnd() * 2 - 1);
  const un = (x) => {
    const i = Math.floor(x);
    const t = x - i;
    const a = v[((i % N) + N) % N];
    const b = v[(((i + 1) % N) + N) % N];
    return a + (b - a) * t * t * (3 - 2 * t);
  };
  return (x, octaves = 3) => {
    let s = 0;
    let amp = 1;
    let fr = 1;
    let tot = 0;
    for (let k = 0; k < octaves; k += 1) {
      s += amp * un(x * fr + k * 37.1);
      tot += amp;
      amp /= 2;
      fr *= 2.03;
    }
    return s / tot;
  };
}

/** Un segment brisé : déplacement du point milieu, perpendiculairement. */
function brise(a, b, ampl, prof, rnd) {
  if (prof === 0) return [a];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const d = (rnd() * 2 - 1) * ampl;
  const m = [(a[0] + b[0]) / 2 - (dy / L) * d, (a[1] + b[1]) / 2 + (dx / L) * d];
  return [...brise(a, m, ampl * 0.55, prof - 1, rnd), ...brise(m, b, ampl * 0.55, prof - 1, rnd)];
}

/** Une ligne brisée qui passe par des jalons, extrémités comprises. */
function ligne(jalons, rugosite, prof, rnd) {
  const out = [];
  for (let i = 0; i < jalons.length - 1; i += 1) {
    const [a, b] = [jalons[i], jalons[i + 1]];
    out.push(...brise(a, b, Math.hypot(b[0] - a[0], b[1] - a[1]) * rugosite, prof, rnd));
  }
  out.push(jalons[jalons.length - 1]);
  return out;
}

/** Une courbe lisse (Catmull-Rom) par des jalons. */
function courbe(jalons, parSegment) {
  const P = [jalons[0], ...jalons, jalons[jalons.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < parSegment; k += 1) {
      const t = k / parSegment;
      const c = (a, b, cc, d) =>
        0.5 * (2 * b + (cc - a) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (3 * b - a - 3 * cc + d) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(jalons[jalons.length - 1]);
  return out;
}

/** Des points posés à pas réguliers le long d'une ligne. */
function jalonne(pts, pas) {
  const out = [pts[0]];
  let reste = pas;
  for (let i = 1; i < pts.length; i += 1) {
    let [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    let d = Math.hypot(x1 - x0, y1 - y0);
    while (d >= reste) {
      x0 += ((x1 - x0) * reste) / d;
      y0 += ((y1 - y0) * reste) / d;
      out.push([x0, y0]);
      d = Math.hypot(x1 - x0, y1 - y0);
      reste = pas;
    }
    reste -= d;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Les étoiles
// ---------------------------------------------------------------------------
function etoiles() {
  const rnd = tirage(1207);
  const [W, H] = [1600, 900];
  const teinte = () => ['#ffffff', '#ffffff', '#e6f4ff', '#d2e8ff', '#fff4df'][Math.floor(rnd() * 5)];
  const place = (marge) => [entre(rnd, marge, W - marge), entre(rnd, marge, H - marge)];
  const c = [];
  // la poussière
  for (let i = 0; i < 320; i += 1) {
    const [x, y] = place(2);
    c.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(entre(rnd, 0.4, 0.75))}" fill="${teinte()}" opacity="${o(entre(rnd, 0.22, 0.6))}"/>`);
  }
  // les étoiles
  for (let i = 0; i < 64; i += 1) {
    const [x, y] = place(3);
    c.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(entre(rnd, 0.8, 1.3))}" fill="${teinte()}" opacity="${o(entre(rnd, 0.6, 0.95))}"/>`);
  }
  // les brillantes : un halo, quatre branches fines, un cœur
  for (let i = 0; i < 7; i += 1) {
    const [x, y] = place(16);
    const b = entre(rnd, 5, 9);
    const e = 0.55;
    c.push(
      `<circle cx="${n(x)}" cy="${n(y)}" r="${n(b)}" fill="url(#h)"/>` +
        `<path d="M${n(x - b)} ${n(y)}L${n(x)} ${n(y - e)}L${n(x + b)} ${n(y)}L${n(x)} ${n(y + e)}Z` +
        `M${n(x)} ${n(y - b)}L${n(x + e)} ${n(y)}L${n(x)} ${n(y + b)}L${n(x - e)} ${n(y)}Z" fill="#fff" opacity="0.85"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="1.3" fill="#fff"/>`,
    );
  }
  const halo =
    '<radialGradient id="h"><stop offset="0" stop-color="#e8f6ff" stop-opacity="0.5"/>' +
    '<stop offset="1" stop-color="#e8f6ff" stop-opacity="0"/></radialGradient>';
  return svg(W, H, halo, c.join(''));
}

// ---------------------------------------------------------------------------
// L'aurore
// ---------------------------------------------------------------------------
const RIDEAUX = [
  // la traîne lointaine, à gauche : elle passe derrière les montagnes
  {
    id: 'c',
    jalons: [[-80, 472], [140, 452], [360, 432], [560, 426], [730, 444]],
    haut: 130,
    pas: 4,
    force: 0.34,
    graine: 31,
    degrade: 'gc',
  },
  // le rideau haut, à droite, plus violet
  {
    id: 'b',
    jalons: [[760, 218], [980, 192], [1180, 166], [1380, 150], [1560, 126], [1700, 114]],
    haut: 180,
    pas: 3.5,
    force: 0.56,
    graine: 47,
    degrade: 'gb',
  },
  // le second voile du grand rideau, juste derrière lui
  {
    id: 'a2',
    jalons: [[-40, 322], [200, 306], [440, 262], [660, 226], [820, 214], [960, 236], [1140, 296], [1340, 246], [1540, 190], [1700, 166]],
    haut: 200,
    pas: 3.5,
    force: 0.34,
    graine: 59,
    degrade: 'ga',
  },
  // le grand rideau : il traverse le ciel en S et se replie au milieu
  {
    id: 'a',
    jalons: [[-60, 362], [180, 346], [420, 302], [640, 264], [790, 250], [880, 272], [860, 318], [930, 352], [1100, 338], [1320, 284], [1520, 228], [1680, 202]],
    haut: 250,
    pas: 2.6,
    force: 0.82,
    graine: 71,
    degrade: 'ga',
  },
];

function rais(r) {
  const rnd = tirage(r.graine);
  const houle = bruit(rnd);
  const stries = bruit(rnd);
  const souffle = bruit(rnd);
  const pts = jalonne(courbe(r.jalons, 30), r.pas);
  const out = [];
  pts.forEach(([x, y], k) => {
    const u = k / (pts.length - 1);
    // le rideau s'efface à ses deux bouts
    const bord = lisse(0, 0.12, u) * lisse(1, 0.88, u);
    const s = k * r.pas;
    // des rais de largeurs et de hauteurs inégales : pas de code-barres
    const w = r.pas * entre(rnd, 0.9, 2.2);
    const cx = x + entre(rnd, -0.5, 0.5) * r.pas;
    const pied = y + entre(rnd, -1.5, 1.5);
    const h = r.haut * (0.5 + 0.5 * (0.5 + 0.5 * houle(s / 170))) * (0.6 + 0.4 * bord) * entre(rnd, 0.82, 1.12);
    let a =
      r.force *
      bord *
      (0.45 + 0.55 * (0.5 + 0.5 * stries(s / 7))) *
      (0.7 + 0.3 * (0.5 + 0.5 * souffle(s / 400, 2)));
    if (rnd() < 0.04) a = Math.min(1, a * 1.5);
    if (a < 0.02) return;
    out.push(`<path d="M${n(cx - w / 2)} ${n(pied - h)}h${n(w)}v${n(h)}h${n(-w)}z" opacity="${o(a)}"/>`);
  });
  return out.join('');
}

function aurore() {
  const [W, H] = [1600, 800];
  const defs = [
    // la lisière basse presque blanche, le vert, puis le bleu, le violet et le rose qui s'éteignent
    degrade('ga', [[0, '#effff9', 0.9], [0.04, '#a8ffe0', 0.85], [0.12, '#63eec4', 0.7], [0.3, '#3fd8b8', 0.42], [0.5, '#45b8ea', 0.26], [0.72, '#8f7dff', 0.18], [0.9, '#c58cff', 0.07], [1, '#d68cff', 0]], true),
    degrade('gb', [[0, '#d9fff3', 0.7], [0.08, '#6cf0c9', 0.5], [0.3, '#52b8f0', 0.28], [0.6, '#a98cff', 0.2], [0.85, '#d08cff', 0.08], [1, '#d68cff', 0]], true),
    degrade('gc', [[0, '#dcfff4', 0.75], [0.06, '#63eec4', 0.55], [0.35, '#45bdf0', 0.28], [0.75, '#8f7dff', 0.1], [1, '#a98cff', 0]], true),
    '<filter id="halo" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>',
    '<filter id="doux" x="-2%" y="-10%" width="104%" height="120%"><feGaussianBlur stdDeviation="1.2 3.4"/></filter>',
    ...RIDEAUX.map((r) => `<g id="r${r.id}" fill="url(#${r.degrade})">${rais(r)}</g>`),
  ];
  const tous = RIDEAUX.map((r) => `<use href="#r${r.id}"/>`).join('');
  return svg(W, H, defs.join(''), `<g filter="url(#halo)" opacity="0.9">${tous}</g><g filter="url(#doux)">${tous}</g>`);
}

// ---------------------------------------------------------------------------
// Les montagnes et la neige
// ---------------------------------------------------------------------------
const MW = 3200;
const MH = 1000;

const CHAINES = [
  // la chaîne lointaine : plus haute à l'écran, pâle, noyée de brume à sa base
  {
    nom: 'loin',
    base: 760,
    graine: 11,
    prof: [0.24, 0.32],
    dents: 0.6,
    roche: [[0, '#34407f'], [1, '#2c3670']],
    ombre: [[0, '#2a326c'], [1, '#252c61']],
    neige: [[0, '#c3cdf2'], [1, '#9fabe0']],
    neigeOmbre: [[0, '#949fd6'], [1, '#8089c6']],
    pics: [
      { x: 300, y: 170, g: 520, d: 560 },
      { x: 1000, y: 150, g: 540, d: 500 },
      { x: 1450, y: 210, g: 380, d: 420 },
      { x: 2050, y: 140, g: 560, d: 540 },
      { x: 2650, y: 190, g: 480, d: 520 },
      { x: 3050, y: 230, g: 440, d: 460 },
    ],
    brume: { de: 400, a: 760, couleur: '#6f7fd8', force: 0.46 },
  },
  // la grande chaîne : un sommet qui domine, les faces franches, la neige vive
  {
    nom: 'grande',
    base: 880,
    graine: 23,
    prof: [0.3, 0.4],
    dents: 1,
    lisere: true,
    roche: [[0, '#30428a'], [1, '#223172']],
    ombre: [[0, '#222a66'], [1, '#1c2356']],
    // le haut des neiges prend un reflet vert d'aurore
    neige: [[0, '#effffa'], [0.3, '#e2eefe'], [1, '#b3c4f2']],
    neigeOmbre: [[0, '#aab4ea'], [1, '#7f8acb']],
    pics: [
      { x: 1640, y: 110, g: 760, d: 820 },
      { x: 2500, y: 290, g: 620, d: 600 },
      { x: 800, y: 270, g: 620, d: 600 },
      { x: 120, y: 360, g: 540, d: 520 },
      { x: 3080, y: 340, g: 540, d: 560 },
      { x: 1150, y: 450, g: 380, d: 360 },
      { x: 2150, y: 470, g: 380, d: 380 },
    ],
    brume: { de: 600, a: 880, couleur: '#6f80d8', force: 0.4 },
  },
];

/**
 * La lisière de la neige d'un pic : de larges langues qui descendent entre
 * les rochers, d'inégales longueurs, séparées par des creux — et toujours une
 * plus longue sur l'arête, où la neige tient le mieux. Puis un léger
 * déchirement de tout le tracé.
 */
function lisiereNeige(p, h, chaine, xArete, rnd) {
  const x0 = p.x - p.g - 30;
  const x1 = p.x + p.d + 30;
  const ys = p.y + h * entre(rnd, ...chaine.prof);
  const e = h / 600;
  const xa = xArete(ys);
  const jalons = [[x0, ys]];
  for (let x = x0; x < x1; ) {
    const larg = entre(rnd, 50, 120) * e;
    const surArete = xa > x && xa < x + larg;
    const pointe = surArete ? xa : x + larg * entre(rnd, 0.3, 0.7);
    const prof = h * chaine.dents * (surArete ? entre(rnd, 0.18, 0.3) : entre(rnd, 0.03, 0.18));
    jalons.push(
      [x + (pointe - x) * entre(rnd, 0.35, 0.6), ys + prof * entre(rnd, 0.15, 0.45)],
      [pointe, ys + prof],
      [pointe + (x + larg - pointe) * entre(rnd, 0.4, 0.65), ys + prof * entre(rnd, 0.1, 0.4)],
      [x + larg, ys - h * chaine.dents * entre(rnd, 0, 0.05)],
    );
    x += larg;
  }
  return ligne(jalons, 0.05, 2, rnd);
}

function montagnes() {
  const defs = [];
  const corps = [];
  let compte = 0;

  for (const chaine of CHAINES) {
    const rnd = tirage(chaine.graine);
    const k = chaine.nom;
    defs.push(
      degrade(`${k}-r`, chaine.roche),
      degrade(`${k}-o`, chaine.ombre),
      degrade(`${k}-n`, chaine.neige),
      degrade(`${k}-no`, chaine.neigeOmbre),
    );
    // les plus hauts d'abord : les plus bas passent devant eux
    for (const p of [...chaine.pics].sort((a, b) => a.y - b.y)) {
      const base = chaine.base;
      const h = base - p.y;
      const j = (a) => (rnd() * 2 - 1) * a;
      const gauche = ligne(
        [
          [p.x - p.g, base],
          [p.x - p.g * (0.55 + j(0.15)), base - h * (0.42 + j(0.12))],
          [p.x - p.g * (0.2 + j(0.1)), base - h * (0.79 + j(0.09))],
          [p.x, p.y],
        ],
        0.07,
        3,
        rnd,
      );
      const droite = ligne(
        [
          [p.x, p.y],
          [p.x + p.d * (0.2 + j(0.1)), base - h * (0.78 + j(0.09))],
          [p.x + p.d * (0.55 + j(0.15)), base - h * (0.42 + j(0.12))],
          [p.x + p.d, base],
        ],
        0.07,
        3,
        rnd,
      );
      const silhouette = [...gauche, ...droite.slice(1)];
      // l'arête : du sommet vers le pied, le plus souvent vers la droite —
      // la lumière vient de la gauche, la face éclairée est la plus large
      const pied = p.x + entre(rnd, 0.08, 0.38) * (rnd() < 0.8 ? p.d : -p.g);
      const arete = ligne(
        [
          [p.x, p.y],
          [p.x + (pied - p.x) * 0.28 + j(h * 0.03), p.y + h * 0.33],
          [p.x + (pied - p.x) * 0.64 + j(h * 0.03), p.y + h * 0.67],
          [pied, base],
        ],
        0.035,
        3,
        rnd,
      );
      const xArete = (y) => {
        for (let i = 1; i < arete.length; i += 1) {
          if (arete[i][1] >= y) {
            const [a, b] = [arete[i - 1], arete[i]];
            return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1] || 1);
          }
        }
        return pied;
      };
      // la face à l'ombre : tout ce qui est à droite de l'arête (découpé par la silhouette)
      const ombre = [[p.x, p.y - 40], ...arete, [p.x + p.d + 60, base + 10], [p.x + p.d + 60, p.y - 40]];
      const lisiere = lisiereNeige(p, h, chaine, xArete, rnd);
      const neige = [[lisiere[0][0], p.y - 30], [lisiere[lisiere.length - 1][0], p.y - 30], ...[...lisiere].reverse()];

      const id = `p${compte}`;
      compte += 1;
      const S = trace(silhouette);
      const N = trace(neige);
      defs.push(
        `<clipPath id="${id}s"><path d="${S}"/></clipPath>`,
        `<clipPath id="${id}o"><path d="${trace(ombre)}"/></clipPath>`,
        `<g id="${id}"><path d="${S}" fill="url(#${k}-r)"/><g clip-path="url(#${id}s)">` +
          `<path d="${trace(ombre)}" fill="url(#${k}-o)"/>` +
          `<path d="${N}" fill="url(#${k}-n)"/>` +
          `<path d="${N}" fill="url(#${k}-no)" clip-path="url(#${id}o)"/></g>` +
          // le liseré : le flanc gauche attrape la lumière près du sommet
          (chaine.lisere
            ? `<path d="${trace(gauche.slice(Math.floor(gauche.length * 0.55)), false)}" fill="none" stroke="#e2f7ff" stroke-opacity="0.5" stroke-width="1.6" stroke-linejoin="round"/>`
            : '') +
          '</g>',
      );
      // raccord bord à bord : un pic qui déborde est redessiné de l'autre côté
      corps.push(`<use href="#${id}"/>`);
      if (p.x - p.g < 0) corps.push(`<use href="#${id}" x="${MW}"/>`);
      if (p.x + p.d > MW) corps.push(`<use href="#${id}" x="${-MW}"/>`);
    }
    const b = chaine.brume;
    defs.push(degrade(`${k}-b`, [[0, b.couleur, 0], [1, b.couleur, b.force]]));
    corps.push(`<rect x="0" y="${b.de}" width="${MW}" height="${b.a - b.de}" fill="url(#${k}-b)"/>`);
  }

  // La neige au pied : trois rangs de congères arrondies. Chaque bosse est une
  // cloche, comptée modulo la largeur, pour que le bord droit retombe sur le
  // bord gauche.
  const CONGERES = [
    { y: 810, n: 7, amp: [40, 95], larg: [220, 460], teintes: [[0, '#b0beee'], [0.3, '#8494d2'], [1, '#5d6cb2']], eclat: 0.45, graine: 3 },
    { y: 890, n: 8, amp: [30, 75], larg: [180, 420], teintes: [[0, '#c3cff5'], [0.3, '#8b9ad6'], [1, '#56649f']], eclat: 0.55, graine: 5 },
    { y: 975, n: 6, amp: [30, 65], larg: [240, 520], teintes: [[0, '#cfdaf8'], [0.3, '#93a2da'], [1, '#4d5b9f']], eclat: 0.65, graine: 7 },
  ];
  defs.push(
    '<filter id="lueur" filterUnits="userSpaceOnUse" x="-100" y="0" width="3400" height="1000"><feGaussianBlur stdDeviation="7"/></filter>',
  );
  CONGERES.forEach((c, i) => {
    const rnd = tirage(c.graine);
    const bosses = Array.from({ length: c.n }, (_, q) => ({
      c: (q + 0.5) * (MW / c.n) + entre(rnd, -80, 80),
      a: entre(rnd, ...c.amp),
      w: entre(rnd, ...c.larg),
    }));
    const y = (x) =>
      c.y -
      bosses.reduce((s, b) => {
        let d = (((x - b.c) % MW) + MW) % MW;
        if (d > MW / 2) d -= MW;
        return s + b.a * Math.exp(-((d / b.w) ** 2));
      }, 0);
    const crete = [];
    for (let x = -16; x <= MW + 16; x += 16) crete.push([x, y(x)]);
    const forme = trace([...crete, [MW + 16, MH + 10], [-16, MH + 10]]);
    const ligneCrete = trace(crete, false);
    defs.push(degrade(`c${i}`, c.teintes), `<clipPath id="k${i}"><path d="${forme}"/></clipPath>`);
    corps.push(
      `<path d="${forme}" fill="url(#c${i})"/>`,
      // la lumière sur la crête : une bande claire et floue, gardée dans la congère
      `<path d="${ligneCrete}" fill="none" stroke="#eef4ff" stroke-opacity="0.35" stroke-width="22" filter="url(#lueur)" clip-path="url(#k${i})"/>`,
      `<path d="${ligneCrete}" fill="none" stroke="#f4f8ff" stroke-opacity="${c.eclat}" stroke-width="1.3" stroke-linejoin="round"/>`,
    );
    // les paillettes
    const p = [];
    for (let q = 0; q < 50 + i * 30; q += 1) {
      const x = entre(rnd, 4, MW - 4);
      p.push(`<circle cx="${n(x)}" cy="${n(y(x) + entre(rnd, 4, 50))}" r="${n(entre(rnd, 0.6, 1.3))}" opacity="${o(entre(rnd, 0.3, 0.85))}"/>`);
    }
    corps.push(`<g fill="#fff">${p.join('')}</g>`);
  });

  return svg(MW, MH, defs.join(''), corps.join(''));
}

for (const [fichier, contenu] of [
  ['etoiles.svg', etoiles()],
  ['aurore.svg', aurore()],
  ['montagnes.svg', montagnes()],
]) {
  writeFileSync(new URL(fichier, DOSSIER), contenu);
  console.log(fichier, Math.round(contenu.length / 1024), 'Kio');
}
