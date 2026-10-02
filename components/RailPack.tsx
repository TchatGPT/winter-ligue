'use client';

import { useMemo, useRef, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { ATTR_FENETRE, ATTR_RUBAN, useSpinAnimation } from '@/components/useSpinAnimation';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { construitBande } from '@/lib/spin/bande';
import { COURBE_MESUREE, RANG_GAGNANT } from '@/lib/spin/courbe';

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
  onFini: () => void;
}) {
  // La bande est construite une fois, au montage, et plus jamais : un
  // `useMemo` pourrait être rejoué par React sous les pieds de l'animation.
  const [bande] = useState(() => construitBande(pool, gagnante, poids, Math.random));

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

  const rang = RARITY_ORDER[gagnante.rarity as Rarity] ?? 0;

  useSpinAnimation({
    cadre,
    bandes: 1,
    tuiles: metaTuiles,
    duree,
    courbe: COURBE_MESUREE,
    axe: 'x',
    rang,
    bandeMeilleure: 0,
    sourdine,
    onFini,
  });

  const meta = RARITY_META[gagnante.rarity as Rarity] ?? RARITY_META.C;

  return (
    <div className="rail-scene rail-scene-x">
      <div
        className="rail rail-x"
        ref={cadre}
        style={{ ['--bandes' as string]: 1 }}
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
            {bande.map((carte, k) => {
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
                  />
                </div>
              );
            })}
          </div>
        </div>

        <span className="rail-repere" aria-hidden="true" />
        <span className="rail-voile rail-voile-avant" aria-hidden="true" />
        <span className="rail-voile rail-voile-apres" aria-hidden="true" />
      </div>
    </div>
  );
}
