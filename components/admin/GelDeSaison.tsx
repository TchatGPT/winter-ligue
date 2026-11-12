'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { sonCraque, sonExplosion, sonGivre } from '@/components/sonsDuel';
import type { ParametresSaison } from '@/lib/domain/rules';

/**
 * Le changement de saison, à l'écran (Modération → Subs & saison, décidé le
 * 12/11/2026) : le site gèle, devient un bloc de glace, se fissure, et vole en
 * éclats — derrière, la ligue repart de zéro.
 *
 * La page ne bouge pas : c'est une **photographie** de la page — ses nœuds
 * clonés, inertes — qui gèle, se fige en bloc, puis se découpe en éclats. La
 * vraie page reste dessous, cachée, et se recharge pendant ce temps
 * (`router.refresh()`) ; quand le bloc explose, c'est elle qui apparaît,
 * remise à zéro. Les éclats suivent les fissures : ce sont les mêmes lignes.
 *
 * Le serveur décide seul : l'animation attend sa réponse avant d'exploser. Un
 * refus fait fondre la glace, et la page reste ce qu'elle était.
 */

export interface BilanVu {
  joueurs: number;
  supprimees: { games: number; boosters: number; cartes: number; duels: number };
}

type Phase = 'gel' | 'glacon' | 'fissure' | 'explosion' | 'titre' | 'degel';

