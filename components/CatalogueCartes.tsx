'use client';

import { useState } from 'react';
import { FiltreRarete } from '@/components/FiltreRarete';
import { CardTile } from '@/components/ui';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITIES, type Rarity } from '@/lib/domain/types';

export interface CarteCatalogue {
  id: string;
  name: string;
  description: string;
  rarity: string;
  glyph: string;
  power: number;
  nature: 'bonus' | 'malus';
  quote: number | null;
}

/**
 * Le catalogue des 24 cartes, filtrable par rareté.
 *
 * Le filtre **masque des sections** au lieu d'aplatir la grille. La différence
 * compte : le catalogue est rangé par rareté, et c'est son seul rangement
 * depuis que les familles ont disparu. Aplatir la liste ferait perdre les
 * intertitres, donc l'information même qu'on est venu chercher — et une
 * sélection de deux raretés se lirait comme un tas de cartes sans ordre.
 *
 * Le filtrage est local et non dans l'URL : vingt-quatre cartes tiennent en
 * mémoire, la bascule est instantanée, et il n'y a rien ici qu'on ait envie de
 * partager par lien — la page d'une carte, elle, en a déjà un.
 */
export function CatalogueCartes({ cartes }: { cartes: CarteCatalogue[] }) {
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const bascule = (rarity: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });

  // Une sélection vide veut dire « toutes », jamais « aucune » : un filtre qui
  // vide l'écran quand on désélectionne la dernière pastille se lit comme un bug.
  const retenues = [...RARITIES].reverse().filter((r) => selection.size === 0 || selection.has(r));
  const visibles = cartes.filter((c) => selection.size === 0 || selection.has(c.rarity));

  return (
    <div className="space-y-5">
      <FiltreRarete
        selection={selection}
        onToggle={bascule}
        onReset={() => setSelection(new Set())}
      >
        {visibles.length} carte{visibles.length > 1 ? 's' : ''} sur {cartes.length}
      </FiltreRarete>

      {retenues.map((rarity) => {
        const meta = RARITY_META[rarity as Rarity];
        const cards = cartes.filter((c) => c.rarity === rarity);
        if (cards.length === 0) return null;

        return (
          <div key={rarity}>
            <div
              className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 pl-3"
              style={{ borderColor: meta.color }}
            >
              <h3 className="font-display text-lg font-black tracking-wide uppercase">
                <span style={{ color: meta.color }}>{meta.label}</span>
              </h3>
              <span className="ml-auto text-[13px] text-muted">
                <span className="num">{cards.length}</span> carte{cards.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {cards.map((card) => (
                <CardTile
                  key={card.id}
                  cardId={card.id}
                  name={card.name}
                  subtitle={card.description}
                  rarity={card.rarity}
                  glyph={card.glyph}
                  power={card.power}
                  quote={card.quote}
                  nature={card.nature}
                  href={`/marche/${card.id}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
