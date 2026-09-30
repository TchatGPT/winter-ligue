'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { Notice, flakes } from '@/components/ui';
import { PACKS_REGLES, SUBS, nextMilestone } from '@/lib/domain/rules';

export interface ConfigSaison {
  maxGamesPerPlayer: number;
  totalSubs: number;
}

export interface JoueurSubs {
  id: string;
  pseudo: string;
  subsOfferts: number;
}

export interface RetourSubs {
  kind: 'success' | 'error';
  text: string;
}

/** Les subs Twitch : branchés ou non, et ce que dit le retour du branchement. */
export interface TwitchSubs {
  configure: boolean;
  /** L'état des abonnements chez Twitch ; null s'il n'a pas répondu. */
  etat: { types: { type: string; statut: string | null }[]; branche: boolean } | null;
  retour: RetourSubs | null;
}

const NOMS_ABONNEMENTS: Record<string, string> = {
  'channel.subscribe': 'Nouveaux subs',
  'channel.subscription.gift': 'Subs offerts',
  'channel.subscription.message': 'Réabonnements',
};

function libelleStatut(statut: string | null): string {
  if (statut === 'enabled') return 'actif';
  if (statut === 'webhook_callback_verification_pending') return 'vérification en cours';
  if (statut === null) return 'absent';
  return `coupé (${statut})`;
}

/**
 * Ce qui se règle une fois, ou une fois par soir : les subs, la limite de
 * games, la sauvegarde. Les deux dernières touchent aux règles de la saison :
 * elles sont réservées aux administrateurs, et le serveur le revérifie.
 *
 * Deux compteurs de subs, et la distinction compte. Le compteur de saison
 * verse à tout le monde et met les packs collectifs en file. Les subs offerts
 * par un joueur nommé lui valent ses packs Perso — c'est la seule chose qu'un
 * sub achète à quelqu'un en particulier, et elle passe par la file, jamais par
 * un versement direct.
 */
