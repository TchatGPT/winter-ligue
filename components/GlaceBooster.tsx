'use client';

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CardFrame } from '@/components/CardFrame';
import { IconTwitch } from '@/components/icons';
import { LogoCristal } from '@/components/Logo';
import { RARITY_META, cartesDuPack } from '@/lib/domain/catalog';
import type { CardDefinition, PackId, Rarity } from '@/lib/domain/types';

/*
 * Les boosters pris dans la glace, sur l'accueil déconnecté (13/11/2026).
 *
 * Sur la page, chaque booster est enfermé dans un bloc de glace : une face
 * avant givrée sur les bords et claire au centre, traversée d'un reflet, avec
 * dedans quelques plans de fracture et des bulles d'air ; un dessus et un
 * côté pour l'épaisseur. Tout est tiré d'une graine : deux blocs ne se
 * ressemblent pas, et le serveur dessine le même que le navigateur.
 *
 * Un clic l'ouvre en grand (`EclatBooster`) : la glace se fend, deux fois,
 * puis éclate. Les éclats sont découpés dans la face selon les fissures
 * mêmes — ce qui part, c'est exactement ce qui s'est fendu. Le booster libéré,
 * trois de ses cartes en sortent et se retournent : un aperçu, pas le
 * contenu entier. Le reste se découvre une fois connecté.
 */

/** Un tirage déterministe (mulberry32) : même graine, même glace. */
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

type Point = { x: number; y: number };
const f = (n: number) => n.toFixed(2);

/**
 * L'intérieur d'un bloc : des plans de fracture partis d'un bord, qui
 * s'enfoncent en ligne brisée et se ramifient une fois, et des bulles d'air
 * en grappes. Coordonnées sur 100 × 100.
 */
function interieur(graine: string) {
  const rnd = tirage(graine);
  const entre = (a: number, b: number) => a + (b - a) * rnd();
  const fissures: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const bord = Math.floor(rnd() * 4);
    let p: Point =
      bord === 0
        ? { x: entre(10, 90), y: 0 }
        : bord === 1
          ? { x: 100, y: entre(10, 90) }
          : bord === 2
            ? { x: entre(10, 90), y: 100 }
            : { x: 0, y: entre(10, 90) };
    // Vers le centre, en biais.
    let angle = Math.atan2(50 - p.y, 50 - p.x) + entre(-0.6, 0.6);
    let d = `M${f(p.x)} ${f(p.y)}`;
    const segments = 3 + Math.floor(rnd() * 2);
    for (let s = 0; s < segments; s += 1) {
      angle += entre(-0.5, 0.5);
      const l = entre(7, 15);
      p = { x: p.x + Math.cos(angle) * l, y: p.y + Math.sin(angle) * l };
      d += ` L${f(p.x)} ${f(p.y)}`;
      if (s === 1) {
        const a2 = angle + (rnd() > 0.5 ? 1 : -1) * entre(0.6, 1.1);
        const l2 = entre(6, 11);
        d += ` M${f(p.x)} ${f(p.y)} L${f(p.x + Math.cos(a2) * l2)} ${f(p.y + Math.sin(a2) * l2)} M${f(p.x)} ${f(p.y)}`;
      }
    }
    fissures.push(d);
  }
  const bulles: { x: number; y: number; r: number }[] = [];
  for (let g = 0; g < 3; g += 1) {
    const c = { x: entre(12, 88), y: entre(12, 88) };
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i += 1) bulles.push({ x: c.x + entre(-5, 5), y: c.y + entre(-5, 5), r: entre(0.35, 1.1) });
  }
  return { fissures, bulles };
}

/**
 * Un bloc de glace autour de ce qu'on y met. La face, le dessus et le côté ;
 * le contenu dedans, un peu éteint par la glace.
 */
export function BlocDeGlace({
  graine,
  children,
  className = '',
}: {
  graine: string;
  children: ReactNode;
  className?: string;
}) {
  const { fissures, bulles } = useMemo(() => interieur(graine), [graine]);
  return (
    <div className={`bloc-glace ${className}`}>
      <span className="bloc-glace-dos" aria-hidden="true" />
      <div className="bloc-glace-coeur">{children}</div>
      <span className="bloc-glace-dessus" aria-hidden="true" />
      <span className="bloc-glace-cote" aria-hidden="true" />
      <span className="bloc-glace-face" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {fissures.map((d, i) => (
            <g key={i}>
              <path d={d} className="bloc-glace-plan" />
              <path d={d} className="bloc-glace-fil" />
            </g>
          ))}
          {bulles.map((b, i) => (
            <ellipse key={i} cx={b.x} cy={b.y} rx={b.r} ry={b.r * 0.62} className="bloc-glace-bulle" />
          ))}
        </svg>
      </span>
    </div>
  );
}

