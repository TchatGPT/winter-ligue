'use client';

import { useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import {
  EcranAdmin,
  Filtres,
  Panneau,
  Pastille,
  Recherche,
  Tableau,
  parNombre,
  parTexte,
  plat,
} from '@/components/admin/Kit';
import { flakes } from '@/components/ui';
import { shortDateTime } from '@/lib/format';

export interface LigneJoueur {
  id: string;
  pseudo: string;
  slug: string;
  role: 'joueur' | 'admin';
  /** Le pseudo en jeu, que la lecture des captures compare aux noms lus. */
  activisionId: string | null;
  snowflakes: number;
  /** Ses Boosters Perso en attente. Ils se règlent dans le classement, sous le pseudo. */
  boostersPerso: number;
  /** La streameuse ne joue pas. */
  streameuse: boolean;
  games: number;
  score: number;
  inscritLe: string;
}

type Filtre = 'tous' | 'sansActivision' | 'boosters' | 'modo';

/**
 * Les joueurs de la ligue.
 *
 * Ils arrivent par Twitch, et leur rôle suit la chaîne. On y corrige le pseudo
 * Activision — celui que la lecture des captures cherche sur le tableau de fin
 * de game : un joueur jamais reconnu, c'est ici qu'on regarde — et on y voit
 * ses games, ses points, ses flocons et ses Boosters Perso en attente.
 */
export function EcranJoueurs({ joueurs }: { joueurs: LigneJoueur[] }) {
  const { busy, message, envoie, setMessage } = useAction();
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');

  const garde = (p: LigneJoueur, f: Filtre) =>
    f === 'sansActivision'
      ? !p.streameuse && !p.activisionId
      : f === 'boosters'
        ? p.boostersPerso > 0
        : f === 'modo'
          ? p.role === 'admin'
          : true;

  const visibles = useMemo(() => {
    const q = plat(recherche.trim());
    return joueurs.filter(
      (p) => garde(p, filtre) && (!q || plat(p.pseudo).includes(q) || plat(p.activisionId ?? '').includes(q)),
    );
  }, [joueurs, recherche, filtre]);

  return (
    <EcranAdmin
      intro="Les joueurs arrivent tout seuls en se connectant avec Twitch. Ici, on vérifie leur pseudo en jeu et où ils en sont."
      grille="seul"
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      <Panneau
        icone="user"
        titre={`${visibles.length} joueur${visibles.length > 1 ? 's' : ''}`}
        sousTitre="Le pseudo Activision est celui qu’on lit sur les captures de fin de game : sans lui, ses games ne se reconnaissent pas toutes seules."
        defile
      >
        <div className="adm-outils">
          <Recherche
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Chercher un pseudo Twitch ou Activision…"
          />
          <Filtres
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { cle: 'tous', nom: 'Tous', compte: joueurs.length },
              {
                cle: 'sansActivision',
                nom: 'Sans pseudo Activision',
                compte: joueurs.filter((p) => garde(p, 'sansActivision')).length,
              },
              {
                cle: 'boosters',
                nom: 'Avec Booster Perso',
                compte: joueurs.filter((p) => garde(p, 'boosters')).length,
              },
              { cle: 'modo', nom: 'Modération', compte: joueurs.filter((p) => garde(p, 'modo')).length },
            ]}
          />
        </div>
        <Tableau
          lignes={visibles}
          cleDe={(p) => p.id}
          triDefaut={{ cle: 'score', desc: true }}
          vide={recherche.trim() ? 'Aucun pseudo ne correspond.' : 'Aucun joueur dans ce filtre.'}
          colonnes={[
            {
              cle: 'pseudo',
              titre: 'Joueur',
              principale: true,
              largeur: 'minmax(0, 1.4fr)',
              tri: parTexte((p) => p.pseudo),
              rendu: (p) => (
                <span className="adm-joueur">
                  <a href={`/joueurs/${p.slug}`} className="no-underline">
                    {p.pseudo}
                  </a>
                  {p.streameuse ? (
                    <Pastille ton="violet">streameuse</Pastille>
                  ) : (
                    p.role === 'admin' && <Pastille ton="glace">modération</Pastille>
                  )}
                </span>
              ),
            },
            {
              cle: 'activision',
              titre: 'Pseudo Activision',
              largeur: 'minmax(0, 1.5fr)',
              tri: parTexte((p) => p.activisionId ?? ''),
              rendu: (p) =>
                p.streameuse ? (
                  <span className="text-faint">ne joue pas</span>
                ) : (
                  <Activision
                    joueur={p}
                    busy={busy === `activision:${p.id}`}
                    enregistre={(valeur) =>
                      envoie(
                        '/api/players',
                        { playerId: p.id, activisionId: valeur || null },
                        {
                          methode: 'PATCH',
                          cle: `activision:${p.id}`,
                          succes: `${p.pseudo} : pseudo Activision enregistré.`,
                        },
                      )
                    }
                  />
                ),
            },
            {
              cle: 'games',
              titre: 'Games',
              align: 'droite',
              largeur: '5.5rem',
              tri: parNombre((p) => p.games),
              rendu: (p) => <span className="num">{p.games}</span>,
            },
            {
              cle: 'score',
              titre: 'Points',
              align: 'droite',
              largeur: '5.5rem',
              tri: parNombre((p) => p.score),
              rendu: (p) => <b className="num text-ice">{p.score}</b>,
            },
            {
              cle: 'flocons',
              titre: 'Flocons',
              align: 'droite',
              largeur: '7rem',
              tri: parNombre((p) => p.snowflakes),
              rendu: (p) => <span className="num">{flakes(p.snowflakes)} ❄</span>,
            },
            {
              cle: 'boosters',
              titre: 'Boosters Perso',
              align: 'droite',
              largeur: '8rem',
              tri: parNombre((p) => p.boostersPerso),
              rendu: (p) =>
                p.boostersPerso > 0 ? (
                  <Pastille ton="aurore">{p.boostersPerso} à ouvrir</Pastille>
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
            {
              cle: 'inscrit',
              titre: 'Arrivé le',
              align: 'droite',
              largeur: '7.5rem',
              tri: parTexte((p) => p.inscritLe),
              rendu: (p) => <time className="adm-date">{shortDateTime(p.inscritLe)}</time>,
            },
          ]}
        />
      </Panneau>
    </EcranAdmin>
  );
}

/** Le pseudo Activision d'un joueur, à corriger sur place. */
function Activision({
  joueur,
  busy,
  enregistre,
}: {
  joueur: LigneJoueur;
  busy: boolean;
  enregistre: (valeur: string) => Promise<unknown>;
}) {
  const [valeur, setValeur] = useState(joueur.activisionId ?? '');
  const modifie = valeur.trim() !== (joueur.activisionId ?? '');
  return (
    <form
      className="adm-activision"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistre(valeur.trim());
      }}
    >
      <input
        className="field"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        maxLength={40}
        placeholder="à renseigner"
        data-vide={joueur.activisionId ? undefined : ''}
        aria-label={`Pseudo Activision de ${joueur.pseudo}`}
      />
      {modifie && (
        <button className="btn btn-sm btn-ice" disabled={busy}>
          {busy ? '…' : 'OK'}
        </button>
      )}
    </form>
  );
}
