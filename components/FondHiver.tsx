'use client';

import { useEffect, useRef, useState } from 'react';
import { monteNeige } from './fond/neige';

export { NEIGE } from './fond/neige';

/**
 * Le décor du site, repris du pen « WebGL Mouse Controlled Snow » : la photo
 * de montagne en fond de `.fond-hiver` (CSS), et la neige WebGL pilotée par
 * la souris par-dessus. Voir `components/fond/neige.ts`. Le canvas est fixé
 * derrière tout le reste, sans événements — la souris est lue sur la
 * fenêtre. Il apparaît en fondu quand la texture du flocon est là. Sans
 * WebGL, la photo reste, sans une erreur en console.
 *
 * Par-dessus, le voile : c'est lui qui garantit la lisibilité du contenu.
 */
export function FondHiver() {
  const ref = useRef<HTMLDivElement>(null);
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    const holder = ref.current;
    if (!holder) return;
    let annule = false;
    const neige = monteNeige(holder, '/fond/flocon.png');
    if (!neige) return;
    neige.prete.then(() => {
      if (!annule) setPrete(true);
    });
    return () => {
      annule = true;
      neige.detruit();
    };
  }, []);

  return (
    <div className="fond-hiver" aria-hidden="true">
      <div ref={ref} className={`fh-neige ${prete ? 'fh-neige-prete' : ''}`} />
      <div className="fh-voile" />
    </div>
  );
}