/* ================================ L'éclatement ================================ */

interface Eclat {
  /** Le polygone, en pour cent de la face : pour `clip-path`. */
  forme: string;
  /** Son centre, en pour cent. */
  centre: Point;
}

/**
 * La géométrie de la casse, autour du point d'impact : des rayons qui partent
 * vers les bords, brisés une fois en chemin, et un anneau qui les relie près
 * du centre. Les éclats sont les morceaux entre deux rayons — un près du
 * centre, un vers le bord — et les fissures sont leurs arêtes : ce qui part,
 * c'est ce qui s'est fendu. Coordonnées sur 100 × 100.
 */
function casse(graine: string) {
  const rnd = tirage(graine);
  const entre = (a: number, b: number) => a + (b - a) * rnd();
  const c: Point = { x: entre(44, 56), y: entre(38, 48) };
  const n = 11;
  const angles = Array.from({ length: n }, (_, i) => ((i + entre(-0.3, 0.3)) / n) * Math.PI * 2).sort((a, b) => a - b);

  // Où un rayon parti du centre sort du carré.
  const bordDe = (a: number): Point => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = dx > 0 ? (100 - c.x) / dx : dx < 0 ? -c.x / dx : Infinity;
    const ty = dy > 0 ? (100 - c.y) / dy : dy < 0 ? -c.y / dy : Infinity;
    const t = Math.min(tx, ty);
    return { x: c.x + dx * t, y: c.y + dy * t };
  };
  const rayons = angles.map((a) => {
    const b = bordDe(a);
    const longueur = Math.hypot(b.x - c.x, b.y - c.y);
    const r = entre(11, 20);
    const anneau = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
    // Le coude, entre l'anneau et le bord, un peu de travers.
    const t = entre(0.45, 0.7);
    const perp = a + Math.PI / 2;
    const ecart = entre(-4, 4);
    const coude = {
      x: anneau.x + (b.x - anneau.x) * t + Math.cos(perp) * ecart,
      y: anneau.y + (b.y - anneau.y) * t + Math.sin(perp) * ecart,
    };
    return { a, anneau, coude, bord: b, longueur };
  });

  // Les coins du carré, rangés par angle vu du centre.
  const coins = [
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ].map((p) => ({ p, a: (Math.atan2(p.y - c.y, p.x - c.x) + Math.PI * 2) % (Math.PI * 2) }));

  const pct = (p: Point) => `${f(p.x)}% ${f(p.y)}%`;
  const eclats: Eclat[] = [];
  const centreDe = (pts: Point[]) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });
  for (let i = 0; i < n; i += 1) {
    const r1 = rayons[i];
    const r2 = rayons[(i + 1) % n];
    // Le morceau du centre.
    const dedans = [c, r1.anneau, r2.anneau];
    eclats.push({ forme: `polygon(${dedans.map(pct).join(', ')})`, centre: centreDe(dedans) });
    // Le morceau du bord, coins compris.
    const a1 = (r1.a + Math.PI * 2) % (Math.PI * 2);
    let a2 = (r2.a + Math.PI * 2) % (Math.PI * 2);
    if (a2 <= a1) a2 += Math.PI * 2;
    const entreDeux = coins
      .map((k) => ({ ...k, a: k.a < a1 ? k.a + Math.PI * 2 : k.a }))
      .filter((k) => k.a > a1 && k.a < a2)
      .sort((x, y) => x.a - y.a)
      .map((k) => k.p);
    const dehors = [r1.anneau, r1.coude, r1.bord, ...entreDeux, r2.bord, r2.coude, r2.anneau];
    eclats.push({ forme: `polygon(${dehors.map(pct).join(', ')})`, centre: centreDe(dehors) });
  }

  // Les fissures : d'abord la moitié des rayons, puis le reste et l'anneau.
  const rayon = (r: (typeof rayons)[number]) =>
    `M${f(c.x)} ${f(c.y)} L${f(r.anneau.x)} ${f(r.anneau.y)} L${f(r.coude.x)} ${f(r.coude.y)} L${f(r.bord.x)} ${f(r.bord.y)}`;
  const premieres = rayons.filter((_, i) => i % 2 === 0).map(rayon);
  const secondes = [
    ...rayons.filter((_, i) => i % 2 === 1).map(rayon),
    `M${rayons.map((r) => `${f(r.anneau.x)} ${f(r.anneau.y)}`).join(' L')} Z`,
  ];
  return { centre: c, eclats, premieres, secondes };
}

