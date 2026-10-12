'use client';

import { useRef, type PointerEvent, type ReactNode } from 'react';

/** Ramène une position relative dans [0, 1]. */
function borne(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Une carte qu'on penche du doigt ou de la souris, en relief.
 *
 * Le composant ne pose que deux variables — `--mx` et `--my`, la position du
 * pointeur sur la carte, de 0 à 1 — et le CSS fait le reste (`.carte-3d`) : la
 * carte s'incline vers le pointeur, un reflet le suit, et l'illustration glisse
 * à contre-sens sous le cadre. C'est ce décalage qui donne la profondeur : le
 * cadre est devant, la scène derrière.
 *
 * Au repos, la carte flotte doucement d'elle-même, sauf si le système demande
 * moins d'animations. Au toucher, la carte suit le doigt sans faire défiler la
 * page.
 */
export function CarteInclinable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const suit = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', borne((e.clientX - r.left) / r.width).toFixed(3));
    el.style.setProperty('--my', borne((e.clientY - r.top) / r.height).toFixed(3));
    el.dataset.actif = 'true';
  };

  const lache = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', '0.5');
    el.style.setProperty('--my', '0.5');
    delete el.dataset.actif;
  };

  return (
    <div
      ref={ref}
      className={`carte-3d ${className}`}
      onPointerMove={suit}
      onPointerLeave={lache}
      onPointerCancel={lache}
    >
      <div className="carte-3d-flotte">
        <div className="carte-3d-corps">
          {children}
          <span className="carte-3d-reflet" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
