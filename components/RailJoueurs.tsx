'use client';

import { useMemo, useRef, useState } from 'react';
import { ATTR_FENETRE, ATTR_RUBAN, useSpinAnimation } from '@/components/useSpinAnimation';
import { construitBandeJoueurs } from '@/lib/spin/bande';
import { COURBE_MESUREE, RANG_GAGNANT } from '@/lib/spin/courbe';

/**
 * Le second tirage d'un booster de la ligue : le rail des joueurs.
 *
 * Quand la carte tombe sur des joueurs tirés au sort, le serveur les a tirés
 * dans la transaction de l'ouverture, comme la carte. Ce rail ne fait que
 * dérouler ce tirage : des plaques de pseudos défilent, et la course s'arrête
 * sur le joueur tiré.
 *
 * Deux ou trois joueurs tournent **en même temps**, une bande par joueur,
 * empilées (12/11/2026) : la même animation deux fois de suite lassait. Les
 * bandes partent ensemble et s'arrêtent à quelques dixièmes l'une de l'autre,
 * dans un ordre tiré au sort (`dureesEtalees`), sous le même repère.
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
  gagnants,
  sourdine = false,
  onFini,
}: {
  /** Ceux qui défilent : les joueurs en lice. */
  joueurs: readonly string[];
  /** Les joueurs tirés par le serveur : une bande chacun. */
  gagnants: readonly string[];
  /** Sans un bruit : l'overlay du stream ne sonne que si on le lui demande. */
  sourdine?: boolean;
  onFini: () => void;
}) {
  // Les bandes sont construites une fois, au montage, comme celles des cartes.
  // Un joueur tiré dans une autre bande n'y sert pas de leurre — sauf si la
  // ligue est trop petite pour s'en passer.
  const [bandes] = useState(() => {
    const autres = joueurs.filter((j) => !gagnants.includes(j));
    return gagnants.map((g) => construitBandeJoueurs(autres.length >= 2 ? [g, ...autres] : joueurs, g, Math.random));
  });
  const cadre = useRef<HTMLDivElement>(null);

  const metaTuiles = useMemo(
    () => bandes.map((bande) => bande.map(() => ({ rang: 0, couleur: 'var(--ice)' }))),
    [bandes],
  );

  useSpinAnimation({
    cadre,
    bandes: bandes.length,
    tuiles: metaTuiles,
    duree: DUREE_TIRAGE_JOUEUR,
    courbe: COURBE_MESUREE,
    axe: 'x',
    sourdine,
    onFini,
  });

  return (
    <div className="rail-scene rail-scene-x">
      <div
        className="rail rail-x rail-joueurs"
        ref={cadre}
        data-rangs={bandes.length}
        style={{ ['--bandes' as string]: 1, ['--rangs' as string]: bandes.length }}
        role="img"
        aria-label={bandes.length > 1 ? `Tirage de ${bandes.length} joueurs en cours` : 'Tirage d’un joueur en cours'}
      >
        {bandes.map((bande, b) => (
          <div
            key={b}
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
        ))}

        <span className="rail-repere" aria-hidden="true" />
        <span className="rail-voile rail-voile-avant" aria-hidden="true" />
        <span className="rail-voile rail-voile-apres" aria-hidden="true" />
      </div>
    </div>
  );
}
