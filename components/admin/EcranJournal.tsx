'use client';

import { useMemo, useState } from 'react';
import { EcranAdmin, Panneau, Pastille, Recherche, Vide } from '@/components/admin/Kit';
import { shortDateTime } from '@/lib/format';

export interface LigneJournal {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

/** Les familles d'actions, pour filtrer sans connaître leurs noms techniques. */
const FAMILLES: { cle: string; nom: string; garde: (action: string) => boolean }[] = [
  { cle: 'tout', nom: 'Tout', garde: () => true },
  { cle: 'subs', nom: 'Subs', garde: (a) => a.startsWith('SUBS') || a.startsWith('SUB_') },
  {
    cle: 'boosters',
    nom: 'Boosters',
    garde: (a) => a.includes('BOOSTER') || a.includes('PACK') || a.includes('OUVERTURE'),
  },
  { cle: 'games', nom: 'Games', garde: (a) => a.includes('GAME') },
  {
    cle: 'flocons',
    nom: 'Flocons & codes',
    garde: (a) => a.startsWith('CODE') || a.includes('FLOCON') || a.includes('CADEAU'),
  },
  { cle: 'duels', nom: 'Duels', garde: (a) => a.includes('DUEL') || a.includes('BATAILLE') },
  {
    cle: 'comptes',
    nom: 'Comptes',
    garde: (a) => a.includes('ROLE') || a.includes('ACTIVISION') || a.includes('SESSION') || a.includes('JOUEUR'),
  },
];

/** « BOOSTER_PERSO_AJOUTE » → « booster perso ajouté ». */
const lisible = (action: string) =>
  action
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\bajoute\b/g, 'ajouté')
    .replace(/\bretire\b/g, 'retiré')
    .replace(/\bcree\b/g, 'créé')
    .replace(/\bdonne\b/g, 'donné')
    .replace(/\bgagne\b/g, 'gagné')
    .replace(/\benregistree\b/g, 'enregistrée');

/**
 * Le journal : chaque action de la modération, chaque carte jouée, chaque rôle
 * donné par Twitch. C'est ici qu'on répond à « pourquoi ce joueur a-t-il reçu
 * ça ? ». Il est en ajout seul : rien ne s'y efface, ni ici ni en base.
 */
export function EcranJournal({ entrees }: { entrees: LigneJournal[] }) {
  const [recherche, setRecherche] = useState('');
  const [famille, setFamille] = useState('tout');

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const garde = FAMILLES.find((f) => f.cle === famille)?.garde ?? (() => true);
    return entrees.filter(
      (e) =>
        garde(e.action) &&
        (!q ||
          e.actor.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.detail.toLowerCase().includes(q)),
    );
  }, [entrees, recherche, famille]);

  return (
    <EcranAdmin
      intro="Tout ce qui s’est passé dans la ligue, le plus récent en haut. Rien ne s’y efface."
      grille="seul"
    >
      <Panneau titre="Journal" sousTitre={`${visibles.length} sur les ${entrees.length} dernières entrées.`} defile>
        <div className="adm-outils">
          <Recherche
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Chercher un joueur, un montant, un code…"
          />
          <select
            className="field adm-select"
            value={famille}
            onChange={(e) => setFamille(e.target.value)}
            aria-label="Quel genre d’action"
          >
            {FAMILLES.map((f) => (
              <option key={f.cle} value={f.cle}>
                {f.nom}
              </option>
            ))}
          </select>
        </div>
        {visibles.length === 0 ? (
          <Vide>Rien ne correspond.</Vide>
        ) : (
          <ol className="adm-journal">
            {visibles.map((e) => (
              <li key={e.id}>
                <time>{shortDateTime(e.at)}</time>
                <div className="min-w-0">
                  <p>
                    <Pastille ton="glace">{lisible(e.action)}</Pastille> <b>{e.actor}</b>
                  </p>
                  <p className="adm-journal-detail">{e.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panneau>
    </EcranAdmin>
  );
}
