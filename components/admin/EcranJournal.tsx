'use client';

import { useMemo, useState } from 'react';
import { Ecran } from '@/components/admin/Cadre';
import { EmptyState } from '@/components/ui';
import { shortDateTime } from '@/lib/format';

export interface LigneJournal {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

/**
 * Le journal d'audit, filtrable.
 *
 * Il était affiché en bas d'une page déjà longue, tronqué aux quarante
 * dernières lignes et sans filtre — c'est-à-dire illisible dès qu'on cherchait
 * quelque chose de précis, ce qui est le seul moment où on le consulte.
 *
 * Le filtre porte sur les trois colonnes à la fois. On ne sait pas d'avance si
 * on cherche un joueur, un type d'action ou un montant : on tape ce dont on se
 * souvient.
 */
export function EcranJournal({ entrees }: { entrees: LigneJournal[] }) {
  const [filtre, setFiltre] = useState('');
  const [action, setAction] = useState('');

  const actions = useMemo(
    () => [...new Set(entrees.map((e) => e.action))].sort(),
    [entrees],
  );

  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return entrees.filter((e) => {
      if (action && e.action !== action) return false;
      if (!q) return true;
      return (
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q)
      );
    });
  }, [entrees, filtre, action]);

  return (
    <Ecran
      titre="Journal"
      lead="Chaque action de modération, chaque carte jouée, chaque vente conclue. C’est ici qu’on répond à « pourquoi ce joueur a-t-il reçu ça ? »."
    >
      <section className="glass">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <input
            className="field max-w-xs flex-1"
            placeholder="Rechercher dans le journal…"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            aria-label="Rechercher"
          />
          <select
            className="field max-w-[220px]"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filtrer par action"
          >
            <option value="">Toutes les actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[13px] text-faint">
            {visibles.length} sur {entrees.length}
          </span>
        </div>

        {visibles.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Rien à afficher" hint="Aucune entrée ne correspond au filtre." />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Acteur</th>
                  <th>Action</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td className="text-xs whitespace-nowrap text-faint">{shortDateTime(e.at)}</td>
                    <td className="text-xs text-muted">{e.actor.slice(0, 8)}</td>
                    <td className="text-xs text-ink">{e.action.replaceAll('_', ' ')}</td>
                    <td className="text-xs text-muted">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Ecran>
  );
}