/** Trois cartes du booster, de la plus rare à la plus courante : un aperçu. */
function apercu(packId: PackId): CardDefinition[] {
  const cartes = cartesDuPack(packId);
  const ordre: Rarity[] = ['L', 'UR', 'R', 'C'];
  const pioche = (liste: CardDefinition[]) => liste[Math.floor(Math.random() * liste.length)];
  const choisies: CardDefinition[] = [];
  for (const r of ordre) {
    const de = cartes.filter((c) => c.rarity === r && !choisies.includes(c));
    if (de.length && choisies.length < 3) choisies.push(pioche(de));
  }
  while (choisies.length < 3) {
    const reste = cartes.filter((c) => !choisies.includes(c));
    if (!reste.length) break;
    choisies.push(pioche(reste));
  }
  // La plus rare au centre de l'éventail.
  return choisies.length === 3 ? [choisies[1], choisies[0], choisies[2]] : choisies;
}

type Phase = 'glace' | 'fendue' | 'brisee' | 'eclat' | 'cartes';

/** Ce que la fenêtre sait du booster. */
export interface BoosterAOuvrir {
  id: string;
  nom: string;
  quand: string;
  pour: 'toi' | 'ligue';
  gradient: [string, string];
  art: string | null;
  rarete: string;
}

/**
 * Le booster en grand, dans son bloc de glace, qui éclate. Puis trois de ses
 * cartes, et l'entrée par Twitch pour voir le reste.
 */