export function EcranSaison({
  config,
  joueurs,
  packsEnFile,
  estAdmin,
  twitch,
}: {
  config: ConfigSaison;
  joueurs: JoueurSubs[];
  packsEnFile: number;
  estAdmin: boolean;
  twitch: TwitchSubs;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [maxGames, setMaxGames] = useState(config.maxGamesPerPlayer);
  const [gifteur, setGifteur] = useState('');
  const [subsGifteur, setSubsGifteur] = useState<number>(PACKS_REGLES.persoTousLes);
  const [dernierVersement, setDernierVersement] = useState<string | null>(null);

  const prochain = nextMilestone(config.totalSubs);
  const branche = twitch.etat?.branche === true;
  const joueurChoisi = joueurs.find((j) => j.id === gifteur);

  async function ajouteSubs(delta: number) {
    const data = await envoie(
      '/api/admin/subs',
      { action: 'subs', delta },
      { cle: `subs-${delta}`, succes: 'Subs enregistrés.' },
    );
    if (!data) return;
    const d = data as {
      milestones: string[];
      snowflakesEach: number;
      packs: string[];
      recipients: number;
      evenements?: { label: string; endsAt: string }[];
    };
    const evenements = (d.evenements ?? []).map((e) => e.label);
    setDernierVersement(
      (d.milestones.length === 0
        ? `+${delta} subs — aucun palier franchi`
        : `${d.milestones.join(', ')} — ${d.snowflakesEach} ❄ pour ${d.recipients} joueur(s)${
            d.packs.length ? ` + ${d.packs.length} pack(s) en file` : ''
          }`) + (evenements.length ? ` · évènements ouverts : ${evenements.join(', ')}` : ''),
    );
  }

  return (
    <Ecran
      titre="Saison"
      lead="Le compteur de subs de la saison — alimenté par Twitch une fois branché — et les subs offerts par les joueurs. L’overlay du stream suit le compteur."
      message={message}
    >
      {twitch.configure && (
        <Bloc
          titre="Subs Twitch"
          icone="antenne"
          neige="admin-twitch"
          aide={
            branche
              ? 'Branchés : chaque nouveau sub, chaque sub offert et chaque réabonnement annoncé dans le tchat s’ajoute tout seul au compteur, avec ses paliers.'
              : 'Une fois branchés, les subs de la chaîne s’ajoutent tout seuls au compteur, avec ses paliers. Le branchement se fait une fois, par la streameuse elle-même : Twitch lui demande d’autoriser la ligue à voir ses subs.'
          }
          actions={
            estAdmin ? (
              <a
                href="/api/auth/twitch?returnTo=/admin/saison&subs=1"
                className={`btn btn-sm no-underline ${branche ? '' : 'btn-ice'}`}
              >
                {branche ? 'Rebrancher' : 'Brancher les subs Twitch'}
              </a>
            ) : undefined
          }
        >
          {twitch.retour && (
            <div className="mb-3">
              <Notice kind={twitch.retour.kind}>{twitch.retour.text}</Notice>
            </div>
          )}
          {twitch.etat === null ? (
            <p className="text-[13px] text-faint">Twitch n’a pas répondu : état inconnu pour l’instant.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {twitch.etat.types.map((t) => (
                <li
                  key={t.type}
                  className={`rounded-full border border-white/15 px-3 py-1 text-[13px] ${
                    t.statut === 'enabled' ? 'text-aurora' : 'text-faint'
                  }`}
                >
                  {NOMS_ABONNEMENTS[t.type] ?? t.type} · {libelleStatut(t.statut)}
                </li>
              ))}
            </ul>
          )}
          {estAdmin && !branche && (
            <p className="mt-3 text-[13px] text-faint">
              À faire par la streameuse, sur un navigateur où Twitch est ouvert sur son compte.
            </p>
          )}
        </Bloc>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Bloc
          titre="Compteur de subs"
          icone="snowflake"
          neige="admin-subs"
          aide={
            <>
              Chaque palier verse à <strong className="text-muted">tous les joueurs actifs</strong>,
              à parts égales, et met les Boosters Commu et Folie en file. Aucun versement ne vise un
              joueur en particulier.
              {branche && (
                <>
                  {' '}
                  Les subs de Twitch arrivent tout seuls : ne saisis ici que ce que Twitch ne compte pas.
                </>
              )}
            </>
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {SUBS.adminSteps.map((pas) => (
                <button
                  key={pas}
                  className="btn btn-sm"
                  disabled={busy !== null}
                  onClick={() => ajouteSubs(pas)}
                >
                  +{pas}
                </button>
              ))}
            </div>
            <div className="text-right">
              <div className="num font-display text-5xl leading-none font-black text-ink">
                {flakes(config.totalSubs)}
              </div>
              {prochain && (
                <div className="text-[13px] text-faint">
                  {prochain.milestone.label} dans {prochain.remaining} sub
                  {prochain.remaining > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          {dernierVersement && (
            <p className="mt-3 rounded-lg border border-aurora/40 bg-aurora/5 px-3 py-2 text-xs text-aurora">
              {dernierVersement}
            </p>
          )}

          <p className="mt-3 text-[13px] text-faint">
            {packsEnFile === 0
              ? 'Aucun booster en file.'
              : `${packsEnFile} booster${packsEnFile > 1 ? 's' : ''} en file, à ouvrir depuis l’écran des boosters.`}
          </p>
        </Bloc>

        <Bloc
          titre="Subs offerts par un joueur"
          icone="user"
          aide={
            <>
              Un Booster Perso tous les {PACKS_REGLES.persoTousLes} subs offerts, mis en file pour ce
              joueur. À saisir <strong className="text-muted">en plus</strong> du compteur de
              saison : ces subs comptent aussi pour tout le monde.
            </>
          }
        >
          <div className="space-y-3">
            <select
              className="field w-full"
              value={gifteur}
              onChange={(e) => setGifteur(e.target.value)}
              aria-label="Joueur qui a offert des subs"
            >
              <option value="">— Joueur —</option>
              {joueurs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pseudo} — {p.subsOfferts} offert{p.subsOfferts > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                className="field num max-w-[120px]"
                min={1}
                max={10_000}
                value={subsGifteur}
                onChange={(e) => setSubsGifteur(Number(e.target.value))}
                aria-label="Nombre de subs offerts"
              />
              <button
                className="btn btn-ice flex-1"
                disabled={busy !== null || !gifteur || subsGifteur < 1}
                onClick={async () => {
                  const data = await envoie(
                    '/api/admin/subs',
                    { action: 'subs-joueur', playerId: gifteur, delta: subsGifteur },
                    { cle: 'subs-joueur', succes: 'Subs attribués.' },
                  );
                  if (!data) return;
                  const d = data as { subsOfferts: number; packsAjoutes: number };
                  setMessage({
                    kind: 'success',
                    text: `${joueurChoisi?.pseudo ?? 'Joueur'} : ${d.subsOfferts} subs offerts${
                      d.packsAjoutes ? ` — ${d.packsAjoutes} Booster(s) Perso en file` : ''
                    }.`,
                  });
                }}
              >
                Attribuer
              </button>
            </div>
            {joueurChoisi && (
              <p className="text-[13px] text-faint">
                Prochain Booster Perso dans{' '}
                {PACKS_REGLES.persoTousLes - (joueurChoisi.subsOfferts % PACKS_REGLES.persoTousLes)}{' '}
                sub(s).
              </p>
            )}
          </div>
        </Bloc>
      </div>

      {estAdmin && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Bloc
            titre="Limite de games"
            icone="trophy"
            aide="Le nombre de games comptées par joueur. La dernière ouvre le Booster Finisseur."
          >
            <div className="flex gap-2">
              <input
                id="max-games"
                type="number"
                className="field num"
                min={1}
                max={100}
                value={maxGames}
                onChange={(e) => setMaxGames(Number(e.target.value))}
                aria-label="Limite de games par joueur"
              />
              <button
                className="btn shrink-0"
                disabled={busy !== null}
                onClick={() =>
                  envoie('/api/admin/config', { maxGamesPerPlayer: maxGames }, { methode: 'PATCH' })
                }
              >
                Appliquer
              </button>
            </div>
          </Bloc>

          <Bloc
            titre="Sauvegarde"
            icone="layers"
            aide="Un export complet, journal compris. Il contient des données personnelles : à garder hors du dépôt, et à supprimer une fois inutile. La restauration depuis le site est fermée."
          >
            <a
              href="/api/admin/backup"
              className="btn no-underline"
              onClick={() => setMessage({ kind: 'success', text: 'Export lancé.' })}
            >
              Exporter la base (JSON)
            </a>
          </Bloc>
        </div>
      )}
    </Ecran>
  );
}
