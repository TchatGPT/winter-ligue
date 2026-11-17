'use client';

import { useMemo, useRef, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { ATTR_FENETRE, ATTR_RUBAN, useSpinAnimation } from '@/components/useSpinAnimation';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { construitBande } from '@/lib/spin/bande';
import { COURBE_MESUREE, RANG_GAGNANT } from '@/lib/spin/courbe';
import { REPOS_OUVERTURE } from '@/components/melangeRail';

/**
 * Le rail d'un pack : une seule bande, horizontale, une carte au bout.
 *
 * Le résultat est arrivé du serveur avant que ce composant n'existe. Il ne fait
 * que le révéler — la bande de leurres, la durée, le son sont de l'affichage.
 * Recharger en plein spin ne change pas une carte.
 *
 * C'est le même moteur que le rail vertical des duels, sur l'autre
 * axe : la feuille de style pose les tuiles en largeur, le hook mesure ce
 * qu'elle a posé et anime `translate3d` sur X.
 */

/**
 * La largeur d'une carte du rail, au format `sizes` : un peu moins d'un tiers
 * de l'écran sur un téléphone, un sixième au-delà (mesurée : 118 px sur 390,
 * 214 sur 1 440, 420 sur 2 560). Le navigateur y prend la vignette de 480 px,
 * et l'illustration entière sur un très grand écran dense.
 */
export const LARGEUR_RAIL = '(max-width: 640px) 31vw, 17vw';

export interface CarteRailPack {
  cardId: string;
  name: string;
  rarity: string;
  glyph: string;
  description?: string;
  power?: number;
  nature?: 'bonus' | 'malus';
}

export function RailPack({
  pool,
  poids,
  gagnante,
  duree,
  sourdine = false,
  entree,
  enAttente = false,
  entame = 0,
  depuis,
  onFini,
}: {
  /** Tout ce qu'on peut montrer en leurre — les cartes du pack. */
  pool: CarteRailPack[];
  /** Les taux d'affichage du pack, sur 100 000. */
  poids: Record<string, number>;
  /** La carte tirée par le serveur. */
  gagnante: CarteRailPack;
  /** La durée nominale d'une course, en ms. Zéro pour une révélation directe. */
  duree: number;
  /** Sans un bruit : l'overlay du stream ne sonne que si on le lui demande. */
  sourdine?: boolean;
  /**
   * Les cartes posées au départ, à partir du deuxième rang de la bande : les
   * premières visibles. L'overlay y met celles sur lesquelles finit sa vidéo
   * d'ouverture, pour que le rail en prenne le relais sans coupure. Ce ne sont
   * que des leurres : la carte tirée reste au bout de la course.
   */
  entree?: CarteRailPack[];
  /** Posé à son départ sans tourner, sous la vidéo d'ouverture. */
  enAttente?: boolean;
  /** Les millisecondes de course déjà faites par la vidéo : il reprend là. */
  entame?: number;
  /** L'instant où la course en était à `entame` (voir `useSpinAnimation`). */
  depuis?: number;
  onFini: () => void;
}) {
  // La bande est construite une fois, au montage, et plus jamais : un
  // `useMemo` pourrait être rejoué par React sous les pieds de l'animation.
  const [bande] = useState(() => {
    const b = construitBande(pool, gagnante, poids, Math.random);
    entree?.forEach((carte, i) => {
      if (1 + i < RANG_GAGNANT) b[1 + i] = carte;
    });
    return b;
  });

  const cadre = useRef<HTMLDivElement>(null);

  const metaTuiles = useMemo(
    () => [
      bande.map((carte) => {
        const m = RARITY_META[carte.rarity as Rarity] ?? RARITY_META.C;
        return { rang: RARITY_ORDER[carte.rarity as Rarity] ?? 0, couleur: m.color };
      }),
    ],
    [bande],
  );

  /*
   * Les tuiles, rendues une fois avec la bande. Un rendu du parent pendant la
   * course — `router.refresh()` juste après le clic — retrouve les mêmes
   * éléments et n'a rien à recalculer : quarante cartes de moins à comparer
   * au moment où le rail démarre.
   */
  const tuilesRendues = useMemo(
    () =>
      bande.map((carte, k) => {
        const m = RARITY_META[carte.rarity as Rarity] ?? RARITY_META.C;
        return (
          <div
            key={k}
            className={`rail-carte${k === RANG_GAGNANT ? ' rail-carte-gagnante' : ''}`}
            data-rang={RARITY_ORDER[carte.rarity as Rarity] ?? 0}
            style={{ ['--r' as string]: m.color, ['--k' as string]: String(k) }}
            aria-hidden="true"
          >
            <CardFrame
              cardId={carte.cardId}
              name={carte.name}
              description={carte.description}
              rarity={carte.rarity}
              glyph={carte.glyph}
              nature={carte.nature}
              largeur={LARGEUR_RAIL}
            />
          </div>
        );
      }),
    [bande],
  );

  const rang = RARITY_ORDER[gagnante.rarity as Rarity] ?? 0;

  useSpinAnimation({
    cadre,
    bandes: 1,
    tuiles: metaTuiles,
    duree,
    courbe: COURBE_MESUREE,
    axe: 'x',
    sourdine,
    enAttente,
    entame,
    depuis,
    repos: REPOS_OUVERTURE,
    onFini,
  });

  const meta = RARITY_META[gagnante.rarity as Rarity] ?? RARITY_META.C;

  return (
    <div className="rail-scene rail-scene-x">
      <div
        className="rail rail-x"
        ref={cadre}
        style={{ ['--bandes' as string]: 1, ['--gagne' as string]: meta.color }}
        role="img"
        aria-label="Tirage d’une carte en cours"
      >
        <div
          className="rail-fenetre"
          {...{ [ATTR_FENETRE]: '' }}
          data-arrete="false"
          data-rang={rang}
          style={{ ['--gagne' as string]: meta.color }}
        >
          <div className="rail-ruban" {...{ [ATTR_RUBAN]: '' }}>
            {tuilesRendues}
          </div>
        </div>

        <span className="rail-repere" aria-hidden="true" />
        <span className="rail-voile rail-voile-avant" aria-hidden="true" />
        <span className="rail-voile rail-voile-apres" aria-hidden="true" />
      </div>
    </div>
  );
}