/** Les réglages d'une saison, en une ligne. */
export function resumeSaison(s: ParametresSaison): string {
  return [
    `${s.games} games`,
    `Booster Finisseur à la ${s.finisseurA}ᵉ`,
    s.uneParSessionApres !== null ? `puis une game par session` : null,
    s.finalistes > 0 ? `finale à ${s.finalistes}` : 'pas de finale',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** « Saison 1 · Mini Ligue » → « Saison 1 », « Mini Ligue ». */
export function nomCourt(s: ParametresSaison): [string, string | null] {
  const [nom, sous] = s.nom.split(' · ');
  return [nom, sous ?? null];
}

/* ------------------------------ La géométrie ------------------------------ */

type Pt = [number, number];

interface Fissure {
  d: string;
  /** Quand elle court, en millisecondes après l'impact. */
  delai: number;
  duree: number;
}

interface Eclat {
  poly: Pt[];
  centre: Pt;
  /** Sa distance à l'impact, de 0 à 1. */
  loin: number;
}

interface Geometrie {
  w: number;
  h: number;
  impact: Pt;
  fissures: Fissure[];
  eclats: Eclat[];
  fougeres: { d: string; delai: number }[];
}

const hasard = (a: number, b: number) => a + Math.random() * (b - a);

/** Le milieu de [a, b], écarté de sa ligne : une fissure n'est jamais droite. */
function devie(a: Pt, b: Pt, ampleur = 0.22): Pt {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const k = hasard(-ampleur, ampleur);
  return [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
}

const chemin = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/**
 * Les fissures, et les éclats qu'elles découpent : des rayons partis de
 * l'impact, deux anneaux qui les relient, et une fissure de plus au milieu de
 * chaque grand éclat du bord. Chaque éclat est bordé par des fissures tracées.
 */
function geometrie(w: number, h: number): Geometrie {
  const k = w < 700 ? 5 : 6;
  const coupe = w >= 700;
  const impact: Pt = [w * hasard(0.42, 0.58), h * hasard(0.4, 0.56)];
  const m = Math.min(w, h);
  const loin = Math.hypot(w, h) * 3;
  const depart = hasard(0, Math.PI * 2);
  const angles = Array.from({ length: k }, (_, i) => depart + ((i + hasard(-0.28, 0.28)) * Math.PI * 2) / k);
  const au = (a: number, r: number): Pt => [impact[0] + Math.cos(a) * r, impact[1] + Math.sin(a) * r];

  const rayons = angles.map((a) => {
    const I = au(a + hasard(-0.12, 0.12), m * hasard(0.1, 0.16));
    const M = au(a + hasard(-0.1, 0.1), m * hasard(0.32, 0.42));
    const J = au(a + hasard(-0.06, 0.06), m * hasard(0.66, 0.8));
    const O = au(a, loin);
    return [impact, devie(impact, I), I, devie(I, M), M, J, O] as Pt[];
  });
  const suivant = (i: number) => (i + 1) % k;
  const interieurs = rayons.map((r, i) => devie(r[2], rayons[suivant(i)][2], 0.18));
  const milieux = rayons.map((r, i) => devie(r[4], rayons[suivant(i)][4], 0.16));
  // La fissure qui coupe chaque grand éclat du bord en deux.
  const secondaires = angles.map((a, i) => {
    const b = i + 1 < k ? angles[i + 1] : angles[0] + Math.PI * 2;
    const milieu = (a + b) / 2 + hasard(-0.08, 0.08);
    const s = milieux[i];
    return [s, devie(s, au(milieu, m * 0.9), 0.12), au(milieu, loin)] as Pt[];
  });

  const fissures: Fissure[] = [];
  rayons.forEach((r, i) => {
    fissures.push({ d: chemin(r.slice(0, 5)), delai: i * 45, duree: 200 });
    fissures.push({ d: chemin(r.slice(4)), delai: 380 + i * 50, duree: 260 });
  });
  interieurs.forEach((q, i) =>
    fissures.push({ d: chemin([rayons[i][2], q, rayons[suivant(i)][2]]), delai: 230 + i * 35, duree: 160 }),
  );
  milieux.forEach((s, i) =>
    fissures.push({ d: chemin([rayons[i][4], s, rayons[suivant(i)][4]]), delai: 620 + i * 40, duree: 200 }),
  );
  if (coupe) secondaires.forEach((s, i) => fissures.push({ d: chemin(s), delai: 860 + i * 45, duree: 240 }));

  const diagonale = Math.hypot(w, h);
  const borne = ([x, y]: Pt): Pt => [Math.min(w, Math.max(0, x)), Math.min(h, Math.max(0, y))];
  const eclat = (poly: Pt[]): Eclat => {
    const dedans = poly.map(borne);
    const centre: Pt = [
      dedans.reduce((s, p) => s + p[0], 0) / dedans.length,
      dedans.reduce((s, p) => s + p[1], 0) / dedans.length,
    ];
    return { poly, centre, loin: Math.hypot(centre[0] - impact[0], centre[1] - impact[1]) / diagonale };
  };
  const eclats: Eclat[] = [];
  rayons.forEach((r, i) => {
    const n = rayons[suivant(i)];
    const [q, s, sec] = [interieurs[i], milieux[i], secondaires[i]];
    eclats.push(eclat([impact, r[1], r[2], q, n[2], n[1]]));
    eclats.push(eclat([r[2], r[3], r[4], s, n[4], n[3], n[2], q]));
    if (coupe) {
      eclats.push(eclat([r[4], r[5], r[6], sec[2], sec[1], s]));
      eclats.push(eclat([s, sec[1], sec[2], n[6], n[5], n[4]]));
    } else {
      eclats.push(eclat([r[4], r[5], r[6], n[6], n[5], n[4], s]));
    }
  });

  return { w, h, impact, fissures, eclats, fougeres: fougeres(w, h) };
}

/**
 * Le givre qui pousse depuis les bords : des cristaux à branches de soixante
 * degrés, comme sur une vitre en hiver. Un chemin par génération de branches,
 * pour qu'elles poussent l'une après l'autre.
 */
function fougeres(w: number, h: number): { d: string; delai: number }[] {
  const germes: { p: Pt; a: number }[] = [
    { p: [0, 0], a: Math.PI / 4 },
    { p: [w, 0], a: (Math.PI * 3) / 4 },
    { p: [w, h], a: (-Math.PI * 3) / 4 },
    { p: [0, h], a: -Math.PI / 4 },
    { p: [w * hasard(0.25, 0.4), 0], a: Math.PI / 2 },
    { p: [w * hasard(0.6, 0.75), h], a: -Math.PI / 2 },
    { p: [0, h * hasard(0.35, 0.6)], a: 0 },
    { p: [w, h * hasard(0.4, 0.65)], a: Math.PI },
  ];
  const generations: string[][] = [[], [], []];
  const pousse = (p: Pt, a: number, l: number, g: number) => {
    if (g > 2 || l < 8) return;
    const pas = 5;
    let point = p;
    const traits: Pt[] = [p];
    for (let i = 1; i <= pas; i += 1) {
      const dir = a + hasard(-0.08, 0.08);
      point = [point[0] + (Math.cos(dir) * l) / pas, point[1] + (Math.sin(dir) * l) / pas];
      traits.push(point);
      if (i < pas && Math.random() < 0.85) {
        const cote = i % 2 ? 1 : -1;
        pousse(point, a + (cote * Math.PI) / 3, l * hasard(0.28, 0.42) * (1 - i / (pas + 2)), g + 1);
      }
    }
    generations[g].push(chemin(traits));
  };
  const taille = Math.min(w, h);
  for (const { p, a } of germes) pousse(p, a + hasard(-0.2, 0.2), taille * hasard(0.22, 0.36), 0);
  return generations.map((d, g) => ({ d: d.join(''), delai: g * 700 }));
}

/**
 * La texture du givre, rendue une fois en image : un voile, des plaques plus
 * fines, et des paillettes. Recopiée dans chaque éclat, une image ne coûte
 * rien ; un filtre SVG se recalculerait autant de fois qu'il y a d'éclats. La
 * teinte est celle du site (`--frost`), lue au moment de la dessiner.
 */
function textureDuGivre(w: number, h: number): Promise<string | null> {
  const teinte = getComputedStyle(document.documentElement).getPropertyValue('--frost').trim();
  if (!teinte) return Promise.resolve(null);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<filter id="g" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="4" result="a"/>
<feColorMatrix in="a" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 -0.05" result="voile"/>
<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="5" seed="9" result="b"/>
<feColorMatrix in="b" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -0.98" result="plaques"/>
<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="3" result="c"/>
<feColorMatrix in="c" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 -5.7" result="paillettes"/>
<feMerge result="m"><feMergeNode in="voile"/><feMergeNode in="plaques"/><feMergeNode in="paillettes"/></feMerge>
<feFlood flood-color="${teinte}"/>
<feComposite in2="m" operator="in"/>
</filter>
<rect width="100%" height="100%" filter="url(#g)"/>
</svg>`;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const toile = document.createElement('canvas');
        toile.width = w;
        toile.height = h;
        toile.getContext('2d')?.drawImage(image, 0, 0);
        toile.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/png');
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/* ------------------------------ La photographie ------------------------------ */

/** Une copie inerte d'un nœud, ses dessins de canevas compris. */
function copie<T extends Element>(source: T): T {
  const clone = source.cloneNode(true) as T;
  const avant = source.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((c, i) => {
    try {
      c.getContext('2d')?.drawImage(avant[i], 0, 0);
    } catch {
      // Un canevas WebGL ne se recopie pas : il reste vide, sous le givre.
    }
  });
  clone.querySelectorAll('video, iframe, audio').forEach((n) => n.remove());
  return clone;
}

/** La page telle qu'elle est à l'écran, en copie inerte. */
function photographie(vers: HTMLElement) {
  vers.className = `gel-page ${document.body.className}`;
  for (const enfant of Array.from(document.body.children)) {
    if (enfant.classList.contains('gel-scene') || ['SCRIPT', 'NEXT-ROUTE-ANNOUNCER', 'NEXTJS-PORTAL'].includes(enfant.tagName))
      continue;
    vers.appendChild(copie(enfant));
  }
  vers.setAttribute('inert', '');
}

/* ------------------------------ La scène ------------------------------ */

const DUREE_GEL = 2800;
const DUREE_GLACON = 1800;
/** Le temps des fissures, avant l'explosion : la réponse du serveur est attendue au-delà. */
const DUREE_FISSURE = 1500;
const DUREE_ECLATS = 1100;
/** Les éclats se préparent pendant que le bloc se fige : à l'explosion, il n'y a plus qu'à les montrer. */
const PREPARE_ECLATS = DUREE_GEL + 1200;

export function GelDeSaison({
  saison,
  retour,
  requete,
  onFin,
}: {
  saison: ParametresSaison;
  /** On revient à une saison d'avant : « Retour en Saison 1 ». */
  retour: boolean;
  requete: Promise<BilanVu | null>;
  onFin: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('gel');
  const [bilan, setBilan] = useState<BilanVu | null>(null);
  const [geo, setGeo] = useState<Geometrie | null>(null);
  const [givre, setGivre] = useState<string | null>(null);
  const [prepare, setPrepare] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const blocRef = useRef<HTMLDivElement>(null);
  const eclatsRef = useRef<HTMLDivElement>(null);
  const rappel = useRef(onFin);
  useEffect(() => {
    rappel.current = onFin;
  }, [onFin]);

  // La photographie, avant la première image : la page n'a pas le temps de bouger.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    if (pageRef.current) photographie(pageRef.current);
    setGeo(geometrie(w, h));
    let image: string | null = null;
    let fini = false;
    void textureDuGivre(w, h).then((u) => {
      image = u;
      if (fini && u) URL.revokeObjectURL(u);
      else setGivre(u);
    });
    const racine = document.documentElement;
    racine.dataset.gel = 'fige';
    return () => {
      fini = true;
      if (image) URL.revokeObjectURL(image);
      delete racine.dataset.gel;
    };
  }, []);

  useEffect(() => {
    let fini = false;
    const minuteurs: number[] = [];
    const plus = (ms: number, f: () => void) => minuteurs.push(window.setTimeout(f, ms));
    const doux = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fond = () => {
      setPhase('degel');
      document.documentElement.dataset.gel = 'eclat';
      plus(600, () => rappel.current());
    };

    if (doux) {
      void requete.then((b) => {
        if (fini) return;
        if (!b) return fond();
        setBilan(b);
        document.documentElement.dataset.gel = 'eclat';
        setPhase('titre');
      });
      return () => {
        fini = true;
        minuteurs.forEach((t) => window.clearTimeout(t));
      };
    }

    sonGivre((DUREE_GEL + DUREE_GLACON) / 1000);
    plus(DUREE_GEL, () => setPhase('glacon'));
    plus(PREPARE_ECLATS, () => setPrepare(true));
    plus(DUREE_GEL + DUREE_GLACON, () => {
      setPhase('fissure');
      [0, 230, 380, 620, 860].forEach((t, i) => plus(t, () => sonCraque(0.6 + i * 0.12)));
    });
    const auPlusTot = new Promise((r) => plus(DUREE_GEL + DUREE_GLACON + DUREE_FISSURE, () => r(null)));
    void requete.then((b) => {
      if (fini) return;
      // Refusé : la glace fond tout de suite, la page reste ce qu'elle était.
      if (!b) return fond();
      setBilan(b);
      void auPlusTot.then(() => {
        if (fini) return;
        sonExplosion();
        document.documentElement.dataset.gel = 'eclat';
        setPhase('explosion');
        plus(DUREE_ECLATS, () => setPhase('titre'));
      });
    });
    return () => {
      fini = true;
      minuteurs.forEach((t) => window.clearTimeout(t));
    };
  }, [requete]);

  // Les éclats : le bloc, recopié une fois par éclat, chacun découpé le long de
  // ses fissures. Préparés cachés, ils s'envolent à l'explosion.
  useLayoutEffect(() => {
    if (!prepare || !geo || !blocRef.current || !eclatsRef.current) return;
    const bloc = blocRef.current;
    const conteneur = eclatsRef.current;
    const [cx, cy] = [geo.w / 2, geo.h / 2];
    const diagonale = Math.hypot(geo.w, geo.h);
    const lot = document.createDocumentFragment();
    for (const e of geo.eclats) {
      const [dx, dy] = [e.centre[0] - geo.impact[0], e.centre[1] - geo.impact[1]];
      const d = Math.hypot(dx, dy) || 1;
      const elan = diagonale * hasard(0.45, 0.85) * (1.15 - e.loin * 0.5);
      const vol = document.createElement('div');
      vol.className = 'gel-eclat';
      const style: Record<string, string> = {
        '--ox': `${cx + (e.centre[0] - cx) * 0.8}px`,
        '--oy': `${cy + (e.centre[1] - cy) * 0.8}px`,
        '--tx': `${((dx / d) * elan).toFixed(0)}px`,
        '--ty': `${((dy / d) * elan + geo.h * hasard(0.15, 0.4)).toFixed(0)}px`,
        '--tz': `${hasard(-500, 700).toFixed(0)}px`,
        '--rx': `${hasard(-110, 110).toFixed(0)}deg`,
        '--ry': `${hasard(-110, 110).toFixed(0)}deg`,
        '--rz': `${hasard(-200, 200).toFixed(0)}deg`,
        '--d': `${Math.round(e.loin * 140)}ms`,
      };
      for (const [cle, valeur] of Object.entries(style)) vol.style.setProperty(cle, valeur);
      const morceau = copie(bloc);
      morceau.style.clipPath = `polygon(${e.poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
      vol.appendChild(morceau);
      lot.appendChild(vol);
    }
    conteneur.replaceChildren(lot);
  }, [prepare, geo]);

  // Échap ferme la carte de fin ; les éclats retombés quittent la page.
  useEffect(() => {
    if (phase !== 'titre') return;
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && rappel.current();
    window.addEventListener('keydown', touche);
    const menage = window.setTimeout(() => eclatsRef.current?.replaceChildren(), 900);
    return () => {
      window.removeEventListener('keydown', touche);
      window.clearTimeout(menage);
    };
  }, [phase]);

  const poussiere = useMemo(
    () =>
      Array.from({ length: 46 }, () => {
        const a = hasard(0, Math.PI * 2);
        const r = hasard(180, 900);
        return {
          '--px': `${(Math.cos(a) * r).toFixed(0)}px`,
          '--py': `${(Math.sin(a) * r + hasard(60, 320)).toFixed(0)}px`,
          '--pr': `${hasard(-540, 540).toFixed(0)}deg`,
          '--pt': `${hasard(5, 16).toFixed(0)}px`,
          '--pd': `${hasard(0.8, 1.6).toFixed(2)}s`,
        } as CSSProperties;
      }),
    [],
  );

  if (typeof document === 'undefined') return null;
  const [nom, sous] = nomCourt(saison);
  const impactEcran = geo
    ? { left: geo.w / 2 + (geo.impact[0] - geo.w / 2) * 0.8, top: geo.h / 2 + (geo.impact[1] - geo.h / 2) * 0.8 }
    : undefined;

  return createPortal(
    <div
      className="gel-scene"
      data-phase={phase}
      style={geo ? ({ '--gel-w': `${geo.w}px`, '--gel-h': `${geo.h}px` } as CSSProperties) : undefined}
    >
      <p className="sr-only" role="status">
        {phase === 'titre' ? `${saison.nom} lancée.` : phase === 'degel' ? '' : `Passage en ${saison.nom}…`}
      </p>
      <div className="gel-fond" aria-hidden="true" />
      <div className="gel-secousse" aria-hidden="true">
        <div className="gel-bloc" ref={blocRef}>
          <div ref={pageRef} />
          <div className="gel-teinte" />
          <div className="gel-givre" style={givre ? { backgroundImage: `url(${givre})` } : undefined} />
          {geo && (
            <svg className="gel-fougeres" viewBox={`0 0 ${geo.w} ${geo.h}`} preserveAspectRatio="none">
              {geo.fougeres.map((f, i) => (
                <path key={i} d={f.d} pathLength={1} style={{ ['--d' as string]: `${f.delai}ms` }} />
              ))}
            </svg>
          )}
          {geo && (
            <svg className="gel-fissures" viewBox={`0 0 ${geo.w} ${geo.h}`} preserveAspectRatio="none">
              {geo.fissures.map((f, i) => (
                <g key={i} style={{ ['--d' as string]: `${f.delai}ms`, ['--t' as string]: `${f.duree}ms` }}>
                  <path className="gel-fissure-ombre" d={f.d} pathLength={1} />
                  <path className="gel-fissure" d={f.d} pathLength={1} />
                </g>
              ))}
            </svg>
          )}
          <div className="gel-reflet" />
        </div>
      </div>
      <div className="gel-eclats" ref={eclatsRef} aria-hidden="true" />
      {(phase === 'explosion' || phase === 'titre') && (
        <>
          <div className="gel-poussiere" style={impactEcran} aria-hidden="true">
            {poussiere.map((s, i) => (
              <i key={i} style={s} />
            ))}
          </div>
          <div className="gel-flash" aria-hidden="true" />
        </>
      )}
      {phase === 'titre' && (
        <div className="gel-titre">
          <div className="gel-voile" onClick={() => rappel.current()} aria-hidden="true" />
          <div className="gel-carte" role="dialog" aria-modal="true" aria-labelledby="gel-nom">
            <p className="gel-surtitre">{retour ? 'Retour en arrière' : 'Nouvelle saison'}</p>
            <h2 id="gel-nom" className="gel-nom" aria-label={saison.nom}>
              {Array.from(nom).map((c, i) => (
                <span key={i} style={{ ['--i' as string]: i }} aria-hidden="true">
                  {c === ' ' ? ' ' : c}
                </span>
              ))}
            </h2>
            {sous && <p className="gel-sous">{sous}</p>}
            <p className="gel-regle">{resumeSaison(saison)}</p>
            {bilan && (
              <ul className="gel-bilan">
                <li>
                  <b className="num">{bilan.joueurs}</b> joueur{bilan.joueurs > 1 ? 's' : ''} repartent de 0 ❄, avec
                  leurs 3 Jokers
                </li>
                <li>
                  <b className="num">{bilan.supprimees.games}</b> game{bilan.supprimees.games > 1 ? 's' : ''} effacée
                  {bilan.supprimees.games > 1 ? 's' : ''}
                </li>
                <li>
                  <b className="num">{bilan.supprimees.boosters}</b> booster{bilan.supprimees.boosters > 1 ? 's' : ''}
                  {' et '}
                  <b className="num">{bilan.supprimees.cartes}</b> carte{bilan.supprimees.cartes > 1 ? 's' : ''}
                  {' effacés'}
                </li>
                <li>Subs, évènements, duels et codes : remis à zéro</li>
              </ul>
            )}
            <button type="button" className="btn btn-ice" autoFocus onClick={() => rappel.current()}>
              C’est parti
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