export function EclatBooster({
  booster,
  entree,
  onClose,
}: {
  booster: BoosterAOuvrir;
  /** Où mène « Rejoindre avec Twitch ». */
  entree: string;
  onClose: () => void;
}) {
  const geo = useMemo(() => casse(`eclat-${booster.id}`), [booster.id]);
  const [cartes] = useState(() => apercu(booster.id as PackId));
  const total = useMemo(() => cartesDuPack(booster.id as PackId).length, [booster.id]);
  const [phase, setPhase] = useState<Phase>('glace');
  const eclatsRef = useRef<HTMLDivElement>(null);
  const copeauxRef = useRef<HTMLDivElement>(null);

  // La fenêtre : Échap la ferme, la page ne défile pas derrière.
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', echap);
      document.body.style.overflow = avant;
    };
  }, [onClose]);

  // Le déroulé : deux coups qui fendent, la glace qui éclate, les cartes.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('cartes');
      return;
    }
    const minuteurs = [
      window.setTimeout(() => setPhase('fendue'), 550),
      window.setTimeout(() => setPhase('brisee'), 1150),
      window.setTimeout(() => setPhase('eclat'), 1650),
      window.setTimeout(() => setPhase('cartes'), 2350),
    ];
    return () => minuteurs.forEach((m) => window.clearTimeout(m));
  }, []);

  // L'éclat : chaque morceau part à l'opposé du point d'impact, tourne sur
  // lui-même et retombe ; des copeaux de glace volent autour.
  useEffect(() => {
    if (phase !== 'eclat') return;
    const rnd = tirage(`vol-${booster.id}-${Date.now()}`);
    const entre = (a: number, b: number) => a + (b - a) * rnd();
    const morceaux = eclatsRef.current ? Array.from(eclatsRef.current.children) : [];
    morceaux.forEach((el, i) => {
      const e = geo.eclats[i];
      if (!e) return;
      const dx = e.centre.x - geo.centre.x;
      const dy = e.centre.y - geo.centre.y;
      const l = Math.hypot(dx, dy) || 1;
      const force = entre(55, 120) * (0.6 + l / 60);
      const vx = (dx / l) * force;
      const vy = (dy / l) * force;
      const rz = entre(-260, 260);
      const rx = entre(-120, 120);
      const ry = entre(-120, 120);
      (el as HTMLElement).animate(
        [
          { transform: 'translate3d(0,0,0) rotate3d(0,0,1,0deg)', opacity: 1 },
          {
            transform: `translate3d(${f(vx * 0.45)}%, ${f(vy * 0.45 - 6)}%, 60px) rotateX(${f(rx * 0.4)}deg) rotateY(${f(ry * 0.4)}deg) rotateZ(${f(rz * 0.4)}deg)`,
            opacity: 1,
            offset: 0.3,
          },
          {
            transform: `translate3d(${f(vx)}%, ${f(vy + 70)}%, 120px) rotateX(${f(rx)}deg) rotateY(${f(ry)}deg) rotateZ(${f(rz)}deg)`,
            opacity: 0,
          },
        ],
        { duration: entre(850, 1250), easing: 'cubic-bezier(0.2, 0.6, 0.45, 1)', fill: 'forwards' },
      );
    });
    const copeaux = copeauxRef.current ? Array.from(copeauxRef.current.children) : [];
    copeaux.forEach((el) => {
      const a = entre(0, Math.PI * 2);
      const v = entre(120, 380);
      (el as HTMLElement).animate(
        [
          { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${f(Math.cos(a) * v)}px), calc(-50% + ${f(Math.sin(a) * v + 140)}px)) scale(${f(entre(0.4, 1))}) rotate(${f(entre(-540, 540))}deg)`,
            opacity: 0,
          },
        ],
        { duration: entre(700, 1200), easing: 'cubic-bezier(0.15, 0.7, 0.4, 1)', fill: 'forwards' },
      );
    });
  }, [phase, geo, booster.id]);

  const ouverte = phase === 'eclat' || phase === 'cartes';
  return createPortal(
    <div
      className="eclat-voile"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eclat-titre"
      onClick={onClose}
      data-phase={phase}
    >
      <div className="eclat-scene" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-sm eclat-fermer" onClick={onClose} aria-label="Fermer" autoFocus>
          ✕
        </button>

        <div className="eclat-centre">
          <div className="eclat-bloc" style={{ ['--ix' as string]: `${geo.centre.x}%`, ['--iy' as string]: `${geo.centre.y}%` } as CSSProperties}>
            <BlocDeGlace graine={`grand-${booster.id}`} className="bloc-glace-grand">
              <BoosterPack3D
                name={booster.nom}
                cardCount={1}
                gradient={booster.gradient}
                art={booster.art}
                rarete={booster.rarete}
                frozen={!ouverte}
              />
            </BlocDeGlace>
            {/* Les fissures, tracées sur la face, puis les éclats qui en sont découpés. */}
            <svg className="eclat-fissures" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {geo.premieres.map((d, i) => (
                <path key={`a${i}`} d={d} pathLength={1} className="eclat-fissure eclat-fissure-1" />
              ))}
              {geo.secondes.map((d, i) => (
                <path key={`b${i}`} d={d} pathLength={1} className="eclat-fissure eclat-fissure-2" />
              ))}
            </svg>
            <span className="eclat-impact" aria-hidden="true" />
            <div ref={eclatsRef} className="eclat-morceaux" aria-hidden="true">
              {geo.eclats.map((e, i) => (
                <span key={i} className="eclat-morceau">
                  <i style={{ clipPath: e.forme }} />
                </span>
              ))}
            </div>
            <div ref={copeauxRef} className="eclat-copeaux" aria-hidden="true">
              {Array.from({ length: 22 }, (_, i) => (
                <span key={i} style={{ ['--t' as string]: `${4 + (i % 5) * 2}px` } as CSSProperties} />
              ))}
            </div>
          </div>

          <ul className="eclat-cartes" aria-label={`Trois cartes du ${booster.nom}`}>
            {cartes.map((c, i) => (
              <li key={c.id} style={{ ['--o' as string]: i - 1, ['--i' as string]: i } as CSSProperties}>
                <span className="eclat-carte">
                  <span className="eclat-carte-dos" aria-hidden="true">
                    <LogoCristal className="h-1/3 w-1/3" />
                  </span>
                  <span className="eclat-carte-face">
                    <CardFrame
                      cardId={c.id}
                      name={c.name}
                      rarity={c.rarity}
                      glyph={c.glyph}
                      nature={c.nature}
                      largeur="(min-width: 640px) 200px, 120px"
                    />
                  </span>
                </span>
                <span
                  className="eclat-carte-rarete"
                  style={{ ['--r' as string]: `var(--r-${c.rarity.toLowerCase()})` } as CSSProperties}
                >
                  {RARITY_META[c.rarity].label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="eclat-texte">
          <p className="eclat-sur">
            Aperçu · {cartes.length} cartes sur {total}
          </p>
          <h2 id="eclat-titre">{booster.nom}</h2>
          <p className="eclat-quand">
            <span data-pour={booster.pour}>{booster.pour === 'toi' ? 'Pour toi' : 'Pour la ligue'}</span>
            {booster.quand.charAt(0).toUpperCase() + booster.quand.slice(1)}
          </p>
          <p className="eclat-suite">
            Les {total - cartes.length} autres cartes se découvrent une fois connecté — et les vrais boosters s’ouvrent en
            direct sur le stream.
          </p>
          <div className="eclat-actions">
            <a href={entree} className="btn btn-twitch no-underline">
              <IconTwitch className="h-5 w-5" />
              Rejoindre avec Twitch
            </a>
            <button type="button" className="btn" onClick={onClose}>
              Refermer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
