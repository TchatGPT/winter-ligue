// Le pavage de glace du menu : un diagramme de Voronoï écrit en SVG statique,
// une fois pour toutes. Rien n'est calculé au runtime.
//
//   node scripts/facettes.mjs
//
// écrit public/fond/facettes.svg (la colonne, 272 × 900) et
// public/fond/facettes-mobile.svg (le tiroir).
//
// D'après la référence — des plaques de glace qui se chevauchent, vues de
// près : des faces sombres et profondes, quelques plaques laiteuses très
// claires, des arêtes épaisses qui attrapent la lumière, des stries fines
// dans l'épaisseur de chaque plaque, et des fissures qui courent d'une
// plaque à l'autre. Ce que fait le script, dans l'ordre :
//
//  - il sème les germes en Poisson dans un espace écrasé verticalement : les
//    plaques ressortent allongées, la colonne est haute et étroite ;
//  - il découpe chaque cellule par les médiatrices, en notant les voisines ;
//  - il répartit les tons — un quart de sombres, une moitié de moyennes, un
//    quart de claires, jamais deux claires voisines ;
//  - chaque plaque reçoit son dégradé orienté (son inclinaison), puis, dans
//    son contour : des stries parallèles à un angle propre, et pour les
//    claires un cœur laiteux ;
//  - sur les arêtes qui regardent la lumière (haut-gauche), une bande claire
//    de huit à quatorze pixels qui s'éteint vers l'intérieur : la tranche
//    épaisse de la plaque ;
//  - un trait d'arête partout, doublé de blanc sur les claires ;
//  - six fissures qui traversent plusieurs plaques.
import { writeFileSync } from 'node:fs';

function tirage(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(w, h, n, dmin, rnd) {
  const pts = [];
  let essais = 0;
  while (pts.length < n && essais < 20000) {
    essais += 1;
    const p = [rnd() * w, rnd() * h];
    if (pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= dmin)) pts.push(p);
  }
  return pts;
}

function decoupe(poly, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const f = (p) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out = [];
  let coupe = false;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) out.push(p);
    if (fp <= 0 !== fq <= 0) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      coupe = true;
    }
  }
  return { poly: out, coupe };
}

function voronoi(pts, w, h) {
  const cellules = [];
  const voisins = pts.map(() => new Set());
  for (let i = 0; i < pts.length; i += 1) {
    let poly = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    for (let j = 0; j < pts.length; j += 1) {
      if (i === j) continue;
      const r = decoupe(poly, pts[i], pts[j]);
      poly = r.poly;
      if (r.coupe) voisins[i].add(j);
    }
    cellules.push(poly);
  }
  for (let i = 0; i < pts.length; i += 1) for (const j of voisins[i]) if (!voisins[j].has(i)) voisins[i].delete(j);
  return { cellules, voisins };
}

const TONS = {
  sombre: ['#08182a', '#11263c'],
  moyen: ['#1a3650', '#2a4d6c'],
  clair: ['#6f9dc2', '#b9d6ea'],
};

function repartit(n, voisins, rnd, interdit) {
  const tons = new Array(n).fill('moyen');
  const ordre = [...Array(n).keys()].sort(() => rnd() - 0.5);
  let clairs = 0;
  for (const i of ordre) {
    if (clairs >= Math.round(n * 0.25)) break;
    // jamais de plaque claire derrière un libellé : la colonne des textes,
    // sur la moitié haute, reste sombre
    if (interdit(i)) continue;
    if ([...voisins[i]].some((j) => tons[j] === 'clair')) continue;
    tons[i] = 'clair';
    clairs += 1;
  }
  let sombres = 0;
  for (const i of ordre) {
    if (sombres >= Math.round(n * 0.25)) break;
    if (tons[i] !== 'moyen') continue;
    tons[i] = 'sombre';
    sombres += 1;
  }
  return tons;
}

const f = (v) => v.toFixed(1);
const LUMIERE = [-0.6, -0.8]; // la lumière vient du haut-gauche

