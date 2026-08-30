'use client';

import { useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { flakes } from '@/components/ui';
import { CARDS } from '@/lib/domain/catalog';

export type RoleJoueur = 'joueur' | 'moderateur' | 'admin';

export interface LigneJoueur {
  id: string;
  pseudo: string;
  slug: string;
  role: RoleJoueur;
  snowflakes: number;
  games: number;
  score: number;
}

const ROLES: { id: RoleJoueur; label: string; aide: string }[] = [
  { id: 'joueur', label: 'Joueur', aide: 'Participe, rien de plus.' },
  {
    id: 'moderateur',
    label: 'Modérateur',
    aide: 'Saisit les games, crédite, ouvre et ferme la boutique.',
  },
  { id: 'admin', label: 'Admin', aide: 'Tout cela, plus les prix, les taux et les rôles.' },
];

/** Retire accents et casse, pour que « boreal » trouve « Boréal ». */
function plie(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Les joueurs : la table, l'inscription, les attributions et les rôles.
 *
 * Tout ce qui concerne une personne est sur le même écran. C'est le seul
 * découpage qui tienne à l'usage : on cherche un joueur parce qu'il s'est passé
 * quelque chose avec lui, et ce qu'on veut faire ensuite — le créditer, lui
 * donner une carte, le promouvoir — n'est pas connu d'avance.
 */
export function EcranJoueurs({
  joueurs,
  estAdmin,
}: {
  joueurs: LigneJoueur[];
  estAdmin: boolean;
}) {
  const { busy, message, envoie } = useAction();

  const [recherche, setRecherche] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [twitch, setTwitch] = useState('');
  const [cible, setCible] = useState('');
  const [flocons, setFlocons] = useState(0);
  const [carte, setCarte] = useState('');
  const [motif, setMotif] = useState('');

  const visibles = useMemo(() => {
    const q = plie(recherche.trim());
    if (!q) return joueurs;
    return joueurs.filter((p) => plie(p.pseudo).includes(q) || plie(p.slug).includes(q));
  }, [joueurs, recherche]);

  return (
    <Ecran
      titre="Joueurs"
      lead="Inscrire, créditer, promouvoir. Chaque attribution exige un motif et laisse une trace au journal."
      message={message}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc
          titre="Inscrire un joueur"
          aide="En attendant la connexion Twitch. Le joueur reçoit sa dotation de départ."
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fait = await envoie('/api/players', { pseudo, twitchLogin: twitch || null });
              if (fait) {
                setPseudo('');
                setTwitch('');
              }
            }}
          >
            <div>
              <label className="label" htmlFor="new-pseudo">
                Pseudo
              </label>
              <input
                id="new-pseudo"
                className="field"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                minLength={2}
                maxLength={24}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="new-twitch">
                Chaîne Twitch (facultatif)
              </label>
              <input
                id="new-twitch"
                className="field"
                value={twitch}
                onChange={(e) => setTwitch(e.target.value)}
                pattern="[a-zA-Z0-9_]{3,25}"
                placeholder="pseudo_twitch"
              />
            </div>
            <button className="btn btn-ice w-full" disabled={busy !== null || pseudo.length < 2}>
              Inscrire
            </button>
          </form>
        </Bloc>

        <Bloc
          titre="Attribuer flocons ou carte"
          aide="Un motif est obligatoire : c'est lui qu'on relira dans le journal le jour où quelqu'un demandera pourquoi."
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fait = await envoie('/api/admin/grant', {
                playerId: cible,
                ...(flocons !== 0 ? { snowflakes: flocons } : {}),
                ...(carte ? { cardId: carte } : {}),
                reason: motif,
              });
              if (fait) {
                setFlocons(0);
                setCarte('');
                setMotif('');
              }
            }}
          >
            <div>
              <label className="label" htmlFor="grant-joueur">
                Joueur
              </label>
              <select
                id="grant-joueur"
                className="field"
                value={cible}
                onChange={(e) => setCible(e.target.value)}
                required
              >
                <option value="">— Choisir —</option>
                {joueurs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pseudo} — ❄ {flakes(p.snowflakes)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="grant-flocons">
                  Flocons (±)
                </label>
                <input
                  id="grant-flocons"
                  type="number"
                  className="field num"
                  value={flocons}
                  onChange={(e) => setFlocons(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="grant-carte">
                  Carte
                </label>
                <select
                  id="grant-carte"
                  className="field"
                  value={carte}
                  onChange={(e) => setCarte(e.target.value)}
                >
                  <option value="">Aucune</option>
                  {CARDS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="grant-motif">
                Motif
              </label>
              <input
                id="grant-motif"
                className="field"
                maxLength={140}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                required
                placeholder="Ex. : lot du défi du samedi"
              />
            </div>
            <button
              className="btn btn-ice w-full"
              disabled={busy !== null || !cible || !motif || (flocons === 0 && carte === '')}
            >
              Attribuer
            </button>
          </form>
        </Bloc>
      </div>

      <section className="glass">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
          <h3 className="font-display text-sm font-black tracking-wider text-ink uppercase">
            {visibles.length} joueur{visibles.length > 1 ? 's' : ''}
          </h3>
          <input
            className="field ml-auto max-w-xs"
            placeholder="Rechercher…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher un joueur"
          />
        </div>

        <div className="scroll-x">
          <table className="grid-table min-w-[720px]">
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Rôle</th>
                <th className="text-right">Games</th>
                <th className="text-right">Points</th>
                <th className="text-right">Flocons</th>
                <th className="text-right">{estAdmin ? 'Changer le rôle' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={`/joueurs/${p.slug}`} className="text-ink no-underline hover:text-ice">
                      {p.pseudo}
                    </a>
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={
                        p.role === 'admin'
                          ? { borderColor: 'var(--gold)', color: 'var(--gold)' }
                          : p.role === 'moderateur'
                            ? { borderColor: 'var(--ice)', color: 'var(--ice)' }
                            : undefined
                      }
                    >
                      {ROLES.find((r) => r.id === p.role)?.label ?? p.role}
                    </span>
                  </td>
                  <td className="num text-right text-muted">{p.games}</td>
                  <td className="num text-right text-ice">{p.score}</td>
                  <td className="num text-right text-faint">❄ {flakes(p.snowflakes)}</td>
                  <td className="text-right">
                    {estAdmin && (
                      <div className="inline-flex gap-1.5">
                        {ROLES.filter((r) => r.id !== p.role).map((r) => (
                          <button
                            key={r.id}
                            className="btn btn-sm"
                            title={r.aide}
                            disabled={busy !== null}
                            onClick={() =>
                              envoie(
                                '/api/admin/roles',
                                { playerId: p.id, role: r.id },
                                { cle: p.id, succes: `${p.pseudo} : ${r.label.toLowerCase()}.` },
                              )
                            }
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Ecran>
  );
}
