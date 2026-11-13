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

/** Une étape de la ligue, dans le paquet. */
export interface EtapeDuPaquet {
  cle: string;
  numero: number;
  /** Une couleur du thème : `var(--gold)`… la lumière prise dans la carte. */
  teinte: string;
  theme: string;
  icone: ReactNode;
  titre: string;
  texte: ReactNode;
}

/**
 * La ligue en cinq étapes, en paquet de cartes de verre (13/11/2026, refait
 * d'après le paquet du premier accueil).
 *
 * La carte au centre fait face ; ses voisines s'écartent, pivotent, reculent
 * et s'enfoncent dans la nuit — plus loin, plus sombres et plus floues,
 * jusqu'à s'y fondre. Le paquet tourne en boucle : après la dernière revient
 * la première.
 *
 * On le fait tourner comme on veut : en le **tirant**, à la souris ou au
 * doigt, avec de l'élan ; au pavé tactile ; au clavier (← →) ; en touchant une
 * carte de côté, qui vient au centre ; avec les flèches et les points. Tant
 * qu'on n'y a pas touché, il tourne seul — la jauge du point allumé se
 * remplit, puis la carte suivante vient —, s'arrête sous la souris, et pour de
 * bon dès qu'on prend la main.
 *
 * La position est un nombre à virgule, animé vers sa cible image par image ;
 * chaque carte en reçoit sa distance au centre (`--d`, `--ad`), et le CSS en
 * tire tout le reste. Rien ne passe par React pendant le geste.
 */

/** Ramène un écart d'indices dans [-n/2, n/2[ : le paquet tourne en boucle. */
function enroule(x: number, n: number): number {
  return ((((x + n / 2) % n) + n) % n) - n / 2;
}

function modulo(x: number, n: number): number {
  return ((x % n) + n) % n;
}

function distance(i: number, p: number, n: number): { d: number; ad: number } {
  const d = enroule(i - p, n);
  return { d, ad: Math.min(Math.abs(d), 3) };
}

/** Au-delà, une carte est hors de vue et ne se peint plus. */
const loinDe = (n: number) => Math.min(2.6, n / 2 - 0.04);
/** En deçà, une carte porte du vrai verre (flou de ce qu'il y a derrière). */
const PROCHE = 1.5;

interface Geste {
  id: number;
  x0: number;
  y0: number;
  p0: number;
  bouge: boolean;
  traces: [number, number][];
}

export function PaquetEtapes({ etapes, label }: { etapes: EtapeDuPaquet[]; label: string }) {
  const n = etapes.length;
  const scene = useRef<HTMLDivElement>(null);
  const cartes = useRef<(HTMLDivElement | null)[]>([]);
  const pos = useRef(0);
  const cible = useRef(0);
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

  const peins = useCallback(
    (p: number) => {
      cartes.current.forEach((el, i) => {
        if (!el) return;
        const { d, ad } = distance(i, p, n);
        el.style.setProperty('--d', d.toFixed(4));
        el.style.setProperty('--ad', ad.toFixed(4));
        el.style.zIndex = String(50 - Math.round(ad * 10));
        el.toggleAttribute('data-loin', ad > loinDe(n));
        el.toggleAttribute('data-proche', ad < PROCHE);
      });
      setActif(modulo(Math.round(p), n));
    },
    [n],
  );

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

  // L'entrée en scène : les cartes arrivent de la droite et se rangent.
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !entre.current) {
          entre.current = true;
          pos.current = cible.current - 2.4;
          tau.current = 320;
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
    const [premier] = g.traces;
    const fin = g.traces[g.traces.length - 1];
    const vitesse = premier && fin && fin[0] > premier[0] ? (fin[1] - premier[1]) / (fin[0] - premier[0]) : 0;
    const projete = pos.current - (vitesse * 220) / ecartPx();
    const depart = Math.round(pos.current);
    cible.current = Math.max(depart - 2, Math.min(depart + 2, Math.round(projete)));
    anime();
  };

  /* La lumière qui suit la souris, sur la carte au centre. */
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
      className="paquet"
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
        className="paquet-scene"
        style={{ ['--bord' as string]: Math.min(3, n / 2) } as CSSProperties}
        data-glisse={glisse ? '' : undefined}
        tabIndex={0}
        onPointerDown={appuie}
        onPointerMove={deplace}
        onPointerUp={lache}
        onPointerCancel={lache}
        onWheel={(e) => {
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
          if (!aGlisse.current) return;
          aGlisse.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.paquet-carte[data-actif]')) return;
          const r = e.currentTarget.getBoundingClientRect();
          const k = Math.round((e.clientX - (r.left + r.width / 2)) / ecartPx());
          if (!k) return;
          prendLaMain();
          aller(k);
        }}
      >
        <span className="paquet-sol" aria-hidden="true" />
        {etapes.map((etape, i) => {
          const { d, ad } = distance(i, 0, n);
          return (
            <div
              key={etape.cle}
              ref={(el) => {
                cartes.current[i] = el;
              }}
              className="paquet-carte"
              role="group"
              aria-roledescription="diapositive"
              aria-label={`${i + 1} sur ${n} : ${etape.titre}`}
              data-actif={i === actif ? '' : undefined}
              data-proche={ad < PROCHE ? '' : undefined}
              data-loin={ad > loinDe(n) ? '' : undefined}
              inert={i !== actif}
              style={
                {
                  ['--d' as string]: d,
                  ['--ad' as string]: ad,
                  ['--teinte' as string]: etape.teinte,
                  ['--rang' as string]: i,
                  zIndex: 50 - Math.round(ad * 10),
                } as CSSProperties
              }
              onPointerMove={survole}
              onPointerLeave={quitte}
            >
              <div className="paquet-etape">
                <header className="paquet-etape-tete">
                  <span className="paquet-etape-num" aria-hidden="true">
                    {String(etape.numero).padStart(2, '0')}
                  </span>
                  <span className="paquet-etape-theme">{etape.theme}</span>
                  <span className="paquet-etape-icone" aria-hidden="true">
                    {etape.icone}
                  </span>
                </header>
                <h3 className="paquet-etape-titre">{etape.titre}</h3>
                <p className="paquet-etape-texte">{etape.texte}</p>
              </div>
              <span className="paquet-carte-voile" aria-hidden="true" />
            </div>
          );
        })}
      </div>

      <div className="paquet-nav">
        <button
          type="button"
          className="paquet-fleche"
          aria-label="Étape précédente"
          onClick={() => {
            prendLaMain();
            aller(-1);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </button>
        <div className="paquet-points">
          {etapes.map((etape, i) => (
            <button
              key={etape.cle}
              type="button"
              aria-label={`${i + 1} sur ${n} : ${etape.titre}`}
              aria-current={i === actif ? 'true' : undefined}
              onClick={() => {
                prendLaMain();
                allerA(i);
              }}
            >
              <span className="paquet-point">
                {i === actif && auto && (
                  <span key={actif} className="paquet-jauge" onAnimationEnd={() => aller(1)} />
                )}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="paquet-fleche"
          aria-label="Étape suivante"
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
          className="paquet-pause"
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
