'use client';

import { useMemo, useState } from 'react';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { EmptyState } from '@/components/ui';
import { shortDateTime } from '@/lib/format';

export interface LigneJournal {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

/**
 * Le journal d'audit, filtrable.
 *
 * Le filtre porte sur les trois colonnes à la fois. On ne sait pas d'avance si
 * on cherche un joueur, un type d'action ou un montant : on tape ce dont on se
 * souvient. Le journal est en ajout seul — rien ne s'y efface, ni ici ni en
 * base.
 */
export function EcranJournal({ entrees }: { entrees: LigneJournal[] }) {
  const [filtre, setFiltre] = useState('');
  const [action, setAction] = useState('');

  const actions = useMemo(() => [...new Set(entrees.map((e) => e.action))].sort(), [entrees]);

  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return entrees.filter((e) => {
      if (action && e.action !== action) return false;
      if (!q) return true;
      return (
        e.actor.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.detail.toLowerCase().includes(q)
      );
    });
  }, [entrees, filtre, action]);

  return (
    <Ecran
      titre="Journal"
      lead="Chaque action de modération, chaque carte jouée, chaque entrée par mot de passe. C’est ici qu’on répond à « pourquoi ce joueur a-t-il reçu ça ? »."
    >
      <Bloc
        titre={`${visibles.length} ligne${visibles.length > 1 ? 's' : ''} sur ${entrees.length}`}
        icone="book"
        neige="admin-journal"
        aide="Les trois cents dernières, la plus récente en tête."
      >
        <div className="admin-barre-outils">
          <input
            className="field flex-1"
            placeholder="Rechercher un joueur, une action, un montant…"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            aria-label="Rechercher dans le journal"
          />
          <select
            className="field sm:max-w-[240px]"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filtrer par action"
          >
            <option value="">Toutes les actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {visibles.length === 0 ? (
          <EmptyState title="Rien à afficher" hint="Aucune entrée ne correspond au filtre." />
        ) : (
          <ol className="admin-journal">
            {visibles.map((e) => (
              <li key={e.id}>
                <time>{shortDateTime(e.at)}</time>
                <span className="admin-journal-action">{e.action.replaceAll('_', ' ').toLowerCase()}</span>
                <span className="admin-journal-acteur">{e.actor}</span>
                <p className="admin-journal-detail">{e.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </Bloc>
    </Ecran>
  );
}
