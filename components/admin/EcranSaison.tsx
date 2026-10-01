'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Ecran } from '@/components/admin/Cadre';
import { Notice, flakes } from '@/components/ui';
import { SUBS, nextMilestone } from '@/lib/domain/rules';

export interface ConfigSaison {
  maxGamesPerPlayer: number;
  totalSubs: number;
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
  'channel.moderator.add': 'Modos ajoutés',
  'channel.moderator.remove': 'Modos retirés',
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
 * Le compteur de saison verse à tout le monde et met les packs collectifs en
 * file. Les Boosters Perso, eux, se règlent joueur par joueur, dans
 * Modération → Joueurs.
 */
export function EcranSaison({
  config,
  packsEnFile,
  estAdmin,
  twitch,
}: {
  config: ConfigSaison;
  packsEnFile: number;
  estAdmin: boolean;
  twitch: TwitchSubs;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [maxGames, setMaxGames] = useState(config.maxGamesPerPlayer);
  const [dernierVersement, setDernierVersement] = useState<string | null>(null);
  /** La remise à zéro se confirme : un premier clic la propose, le second la fait. */
  const [confirmeZero, setConfirmeZero] = useState(false);

  const prochain = nextMilestone(config.totalSubs);
  const branche = twitch.etat?.branche === true;

  async function remetAZero() {
    const data = await envoie(
      '/api/admin/subs',
      { action: 'remise-a-zero' },
      { cle: 'subs-zero', succes: 'Compteur de subs remis à zéro.' },
    );
    setConfirmeZero(false);
    if (data) setDernierVersement(null);
  }

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
      lead="Le compteur de subs de la saison, alimenté par Twitch une fois branché. L’overlay du stream suit le compteur. Les Boosters Perso se règlent dans Modération → Joueurs."
      message={message}
    >
      {twitch.configure && (
        <Bloc
          titre="Twitch : subs, tchat et modos"
          icone="antenne"
          neige="admin-twitch"
          aide={
            branche
              ? 'Branchés : chaque nouveau sub et chaque sub offert s’ajoute tout seul au compteur — les réabonnements ne comptent pas, avec ses paliers. Le même branchement autorise la ligue à annoncer les codes cadeaux dans le tchat, et fait suivre la modération : un modo ajouté ou retiré sur Twitch l’est aussitôt ici.'
              : 'Une fois branchés, les subs de la chaîne s’ajoutent tout seuls au compteur, les codes cadeaux s’annoncent dans le tchat, et les modos ajoutés ou retirés sur Twitch le sont aussitôt ici. Le branchement se fait une fois, par la streameuse elle-même : Twitch lui demande d’autoriser la ligue à voir ses subs et ses modos, et à écrire dans son tchat.'
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
          actions={
            estAdmin && !confirmeZero ? (
              <button
                className="btn btn-sm btn-ghost"
                disabled={busy !== null || config.totalSubs === 0}
                onClick={() => setConfirmeZero(true)}
              >
                Remettre à zéro
              </button>
            ) : undefined
          }
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
          {confirmeZero && (
            <div className="mb-4 rounded-lg border border-danger/40 px-3 py-3">
              <p className="text-[13px] text-ink-2">
                Le compteur repart de <strong className="text-ink">0</strong>, son historique s’efface et les
                évènements en cours s’arrêtent. Les flocons déjà versés, les boosters en file et les subs offerts
                restent. Le journal garde la trace.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-sm btn-danger" disabled={busy !== null} onClick={remetAZero}>
                  Remettre à zéro ({flakes(config.totalSubs)} subs)
                </button>
                <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setConfirmeZero(false)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
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
            <p className="mt-3 rounded-lg border border-aurora/40 bg-aurora/5 px-3 py-2 text-[13px] text-aurora">
              {dernierVersement}
            </p>
          )}

          <p className="mt-3 text-[13px] text-faint">
            {packsEnFile === 0
              ? 'Aucun booster en file.'
              : `${packsEnFile} booster${packsEnFile > 1 ? 's' : ''} en file, à ouvrir depuis l’écran des boosters.`}
          </p>
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