/** Le sens de parcours d'un polygone, pour orienter ses normales. */
function aire(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

function pavage({ w, h, n, dmin, graine, etire, fichier, fissures }) {
  const rnd = tirage(graine);
  const hh = h / etire;
  const pts = poisson(w, hh, n, dmin, rnd);
  const { cellules, voisins } = voronoi(pts, w, hh);
  const tons = repartit(pts.length, voisins, rnd, (i) => {
    const cell = cellules[i];
    const cx = cell.reduce((s, p) => s + p[0], 0) / cell.length;
    const cy = (cell.reduce((s, p) => s + p[1], 0) / cell.length) * etire;
    return cx < w * 0.68 && cy < h * 0.58;
  });
  const defs = [];
  const fonds = [];
  const stries = [];
  const tranches = [];
  const aretes = [];

  cellules.forEach((cell, i) => {
    const poly = cell.map(([x, y]) => [x, y * etire]);
    const points = poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
    const ton = tons[i];
    const [c1, c2] = TONS[ton];
    const [d1, d2] = rnd() < 0.5 ? [c1, c2] : [c2, c1];
    const angle = Math.round(rnd() * 180);
    defs.push(
      `<linearGradient id="f${i}" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0" stop-color="${d1}"/><stop offset="1" stop-color="${d2}"/></linearGradient>`,
    );
    defs.push(`<clipPath id="c${i}"><polygon points="${points}"/></clipPath>`);
    fonds.push(`<polygon points="${points}" fill="url(#f${i})"/>`);

    // la boîte de la plaque, pour les stries
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const diag = Math.hypot(x1 - x0, y1 - y0);

    // le cœur laiteux des claires : un halo blanc décentré
    if (ton === 'clair') {
      defs.push(
        `<radialGradient id="l${i}" cx="${(0.3 + rnd() * 0.4).toFixed(2)}" cy="${(0.3 + rnd() * 0.4).toFixed(2)}" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.3"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/></radialGradient>`,
      );
      fonds.push(`<polygon points="${points}" fill="url(#l${i})"/>`);
    }

    // les stries : des traits parallèles, à l'angle propre de la plaque,
    // interrompus, plus marqués sur les claires
    const th = rnd() * Math.PI;
    const ux = Math.cos(th);
    const uy = Math.sin(th);
    const vx = -uy;
    const vy = ux;
    const pas = 5 + rnd() * 8;
    const force = ton === 'clair' ? 0.22 : ton === 'moyen' ? 0.11 : 0.07;
    const traits = [];
    for (let d = -diag / 2; d <= diag / 2; d += pas) {
      // un trait par bande, coupé en deux ou trois morceaux
      let t = -diag / 2;
      while (t < diag / 2) {
        const l = 10 + rnd() * 60;
        const trou = 4 + rnd() * 30;
        const ax = cx + vx * d + ux * t;
        const ay = cy + vy * d + uy * t;
        const bx = cx + vx * d + ux * Math.min(t + l, diag / 2);
        const by = cy + vy * d + uy * Math.min(t + l, diag / 2);
        traits.push(`M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}`);
        t += l + trou;
      }
    }
    stries.push(`<path d="${traits.join('')}" clip-path="url(#c${i})" fill="none" stroke="#e6f3ff" stroke-opacity="${force}" stroke-width="1"/>`);

    // les tranches : sur les arêtes qui regardent la lumière, une bande claire
    // qui s'éteint vers l'intérieur
    const sens = aire(poly) > 0 ? 1 : -1;
    for (let e = 0; e < poly.length; e += 1) {
      const p = poly[e];
      const q = poly[(e + 1) % poly.length];
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const l = Math.hypot(ex, ey);
      if (l < 12) continue;
      // normale intérieure
      let nx = (ey / l) * sens;
      let ny = (-ex / l) * sens;
      // normale extérieure = -intérieure ; elle regarde la lumière si son
      // produit scalaire avec la direction de la lumière est positif
      const vers = -nx * LUMIERE[0] + -ny * LUMIERE[1];
      if (vers < 0.25) continue;
      const larg = 12 + rnd() * 12;
      const k = tranches.length;
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      // la tranche : blanc franc sur l'arête, qui fond vite dans la plaque.
      // Dans la zone des libellés, elle reste discrète : rien de clair ne
      // doit passer derrière un mot.
      const zoneTexte = mx < w * 0.68 && my < h * 0.58;
      const att = zoneTexte ? 0.3 : 1;
      defs.push(
        `<linearGradient id="t${k}" gradientUnits="userSpaceOnUse" x1="${f(mx)}" y1="${f(my)}" x2="${f(mx + nx * larg)}" y2="${f(my + ny * larg)}"><stop offset="0" stop-color="#ffffff" stop-opacity="${((0.55 + vers * 0.35) * att).toFixed(2)}"/><stop offset="0.35" stop-color="#e8f4ff" stop-opacity="${((0.2 + vers * 0.15) * att).toFixed(2)}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
      );
      tranches.push(
        `<polygon points="${f(p[0])},${f(p[1])} ${f(q[0])},${f(q[1])} ${f(q[0] + nx * larg)},${f(q[1] + ny * larg)} ${f(p[0] + nx * larg)},${f(p[1] + ny * larg)}" fill="url(#t${k})" clip-path="url(#c${i})"/>`,
      );
    }

    // les arêtes
    aretes.push(`<polygon points="${points}" fill="none" stroke="rgba(200,230,255,0.28)" stroke-width="1" stroke-linejoin="round"/>`);
    if (ton === 'clair') {
      aretes.push(`<polygon points="${points}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-linejoin="round" transform="translate(0 1)"/>`);
    }
  });

  // les fissures : des lignes brisées qui traversent plusieurs plaques, vives
  // au centre, éteintes aux bouts, doublées d'un trait sombre
  const lignes = [];
  for (let k = 0; k < fissures; k += 1) {
    let x = rnd() * w;
    let y = rnd() * h;
    let ang = rnd() * Math.PI * 2;
    const seg = 3 + Math.floor(rnd() * 4);
    const pts2 = [[x, y]];
    for (let s = 0; s < seg; s += 1) {
      ang += (rnd() - 0.5) * 1.1;
      const l = 40 + rnd() * 110;
      x += Math.cos(ang) * l;
      y += Math.sin(ang) * l;
      pts2.push([x, y]);
    }
    const d = pts2.map(([px, py], j) => `${j ? 'L' : 'M'}${f(px)} ${f(py)}`).join('');
    const a0 = pts2[0];
    const a1 = pts2[pts2.length - 1];
    defs.push(
      `<linearGradient id="q${k}" gradientUnits="userSpaceOnUse" x1="${f(a0[0])}" y1="${f(a0[1])}" x2="${f(a1[0])}" y2="${f(a1[1])}"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
    );
    lignes.push(`<path d="${d}" fill="none" stroke="#04122a" stroke-opacity="0.6" stroke-width="1.2" transform="translate(0.6 1)"/>`);
    lignes.push(`<path d="${d}" fill="none" stroke="url(#q${k})" stroke-width="1"/>`);
  }

  // les nappes : trois grandes plaques translucides qui chevauchent plusieurs
  // cellules, à peine plus claires, avec une arête vive — c'est le
  // chevauchement des feuilles de glace de la référence
  const nappes = [];
  for (let k = 0; k < 3; k += 1) {
    // les nappes vivent dans la moitié basse et sur le flanc droit, hors de
    // la zone des libellés
    const cx = w * 0.45 + rnd() * w * 0.55;
    const cy = h * 0.5 + rnd() * h * 0.5;
    const nb = 5 + Math.floor(rnd() * 3);
    const pts3 = [];
    for (let s = 0; s < nb; s += 1) {
      const a = (s / nb) * Math.PI * 2 + rnd() * 0.5;
      const r = (90 + rnd() * 160) * (0.7 + rnd() * 0.6);
      pts3.push([cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 1.6]);
    }
    const points = pts3.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
    const angle = Math.round(rnd() * 180);
    defs.push(
      `<linearGradient id="n${k}" gradientTransform="rotate(${angle} 0.5 0.5)"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/></linearGradient>`,
    );
    nappes.push(`<polygon points="${points}" fill="url(#n${k})" stroke="rgba(255,255,255,0.45)" stroke-width="1.2" stroke-linejoin="round"/>`);
    nappes.push(`<polygon points="${points}" fill="none" stroke="rgba(4,18,42,0.5)" stroke-width="1" stroke-linejoin="round" transform="translate(0 1.5)"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs.join('')}</defs>${fonds.join('')}${stries.join('')}${tranches.join('')}${aretes.join('')}${nappes.join('')}${lignes.join('')}</svg>`;
  writeFileSync(fichier, svg);
  console.log(fichier, pts.length, 'plaques,', tons.filter((t) => t === 'clair').length, 'claires,', Math.round(svg.length / 1024), 'ko');
}

pavage({ w: 272, h: 900, n: 22, dmin: 62, graine: 11, etire: 2, fichier: 'public/fond/facettes.svg', fissures: 6 });
pavage({ w: 400, h: 480, n: 11, dmin: 80, graine: 5, etire: 1.4, fichier: 'public/fond/facettes-mobile.svg', fissures: 3 });
