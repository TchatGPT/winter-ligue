'use client';

import { useState } from 'react';
import { FiltreRarete } from '@/components/FiltreRarete';
import { CardTile } from '@/components/ui';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

export interface EntreeCollection {
  cardId: string;
  name: string;
  rarity: string;
  glyph: string;
  discovered: boolean;
  copies: number;
}

/**
 * La collection d'un joueur, filtrable par rareté.
 *
 * Contrairement au catalogue, la grille reste plate : on vient y chercher ce
 * qu'on a et ce qui manque, pas un rangement. Elle est simplement triée de la
 * légendaire à la commune, pour que les trous qui coûtent cher soient en haut.
 *
 * Le décompte de la barre annonce le nombre de cartes **découvertes** sur le
 * total affiché, et il suit le filtre : c'est la seule façon de répondre à
 * « combien me manque-t-il d'ultra rares ? » sans compter à l'écran.
 */
export function GrilleCollection({ entrees }: { entrees: EntreeCollection[] }) {
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const bascule = (rarity: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });

  const visibles = entrees
    .filter((e) => selection.size === 0 || selection.has(e.rarity))
    .sort(
      (a, b) =>
        (RARITY_ORDER[b.rarity as Rarity] ?? 0) - (RARITY_ORDER[a.rarity as Rarity] ?? 0) ||
        a.name.localeCompare(b.name, 'fr'),
    );

  const trouvees = visibles.filter((e) => e.discovered).length;

  return (
    <div className="space-y-3">
      <FiltreRarete
        selection={selection}
        onToggle={bascule}
        onReset={() => setSelection(new Set())}
        compte={(r) => {
          const palier = entrees.filter((e) => e.rarity === r);
          return `${palier.filter((e) => e.discovered).length}/${palier.length}`;
        }}
        aide="Sous chaque palier, ce que tu as découvert sur ce qu'il compte. Une carte jouée ou vendue reste découverte."
      >
        <span className="num">{trouvees}</span> / {visibles.length} découverte
        {visibles.length > 1 ? 's' : ''}
      </FiltreRarete>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visibles.map((entry) => (
          <CardTile
            key={entry.cardId}
            cardId={entry.cardId}
            name={entry.discovered ? entry.name : '???'}
            rarity={entry.rarity}
            glyph={entry.discovered ? entry.glyph : '❔'}
            copies={entry.copies}
            dimmed={!entry.discovered}
            footer={
              <span className="text-[13px] tracking-wider text-faint uppercase">
                {entry.discovered
                  ? entry.copies > 0
                    ? `${entry.copies} en réserve`
                    : 'Découverte — aucun exemplaire'
                  : 'Non découverte'}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}
