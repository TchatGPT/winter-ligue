'use client';

import { useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { flakes } from '@/components/ui';
import { UTILISATIONS_MAX } from '@/lib/domain/codes';
import { ECONOMY, PACKS_REGLES } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';

export type RoleJoueur = 'joueur' | 'admin';

export interface LigneJoueur {
  id: string;
  pseudo: string;
  slug: string;
  role: RoleJoueur;
  /** Le pseudo en jeu, que la reconnaissance des captures compare aux noms lus. */
  activisionId: string | null;
  snowflakes: number;
  /** Ses Boosters Perso en attente : le compteur que la modération règle. */
  boostersPerso: number;
  /** La streameuse ne joue pas : pas de compteur pour elle. */
  streameuse: boolean;
  games: number;
  score: number;
}

const LIBELLE_ROLE: Record<RoleJoueur, string> = { joueur: 'Joueur', admin: 'Modération' };

export interface LigneCode {
  id: string;
  code: string;
  montant: number;
  utilisations: number;
  utilisationsMax: number;
  etat: 'actif' | 'epuise' | 'desactive';
  creeLe: string;
}

const LIBELLE_ETAT: Record<LigneCode['etat'], string> = {
  actif: 'Actif',
  epuise: 'Épuisé',
  desactive: 'Désactivé',
};

/** Retire accents et casse, pour que « boreal » trouve « Boréal ». */
function plie(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Les joueurs et les codes cadeaux.
 *
 * Les joueurs arrivent par Twitch, et leur rôle suit la chaîne : il n'y a plus
 * ni inscription, ni rôle, ni flocons donnés à la main. Les flocons se donnent
 * par des codes : un montant, un nombre d'utilisations, et chaque joueur le tape
 * une fois derrière l'icône cadeau. Aucune carte ne se donne ici : une carte
 * sort d'un pack, ouvert à l'antenne, ou ne sort pas.
 */
export function EcranJoueurs({
  joueurs,
  codes,
  moiId,
}: {
  joueurs: LigneJoueur[];
  codes: LigneCode[];
  moiId: string | null;
}) {
  const { busy, message, envoie, setMessage } = useAction();

  const [recherche, setRecherche] = useState('');
  const [montant, setMontant] = useState(100);
  const [utilisationsMax, setUtilisationsMax] = useState(10);
  const [dernierCode, setDernierCode] = useState<{ code: string; annonce: boolean } | null>(null);
  /** Le code dont la suppression attend sa confirmation : un premier clic la propose. */
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  async function supprime(c: LigneCode) {
    const fait = await envoie(
      '/api/admin/codes',
      { id: c.id },
      { methode: 'DELETE', cle: `code:${c.id}`, succes: `${c.code} supprimé. Les flocons déjà versés restent.` },
    );
    setASupprimer(null);
    if (fait && dernierCode?.code === c.code) setDernierCode(null);
  }

  async function copie(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage({ kind: 'success', text: `${code} copié.` });
    } catch {
      setMessage({ kind: 'error', text: 'Copie impossible : sélectionne le code à la main.' });
    }
  }

  const visibles = useMemo(() => {
    const q = plie(recherche.trim());
    if (!q) return joueurs;
    return joueurs.filter((p) => plie(p.pseudo).includes(q) || plie(p.slug).includes(q));
  }, [joueurs, recherche]);

  return (
    <Ecran
      titre="Joueurs"
      lead="Les joueurs arrivent par Twitch. Ici : leur pseudo Activision, et les codes cadeaux qui distribuent les flocons — chaque code et chaque utilisation sont au journal."
      message={message}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Bloc
          titre="Créer un code cadeau"
          icone="cadeau"
          neige="admin-codes"
          aide="C’est ainsi que les flocons se donnent : un montant, un nombre de joueurs, et un code tiré au sort, aussitôt annoncé dans le tchat. Chacun le tape une fois, derrière le cadeau près de son solde. Celui qui crée un code ne peut pas s’en servir."
        >
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = await envoie(
                '/api/admin/codes',
                { montant, utilisationsMax },
                { cle: 'code-cree', succes: 'Code créé.' },
              );
              if (!data) return;
              const code = String(data.code);
              const tchat = data.tchat as { envoye?: boolean; detail?: string } | undefined;
              const annonce = tchat?.envoye === true;
              setDernierCode({ code, annonce });
              setMessage(
                annonce
                  ? { kind: 'success', text: `Code ${code} créé et annoncé dans le tchat.` }
                  : {
                      kind: 'error',
                      text: `Code ${code} créé, mais Twitch a refusé l’annonce dans le tchat${
                        tchat?.detail ? ` (${tchat.detail})` : ''
                      }. Le détail est au journal.`,
                    },
              );
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="code-montant">
                  Flocons par joueur
                </label>
                <input
                  id="code-montant"
                  type="number"
                  className="field num"
                  min={1}
                  max={ECONOMY.soldeMax}
                  value={Number.isFinite(montant) ? montant : ''}
                  onChange={(e) => setMontant(Math.floor(Number(e.target.value)))}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="code-utilisations">
                  Utilisations max
                </label>
                <input
                  id="code-utilisations"
                  type="number"
                  className="field num"
                  min={1}
                  max={UTILISATIONS_MAX}
                  value={Number.isFinite(utilisationsMax) ? utilisationsMax : ''}
                  onChange={(e) => setUtilisationsMax(Math.floor(Number(e.target.value)))}
                  required
                />
              </div>
            </div>
            <button
              className="btn btn-ice w-full"
              disabled={busy !== null || !(montant >= 1) || !(utilisationsMax >= 1)}
            >
              Créer le code
            </button>
          </form>

          {dernierCode && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-aurora/40 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] text-muted">
                  {dernierCode.annonce ? 'Code créé — annoncé dans le tchat' : 'Code créé — à annoncer sur le stream'}
                </p>
                <p className="truncate font-display text-2xl font-black tracking-[0.14em] text-ink">
                  {dernierCode.code}
                </p>
              </div>
              <button type="button" className="btn btn-sm shrink-0" onClick={() => copie(dernierCode.code)}>
                Copier
              </button>
            </div>
          )}
        </Bloc>

        <Bloc
          titre="Codes cadeaux"
          icone="snowflake"
          aide="Un code épuisé ou désactivé ne sert plus ; un code supprimé disparaît. Ce qu’il a versé reste versé, et le journal garde sa trace."
        >
          {codes.length === 0 ? (
            <p className="text-[13px] text-faint">Aucun code pour l’instant.</p>
          ) : (
            <div className="scroll-x admin-table">
              <table className="grid-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th className="text-right">Flocons</th>
                    <th className="text-right">Utilisations</th>
                    <th>État</th>
                    <th className="text-right" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <button
                          type="button"
                          className="font-display font-black tracking-[0.12em] text-ink hover:text-ice"
                          title="Copier le code"
                          onClick={() => copie(c.code)}
                        >
                          {c.code}
                        </button>
                        <div className="text-[12px] text-muted">{shortDateTime(c.creeLe)}</div>
                      </td>
                      <td className="num text-right text-ice">❄ {flakes(c.montant)}</td>
                      <td className="num text-right text-muted">
                        {c.utilisations} / {c.utilisationsMax}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={c.etat === 'actif' ? { borderColor: 'var(--aurora)', color: 'var(--aurora)' } : undefined}
                        >
                          {LIBELLE_ETAT[c.etat]}
                        </span>
                      </td>
                      <td className="text-right">
                        {aSupprimer === c.id ? (
                          <div className="inline-flex gap-1.5">
                            <button className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => supprime(c)}>
                              Supprimer {c.code}
                            </button>
                            <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setASupprimer(null)}>
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-1.5">
                            {c.etat === 'actif' && (
                              <button
                                className="btn btn-sm btn-ghost"
                                disabled={busy !== null}
                                onClick={() =>
                                  envoie(
                                    '/api/admin/codes',
                                    { id: c.id },
                                    { methode: 'PATCH', cle: `code:${c.id}`, succes: `${c.code} désactivé.` },
                                  )
                                }
                              >
                                Désactiver
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-ghost"
                              disabled={busy !== null}
                              title="Supprimer ce code pour de bon"
                              onClick={() => setASupprimer(c.id)}
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Bloc>
      </div>

      <Bloc
        titre={`${visibles.length} joueur${visibles.length > 1 ? 's' : ''}`}
        icone="user"
        aide="Le pseudo Activision est celui que la lecture des captures compare au tableau de fin de game."
        actions={
          <input
            className="field max-w-[220px]"
            placeholder="Rechercher…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher un joueur"
          />
        }
      >
        <div className="scroll-x admin-table">
          <table className="grid-table min-w-[820px]">
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Activision</th>
                <th>Rôle</th>
                <th className="text-right">Games</th>
                <th className="text-right">Points</th>
                <th className="text-right">Flocons</th>
                <th className="text-right" title={`Un Booster Perso tous les ${PACKS_REGLES.persoTousLes} subs offerts`}>
                  Boosters Perso
                </th>
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
                    <ActivisionCellule
                      joueur={p}
                      busy={busy === `activision:${p.id}`}
                      enregistre={(valeur) =>
                        envoie(
                          '/api/players',
                          { playerId: p.id, activisionId: valeur || null },
                          { methode: 'PATCH', cle: `activision:${p.id}`, succes: `${p.pseudo} : pseudo Activision enregistré.` },
                        )
                      }
                    />
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={
                        p.role === 'admin' ? { borderColor: 'var(--ice)', color: 'var(--ice)' } : undefined
                      }
                    >
                      {LIBELLE_ROLE[p.role]}
                    </span>
                  </td>
                  <td className="num text-right text-muted">{p.games}</td>
                  <td className="num text-right text-ice">{p.score}</td>
                  <td className="num text-right text-faint">❄ {flakes(p.snowflakes)}</td>
                  <td className="text-right">
                    {p.streameuse ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <div className="compteur-perso" data-vide={p.boostersPerso === 0 ? '' : undefined}>
                        <button
                          type="button"
                          aria-label={`Retirer un Booster Perso à ${p.pseudo}`}
                          disabled={busy !== null || p.boostersPerso === 0 || p.id === moiId}
                          onClick={() =>
                            envoie(
                              '/api/admin/boosters-perso',
                              { playerId: p.id, sens: 'moins' },
                              { cle: `perso:${p.id}`, succes: `${p.pseudo} : un Booster Perso en moins.` },
                            )
                          }
                        >
                          −
                        </button>
                        <span className="num">{p.boostersPerso}</span>
                        <button
                          type="button"
                          aria-label={`Ajouter un Booster Perso à ${p.pseudo}`}
                          disabled={busy !== null || p.id === moiId}
                          onClick={() =>
                            envoie(
                              '/api/admin/boosters-perso',
                              { playerId: p.id, sens: 'plus' },
                              { cle: `perso:${p.id}`, succes: `${p.pseudo} : un Booster Perso en plus.` },
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>
    </Ecran>
  );
}

/**
 * Le pseudo Activision d'un joueur, à corriger sur place.
 *
 * C'est le nom que la lecture des captures compare aux lignes du tableau de
 * fin de game : quand un joueur n'est jamais reconnu, c'est ici qu'on regarde.
 */
function ActivisionCellule({
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
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistre(valeur.trim());
      }}
    >
      <input
        className="field !py-1 text-sm"
        style={{ minWidth: 150 }}
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        maxLength={40}
        placeholder="non renseigné"
        aria-label={`Pseudo Activision de ${joueur.pseudo}`}
      />
      {modifie && (
        <button className="btn btn-sm" disabled={busy}>
          {busy ? '…' : 'OK'}
        </button>
      )}
    </form>
  );
}
