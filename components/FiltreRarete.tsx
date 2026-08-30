'use client';

import { RarityIcon } from '@/components/RarityIcon';
import { rarityMeta } from '@/components/ui';
import { RARITIES } from '@/lib/domain/types';

/**
 * La barre de filtre par rareté.
 *
 * Six pastilles à bascule, et un bouton pour tout rouvrir. Elle vivait dans
 * l'hôtel des ventes ; le catalogue et la collection en avaient besoin à leur
 * tour, et trois copies d'un même filtre finissent toujours par diverger — un
 * ordre ici, une teinte là.
 *
 * ## Pourquoi des bascules et non un choix unique
 *
 * On veut souvent voir « les ultra rares et les légendaires » d'un coup, jamais
 * « la troisième rareté seulement ». Un groupe de boutons radio interdirait la
 * première lecture pour n'autoriser que la seconde.
 *
 * Le composant est contrôlé : c'est l'appelant qui tient la sélection. Il en a
 * besoin de toute façon pour filtrer sa propre liste, et un état dupliqué entre
 * la barre et la grille se désynchronise au premier rendu qui les sépare.
 */
export function FiltreRarete({
  selection,
  onToggle,
  onReset,
  children,
}: {
  /** Raretés retenues. Vide signifie « toutes », jamais « aucune ». */
  selection: Set<string>;
  onToggle: (rarity: string) => void;
  onReset: () => void;
  /** Info libre poussée à droite de la barre — un décompte, en général. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* De la plus rare à la plus commune : c'est ce qu'on cherche en premier. */}
      {[...RARITIES].reverse().map((r) => {
        const meta = rarityMeta(r);
        const active = selection.has(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => onToggle(r)}
            aria-pressed={active}
            aria-label={meta.label}
            title={meta.label}
            className="grid place-items-center rounded-md border px-2 py-1.5 transition-colors"
            style={{
              borderColor: active ? meta.color : 'var(--line-2)',
              color: active ? '#060a12' : meta.color,
              background: active ? meta.color : 'transparent',
            }}
          >
            <RarityIcon rarity={r} />
          </button>
        );
      })}

      {selection.size > 0 && (
        <button className="btn btn-sm btn-ghost" onClick={onReset}>
          Tout
        </button>
      )}

      {children && <span className="ml-auto text-[13px] text-faint">{children}</span>}
    </div>
  );
}
