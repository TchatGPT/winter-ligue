'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Le rail des étapes de l'accueil.
 *
 * Sur un grand écran, les cinq blocs tiennent côte à côte et il ne fait rien.
 * Quand la fenêtre est trop étroite pour eux — une tablette couchée, une
 * petite fenêtre —, le rail défile de gauche à droite plutôt que de faire
 * défiler la page : au doigt, au pavé tactile, aux flèches du clavier, à la
 * molette (qui n'a rien d'autre à faire défiler quand la page tient dans
 * l'écran) et par deux flèches, qui n'apparaissent que là.
 */
export function RailEtapes({ titre, children }: { titre: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  /** Ce qui reste à voir de chaque côté. */
  const [reste, setReste] = useState({ avant: false, apres: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const etat = { avant: el.scrollLeft > 4, apres: max - el.scrollLeft > 4 };
      setReste((r) => (r.avant === etat.avant && r.apres === etat.apres ? r : etat));
    };
    const molette = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      // Si la page défile de haut en bas, la molette est à elle.
      if (document.documentElement.scrollHeight > window.innerHeight + 1) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    mesure();
    const observe = new ResizeObserver(mesure);
    observe.observe(el);
    el.addEventListener('scroll', mesure, { passive: true });
    el.addEventListener('wheel', molette, { passive: false });
    return () => {
      observe.disconnect();
      el.removeEventListener('scroll', mesure);
      el.removeEventListener('wheel', molette);
    };
  }, []);

  const avance = (sens: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const bloc = el.firstElementChild?.getBoundingClientRect().width ?? el.clientWidth / 2;
    el.scrollBy({ left: sens * (bloc + 12), behavior: 'smooth' });
  };
  const defile = reste.avant || reste.apres;

  return (
    <>
      <header className="acc-etapes-tete">
        {titre}
        {defile && (
          <span className="acc-etapes-fleches">
            <button type="button" onClick={() => avance(-1)} disabled={!reste.avant} aria-label="Étapes précédentes">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
            </button>
            <button type="button" onClick={() => avance(1)} disabled={!reste.apres} aria-label="Étapes suivantes">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
          </span>
        )}
      </header>
      <ol
        ref={ref}
        className="acc-rail"
        data-avant={reste.avant ? '' : undefined}
        data-apres={reste.apres ? '' : undefined}
        tabIndex={defile ? 0 : undefined}
        aria-label="La ligue en cinq étapes"
      >
        {children}
      </ol>
    </>
  );
}
