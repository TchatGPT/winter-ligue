'use client';

import { useMemo, useRef, useState } from 'react';
import { ATTR_FENETRE, ATTR_RUBAN, useSpinAnimation } from '@/components/useSpinAnimation';
import { construitBandeJoueurs } from '@/lib/spin/bande';
import { COURBE_MESUREE, RANG_GAGNANT } from '@/lib/spin/courbe';

/**
 * Le second tirage d'un booster de la ligue : le rail des joueurs.
 *
 * Quand la carte tombe sur un joueur tiré au sort, ou sur deux, le serveur les
 * a tirés dans la transaction de l'ouverture, comme la carte. Ce rail ne fait
 * que dérouler ce tirage : des plaques de pseudos défilent, et la course
 * s'arrête sur le joueur tiré — un rail par joueur.
 *
 * Le même moteur que le rail des cartes (`useSpinAnimation`), couché, avec la
 * même géométrie mesurée : seules les tuiles changent. Le son aussi est le
 * même, le cliquet et le claquement d'arrêt, sans fanfare — tirer un joueur
 * n'a pas de rareté.
 */

/** Plus court que le tirage de la carte, qui a déjà fait monter la tension. */
export const DUREE_TIRAGE_JOUEUR = Math.round(COURBE_MESUREE.duree * 0.6);

/** La première lettre d'un pseudo, pour sa pastille. */
function initiale(pseudo: string): string {
  return ([...pseudo.trim()][0] ?? '?').toUpperCase();
}

export function RailJoueurs({
  joueurs,
  gagnant,
  sourdine = false,
  onFini,
}: {
  /** Ceux qui défilent : les joueurs en lice. */
  joueurs: readonly string[];
  /** Le joueur tiré par le serveur. */
  gagnant: string;
  /** Sans un bruit : l'overlay du stream ne sonne que si on le lui demande. */
  sourdine?: boolean;
  onFini: () => void;
}) {
  // La bande est construite une fois, au montage, comme celle des cartes.
  const [bande] = useState(() => construitBandeJoueurs(joueurs, gagnant, Math.random));
  const cadre = useRef<HTMLDivElement>(null);

  const metaTuiles = useMemo(() => [bande.map(() => ({ rang: 0, couleur: 'var(--ice)' }))], [bande]);

  useSpinAnimation({
    cadre,
    bandes: 1,
    tuiles: metaTuiles,
    duree: DUREE_TIRAGE_JOUEUR,
    courbe: COURBE_MESUREE,
    axe: 'x',
    rang: 0,
    bandeMeilleure: 0,
    sourdine,
    onFini,
  });

  return (
    <div className="rail-scene rail-scene-x">
      <div
        className="rail rail-x rail-joueurs"
        ref={cadre}
        style={{ ['--bandes' as string]: 1 }}
        role="img"
        aria-label="Tirage d’un joueur en cours"
      >
        <div
          className="rail-fenetre"
          {...{ [ATTR_FENETRE]: '' }}
          data-arrete="false"
          data-rang={0}
          style={{ ['--gagne' as string]: 'var(--ice)' }}
        >
          <div className="rail-ruban" {...{ [ATTR_RUBAN]: '' }}>
            {bande.map((pseudo, k) => (
              <div
                key={k}
                className={`rail-carte rail-joueur${k === RANG_GAGNANT ? ' rail-carte-gagnante' : ''}`}
                data-rang={0}
                style={{ ['--r' as string]: 'var(--ice)', ['--k' as string]: String(k) }}
                aria-hidden="true"
              >
                <span className="rail-joueur-pastille">{initiale(pseudo)}</span>
                <span className="rail-joueur-nom">{pseudo}</span>
              </div>
            ))}
          </div>
        </div>

        <span className="rail-repere" aria-hidden="true" />
        <span className="rail-voile rail-voile-avant" aria-hidden="true" />
        <span className="rail-voile rail-voile-apres" aria-hidden="true" />
      </div>
    </div>
  );
}
