'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/**
 * L'éventail des boosters de l'accueil, qui suit la souris.
 *
 * La position du pointeur dans la fenêtre, de -0,5 à 0,5 sur chaque axe,
 * devient `--px` et `--py` : le CSS en déplace chaque sachet selon sa
 * profondeur, et la fumée à contre-sens — une parallaxe de quelques pixels,
 * qui donne du relief sans rien déplacer dans la page. Une fois par image au
 * plus. Seulement avec une souris : sur un écran tactile, rien ne suit.
 */
export function EventailBoosters({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let image = 0;
    let x = 0;
    let y = 0;
    const bouge = (e: PointerEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (image) return;
      image = requestAnimationFrame(() => {
        image = 0;
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', bouge, { passive: true });
    return () => {
      window.removeEventListener('pointermove', bouge);
      cancelAnimationFrame(image);
    };
  }, []);

  return (
    <div ref={ref} className="acc-eventail" aria-hidden="true">
      {children}
    </div>
  );
}
