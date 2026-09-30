'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * La scène d'un overlay : un plateau dessiné à une taille fixe — celle qu'on
 * conseille pour la source OBS —, mis à l'échelle de ce qui l'accueille.
 *
 * Dans OBS, la source a la taille qu'on lui donne ; dans l'aperçu de
 * l'administration, c'est une vignette. Le dessin, lui, ne change pas : on le
 * réduit ou on l'agrandit en entier, sans rien recalculer. Le rail des
 * boosters mesure ses cartes en coordonnées de mise en page, que l'échelle ne
 * touche pas : il s'arrête toujours sur la bonne.
 */
export function Scene({
  largeur,
  hauteur,
  children,
  className,
}: {
  largeur: number;
  hauteur: number;
  children: ReactNode;
  className?: string;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(0);

  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const mesure = () => setEchelle(Math.min(el.clientWidth / largeur, el.clientHeight / hauteur));
    mesure();
    const obs = new ResizeObserver(mesure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [largeur, hauteur]);

  return (
    <div ref={boite} className={`ov-boite ${className ?? ''}`}>
      <div
        className="ov-plateau"
        style={{ width: largeur, height: hauteur, transform: `translate(-50%, -50%) scale(${echelle})` }}
      >
        {echelle > 0 && children}
      </div>
    </div>
  );
}
