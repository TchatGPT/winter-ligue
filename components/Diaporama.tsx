'use client';

import {
  type CSSProperties,
  type PointerEvent as EvenementPointeur,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface Diapositive {
  cle: string;
  /** Son nom, pour les points de navigation et les lecteurs d'écran. */
  titre: string;
  contenu: ReactNode;
}

/**
 * Un paquet de cartes de verre, en éventail dans l'espace.
 *
 * La carte au centre fait face ; ses voisines s'écartent, pivotent et
 * reculent de part et d'autre, et s'estompent en s'éloignant. Le paquet tourne
 * en boucle : après la dernière revient la première.
 *
 * On le fait tourner comme on veut :
 *  - en le **tirant**, à la souris ou au doigt, avec de l'élan : un geste vif
 *    fait passer plusieurs cartes ;
 *  - au pavé tactile (glissé horizontal), au clavier (← →) ;
 *  - en touchant une carte de côté, qui vient au centre ;
 *  - avec les flèches et les points, en dessous.
 *
 * La position est un nombre à virgule, animé vers sa cible image par image ;
 * chaque carte en reçoit sa distance au centre (`--d`, `--ad`), et le CSS en
 * tire tout le reste — écart, pivot, recul, voile. Rien ne passe par React
 * pendant le geste : seules les variables CSS changent.
 *
 * La carte au centre s'incline sous la souris, et la lumière suit le curseur.
 *
 * Tant qu'on n'y a pas touché, le paquet tourne seul : la jauge du point
 * allumé se remplit, puis la carte suivante vient au centre. Il s'arrête sous
 * la souris, hors de l'écran, et pour de bon dès qu'on prend la main ; le
 * bouton du bout le relance.
 */

/** Ramène un écart d'indices dans [-n/2, n/2[ : le paquet tourne en boucle. */
function enroule(x: number, n: number): number {
  return ((((x + n / 2) % n) + n) % n) - n / 2;
}

function modulo(x: number, n: number): number {
  return ((x % n) + n) % n;
}

/** La distance d'une carte au centre quand le paquet est à la position `p`. */
function distance(i: number, p: number, n: number): { d: number; ad: number } {
  const d = enroule(i - p, n);
  return { d, ad: Math.min(Math.abs(d), 3) };
}

/** Au-delà, une carte est hors de vue : on ne la peint plus. */
const LOIN = 2.6;
/** En deçà, une carte est assez proche pour porter du vrai verre (flou). */
const PROCHE = 1.5;

interface Geste {
  id: number;
  x0: number;
  y0: number;
  p0: number;
  bouge: boolean;
  /** Les derniers relevés (instant, abscisse), pour l'élan au lâcher. */
  traces: [number, number][];
}

export function Diaporama({ id, label, diapositives }: { id?: string; label: string; diapositives: Diapositive[] }) {
  const n = diapositives.length;
  const scene = useRef<HTMLDivElement>(null);
  const cartes = useRef<(HTMLDivElement | null)[]>([]);
  /** La position affichée, et celle vers laquelle elle va. */
  const pos = useRef(0);
  const cible = useRef(0);
  /** La raideur du retour : plus longue pour l'entrée en scène. */
  const tau = useRef(150);
  const image = useRef(0);
  const dernier = useRef(0);
  const geste = useRef<Geste | null>(null);
  const aGlisse = useRef(false);
  const molette = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entre = useRef(false);
  const [actif, setActif] = useState(0);
  const [auto, setAuto] = useState(true);
  const [suspendu, setSuspendu] = useState(false);
  const [enVue, setEnVue] = useState(false);
  const [glisse, setGlisse] = useState(false);

  /** Pose chaque carte à sa place pour la position `p`. */
  const peins = useCallback(
    (p: number) => {
      cartes.current.forEach((el, i) => {
        if (!el) return;
        const { d, ad } = distance(i, p, n);
        el.style.setProperty('--d', d.toFixed(4));
        el.style.setProperty('--ad', ad.toFixed(4));
        el.style.zIndex = String(50 - Math.round(ad * 10));
        el.toggleAttribute('data-loin', ad > LOIN);
        el.toggleAttribute('data-proche', ad < PROCHE);
      });
      setActif(modulo(Math.round(p), n));
    },
    [n],
  );

  /** Anime la position vers sa cible, jusqu'à l'y poser. */
  const anime = useCallback(() => {
    if (image.current) return;
    dernier.current = performance.now();
    const pas = (t: number) => {
      const dt = Math.min(64, Math.max(0, t - dernier.current));
      dernier.current = t;
      if (!geste.current?.bouge) {
        pos.current += (cible.current - pos.current) * (1 - Math.exp(-dt / tau.current));
        if (Math.abs(cible.current - pos.current) < 0.0008) {
          pos.current = cible.current;
          tau.current = 150;
        }
      }
      peins(pos.current);
      image.current = pos.current !== cible.current || geste.current?.bouge ? requestAnimationFrame(pas) : 0;
    };
    image.current = requestAnimationFrame(pas);
  }, [peins]);

  useEffect(() => () => cancelAnimationFrame(image.current), []);

  /** Avance (ou recule) de `delta` cartes, depuis la carte visée. */
  const aller = useCallback(
    (delta: number) => {
      cible.current = Math.round(cible.current) + delta;
      anime();
    },
    [anime],
  );
  const allerA = (i: number) => aller(enroule(i - modulo(Math.round(cible.current), n), n));

  /** L'écart entre deux cartes, en pixels : ce qu'un geste doit parcourir pour en passer une. */
  const ecartPx = () => {
    const c = cartes.current[0];
    const s = scene.current;
    if (!c || !s) return 300;
    return c.offsetWidth * (parseFloat(getComputedStyle(s).getPropertyValue('--ecart')) || 0.85);
  };

  // L'entrée en scène, la première fois qu'il paraît : les cartes arrivent
  // de la droite et se rangent. Puis, hors de l'écran, rien ne tourne.
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !entre.current) {
          entre.current = true;
          pos.current = cible.current - 2.4;
          tau.current = 300;
          peins(pos.current);
          anime();
        }
        setEnVue(e.intersectionRatio >= 0.4);
      },
      { threshold: [0, 0.4] },
    );
    io.observe(s);
    return () => io.disconnect();
  }, [anime, peins]);

  const prendLaMain = () => setAuto(false);

  /* ---- Le geste : tirer le paquet, à la souris ou au doigt ---- */
  const appuie = (e: EvenementPointeur<HTMLDivElement>) => {
    if (e.button !== 0) return;
    geste.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: pos.current, bouge: false, traces: [] };
    aGlisse.current = false;
  };
  const deplace = (e: EvenementPointeur<HTMLDivElement>) => {
    const g = geste.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    if (!g.bouge) {
      if (Math.abs(dx) < 6) return;
      // Un geste d'abord vertical fait défiler la page : on le lâche.
      if (Math.abs(e.clientY - g.y0) > Math.abs(dx)) {
        geste.current = null;
        return;
      }
      g.bouge = true;
      g.p0 = pos.current;
      g.x0 = e.clientX;
      aGlisse.current = true;
      prendLaMain();
      setGlisse(true);
      scene.current?.setPointerCapture(e.pointerId);
      anime();
    }
    pos.current = g.p0 - (e.clientX - g.x0) / ecartPx();
    cible.current = pos.current;
    g.traces.push([performance.now(), e.clientX]);
    if (g.traces.length > 6) g.traces.shift();
  };
  const lache = (e: EvenementPointeur<HTMLDivElement>) => {
    const g = geste.current;
    if (!g || e.pointerId !== g.id) return;
    geste.current = null;
    if (!g.bouge) return;
    setGlisse(false);
    // L'élan : la vitesse des derniers instants, prolongée, puis arrondie à
    // une carte. Deux cartes au plus d'un seul geste.
    const [premier] = g.traces;
    const fin = g.traces[g.traces.length - 1];
    const vitesse = premier && fin && fin[0] > premier[0] ? (fin[1] - premier[1]) / (fin[0] - premier[0]) : 0;
    const projete = pos.current - (vitesse * 220) / ecartPx();
    const depart = Math.round(pos.current);
    cible.current = Math.max(depart - 2, Math.min(depart + 2, Math.round(projete)));
    anime();
  };

  /* ---- La lumière qui suit la souris, sur la carte au centre ---- */
  const survole = (e: EvenementPointeur<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || geste.current?.bouge) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width).toFixed(3));
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height).toFixed(3));
    el.setAttribute('data-survol', '');
  };
  const quitte = (e: EvenementPointeur<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.removeAttribute('data-survol');
    el.style.setProperty('--mx', '0.5');
    el.style.setProperty('--my', '0.5');
  };

  const defile = auto && !suspendu && enVue;

  return (
    <section
      id={id}
      className="deck"
      aria-roledescription="carrousel"
      aria-label={label}
      data-defile={defile ? '' : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setSuspendu(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setSuspendu(false)}
      onFocus={() => setSuspendu(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setSuspendu(false);
      }}
    >
      <div
        ref={scene}
        className="deck-scene"
        data-glisse={glisse ? '' : undefined}
        tabIndex={0}
        onPointerDown={appuie}
        onPointerMove={deplace}
        onPointerUp={lache}
        onPointerCancel={lache}
        onWheel={(e) => {
          // Le pavé tactile : un glissé horizontal fait tourner le paquet,
          // et il se range sur une carte dès qu'on s'arrête.
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
          prendLaMain();
          cible.current += e.deltaX / ecartPx();
          if (molette.current) clearTimeout(molette.current);
          molette.current = setTimeout(() => {
            cible.current = Math.round(cible.current);
            anime();
          }, 130);
          anime();
        }}
        onKeyDown={(e) => {
          const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!pas) return;
          e.preventDefault();
          prendLaMain();
          aller(pas);
        }}
        onClickCapture={(e) => {
          // Un geste n'est pas un clic : rien ne s'ouvre au lâcher.
          if (!aGlisse.current) return;
          aGlisse.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          // Une carte de côté, touchée, vient au centre. Elles sont inertes :
          // le clic arrive ici, et sa place dit laquelle.
          if ((e.target as HTMLElement).closest('.deck-carte[data-actif]')) return;
          const r = e.currentTarget.getBoundingClientRect();
          const k = Math.round((e.clientX - (r.left + r.width / 2)) / ecartPx());
          if (!k) return;
          prendLaMain();
          aller(k);
        }}
      >
        <span className="deck-sol" aria-hidden="true" />
        {diapositives.map((diapo, i) => {
          const { d, ad } = distance(i, 0, n);
          return (
            <div
              key={diapo.cle}
              ref={(el) => {
                cartes.current[i] = el;
              }}
              className="deck-carte"
              role="group"
              aria-roledescription="diapositive"
              aria-label={`${i + 1} sur ${n} : ${diapo.titre}`}
              data-actif={i === actif ? '' : undefined}
              data-proche={ad < PROCHE ? '' : undefined}
              data-loin={ad > LOIN ? '' : undefined}
              inert={i !== actif}
              style={
                { ['--d' as string]: d, ['--ad' as string]: ad, zIndex: 50 - Math.round(ad * 10) } as CSSProperties
              }
              onPointerMove={survole}
              onPointerLeave={quitte}
            >
              {diapo.contenu}
              <span className="deck-carte-voile" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      <div className="deck-nav">
        <button
          type="button"
          className="deck-fleche"
          aria-label="Carte précédente"
          onClick={() => {
            prendLaMain();
            aller(-1);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </button>
        <div className="deck-points">
          {diapositives.map((d, i) => (
            <button
              key={d.cle}
              type="button"
              aria-label={`${i + 1} sur ${n} : ${d.titre}`}
              aria-current={i === actif ? 'true' : undefined}
              onClick={() => {
                prendLaMain();
                allerA(i);
              }}
            >
              <span className="deck-point">
                {/* La jauge du défilement : pleine, la carte suivante vient. */}
                {i === actif && auto && <span key={actif} className="deck-jauge" onAnimationEnd={() => aller(1)} />}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="deck-fleche"
          aria-label="Carte suivante"
          onClick={() => {
            prendLaMain();
            aller(1);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 6.5 15 12l-5.5 5.5" />
          </svg>
        </button>
        <button
          type="button"
          className="deck-pause"
          aria-label={auto ? 'Arrêter le défilement' : 'Faire défiler'}
          onClick={() => setAuto((a) => !a)}
        >
          {auto ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 7v10M15 7v10" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6.5v11l8.5-5.5Z" />
            </svg>
          )}
        </button>
      </div>
    </section>
  );
}
