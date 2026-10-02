'use client';

import { useMemo, useState } from 'react';
import { libelleMultiplicateur } from '@/lib/domain/rules';

/** Au-delà, un champ filtre les pastilles par pseudo. */
const SEUIL_RECHERCHE = 8;

export interface CandidatBooster {
  id: string;
  pseudo: string;
  avatarUrl: string | null;
  chance: number;
  /** Combien de boosters de ce type l'attendent. */
  n: number;
}

/** Sans accent ni casse, pour que « Boreal » trouve « Boréal ». */
const plat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Pour qui s'ouvre un booster personnel (Perso, Finisseur) : une pastille
 * allumée par joueur qui en a un à ouvrir — son avatar, son pseudo, combien
 * l'attendent — et personne d'autre. Un joueur sans booster dû ne peut pas être
 * choisi : la liste déroulante les montrait tous, grisés, et il fallait les
 * faire défiler pour trouver les deux ou trois qui comptaient.
 *
 * Le plus souvent, zéro à trois pastilles, sur une ligne. Au-delà de huit, un
 * champ filtre par pseudo. La case garde sa hauteur, pastilles ou message :
 * changer de booster ne fait rien bouger dans la scène.
 *
 * Le choix ne fait que désigner : le serveur revérifie ce qui est dû.
 */
export function ChoixJoueurBooster({
  candidats,
  choisi,
  onChoix,
  fige,
  nomBooster,
  cache,
}: {
  candidats: CandidatBooster[];
  choisi: string;
  onChoix: (id: string) => void;
  fige: boolean;
  nomBooster: string;
  /** Booster collectif : la case reste là, invisible, pour garder la hauteur de la scène. */
  cache?: boolean;
}) {
  const [recherche, setRecherche] = useState('');
  const avecRecherche = candidats.length > SEUIL_RECHERCHE;

  const visibles = useMemo(() => {
    const q = plat(recherche.trim());
    return avecRecherche && q ? candidats.filter((c) => plat(c.pseudo).includes(q)) : candidats;
  }, [candidats, recherche, avecRecherche]);

  return (
    <div
      className={`choix-joueur ${cache ? 'invisible' : ''}`}
      data-beaucoup={avecRecherche ? '' : undefined}
      aria-hidden={cache || undefined}
    >
      {avecRecherche && (
        <input
          type="search"
          className="field w-full"
          placeholder="Chercher un joueur…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          autoComplete="off"
          aria-label="Chercher un joueur"
          disabled={fige}
        />
      )}

      {candidats.length === 0 ? (
        <p className="choix-joueur-vide">
          Aucun {nomBooster} à ouvrir pour l’instant. Le compteur de chaque joueur se règle dans Modération → Joueurs.
        </p>
      ) : (
        <ul className="choix-joueur-liste" aria-label="Pour quel joueur ouvrir">
          {visibles.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="choix-joueur-pastille"
                aria-pressed={choisi === c.id}
                onClick={() => onChoix(c.id)}
                disabled={fige}
                title={`${c.pseudo} : ${c.n} à ouvrir · chance ${libelleMultiplicateur(c.chance)}`}
              >
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="choix-joueur-avatar" src={c.avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="choix-joueur-avatar" aria-hidden="true">
                    {c.pseudo.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="choix-joueur-pseudo">{c.pseudo}</span>
                <span className="choix-joueur-nombre num" aria-label={`${c.n} à ouvrir`}>
                  {c.n}
                </span>
              </button>
            </li>
          ))}
          {visibles.length === 0 && <li className="choix-joueur-aucun">Personne ne s’appelle « {recherche.trim()} ».</li>}
        </ul>
      )}
    </div>
  );
}
