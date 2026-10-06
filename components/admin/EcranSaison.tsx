'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Panneau, Pastille } from '@/components/admin/Kit';
import { flakes } from '@/components/ui';
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

/** Ce que fait chaque abonnement, en clair. */
const ABONNEMENTS: Record<string, string> = {
  'channel.chat.notification': 'Les subs, resubs et subs offerts (sans les Prime)',
  'channel.moderator.add': 'Un modo ajouté sur Twitch le devient ici',
  'channel.moderator.remove': 'Un modo retiré sur Twitch ne l’est plus ici',
};

/**
 * Les subs et la saison : le branchement Twitch, le compteur de subs, la
 * limite de games et la sauvegarde. La limite et la sauvegarde touchent aux
 * règles de la saison : le serveur revérifie le rôle.
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
  const [dernierAjout, setDernierAjout] = useState<string | null>(null);
  /** La remise à zéro se confirme : un premier clic la propose, le second la fait. */
  const [confirmeZero, setConfirmeZero] = useState(false);
  /** Le retour du branchement Twitch, lu une fois puis refermé. */
  const [retourLu, setRetourLu] = useState(false);

  const prochain = nextMilestone(config.totalSubs);
  const branche = twitch.etat?.branche === true;

  async function remetAZero() {
    const data = await envoie(
      '/api/admin/subs',
      { action: 'remise-a-zero' },
      { cle: 'subs-zero', succes: 'Compteur de subs remis à zéro.' },
    );
    setConfirmeZero(false);
    if (data) setDernierAjout(null);
  }

  async function ajouteSubs(delta: number) {
    const data = await envoie(
      '/api/admin/subs',
      { action: 'subs', delta },
      { cle: `subs-${delta}`, succes: 'Subs ajoutés.' },
    );
    if (!data) return;
    const d = data as { milestones: string[]; evenements?: { label: string; endsAt: string }[] };
    // « Booster Commu ×3 » plutôt que trois fois son nom.
    const groupe = (noms: string[]) =>
      [...new Set(noms)].map((n) => {
        const fois = noms.filter((x) => x === n).length;
        return fois > 1 ? `${n} ×${fois}` : n;
      });
    const boosters = groupe(d.milestones);
    const evenements = groupe((d.evenements ?? []).map((e) => e.label));
    setDernierAjout(
      [
        `+${delta} subs`,
        boosters.length ? `à ouvrir : ${boosters.join(', ')}` : 'pas de nouveau booster',
        evenements.length ? `évènements : ${evenements.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  }

  return (
    <EcranAdmin
      intro="Le compteur de subs de la saison, ce qui l’alimente, et les règles de la saison."
      grille="saison"
      message={message ?? (twitch.retour && !retourLu ? { kind: twitch.retour.kind, text: twitch.retour.text } : null)}
      onFermeMessage={() => {
        setMessage(null);
        setRetourLu(true);
      }}
    >
      {/* ------------------------------ Twitch ------------------------------ */}
      <Panneau
        zone="twitch"
        icone="antenne"
        ton={twitch.configure && !branche ? 'danger' : 'aurore'}
        titre={branche ? 'Twitch est branché' : 'Twitch n’est pas branché'}
        sousTitre={
          branche
            ? 'Chaque sub payé arrive tout seul au compteur ; les subs Prime ne comptent pas. Les codes cadeaux s’annoncent dans le tchat.'
            : 'Sans ce branchement, Twitch ne dit pas quels subs sont Prime : ils comptent comme des subs payés.'
        }
        actions={
          twitch.configure && estAdmin ? (
            <a
              href="/api/auth/twitch?returnTo=/admin/saison&subs=1"
              className={`btn btn-sm no-underline ${branche ? '' : 'btn-ice'}`}
            >
              {branche ? 'Rebrancher' : 'Brancher les subs'}
            </a>
          ) : undefined
        }
      >
        {!twitch.configure ? (
          <p className="adm-note">La connexion Twitch n’est pas configurée sur ce serveur.</p>
        ) : twitch.etat === null ? (
          <p className="adm-note">Twitch n’a pas répondu : état inconnu pour l’instant.</p>
        ) : (
          <ul className="adm-liste-etats">
            {twitch.etat.types.map((t) => (
              <li key={t.type} data-actif={t.statut === 'enabled' ? '' : undefined}>
                <span aria-hidden="true">{t.statut === 'enabled' ? '✓' : '✕'}</span>
                {ABONNEMENTS[t.type] ?? t.type}
                {t.statut !== 'enabled' && (
                  <Pastille ton="danger">
                    {t.statut === null
                      ? 'absent'
                      : t.statut === 'webhook_callback_verification_pending'
                        ? 'en vérification'
                        : 'coupé'}
                  </Pastille>
                )}
              </li>
            ))}
          </ul>
        )}
        {twitch.configure && !branche && (
          <p className="adm-etape">
            <b>À faire par Lriaa elle-même</b>, sur un navigateur où Twitch est ouvert sur son compte : cliquer «
            Brancher les subs », puis accepter ce que Twitch lui demande.
          </p>
        )}
      </Panneau>

      {/* ------------------------------ Le compteur ------------------------------ */}
      <Panneau
        zone="compteur"
        icone="snowflake"
        titre="Compteur de subs"
        sousTitre="Ses paliers font tomber les Boosters Commu et Folie et ouvrent les évènements, pour tous les joueurs à la fois."
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
      >
        <div className="adm-compteur">
          <strong>{flakes(config.totalSubs)}</strong>
          <span>
            subs cette saison
            {prochain && (
              <>
                <br />
                {prochain.milestone.label} dans {prochain.remaining}
              </>
            )}
          </span>
        </div>

        {confirmeZero && (
          <div className="adm-danger">
            <p>
              Le compteur repart de <b>0</b>, et les évènements en cours s’arrêtent. Les flocons, les boosters à ouvrir
              et les subs offerts restent. Le journal garde la trace.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm btn-danger" disabled={busy !== null} onClick={remetAZero}>
                Remettre à zéro ({flakes(config.totalSubs)} subs)
              </button>
              <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setConfirmeZero(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}

        <p className="adm-sous-titre">Ajouter des subs à la main</p>
        <p className="adm-note">
          {branche
            ? 'Twitch les compte déjà : n’ajoute ici que ce qu’il n’a pas vu.'
            : 'Pour les subs que Twitch n’a pas comptés.'}
        </p>
        <div className="adm-rapides" role="group" aria-label="Ajouter des subs">
          {SUBS.adminSteps.map((pas) => (
            <button key={pas} type="button" disabled={busy !== null} onClick={() => ajouteSubs(pas)}>
              +{pas}
            </button>
          ))}
        </div>
        {dernierAjout && <p className="adm-retour">{dernierAjout}</p>}
        <p className="adm-note">
          {packsEnFile === 0
            ? 'Aucun booster à ouvrir.'
            : `${packsEnFile} booster${packsEnFile > 1 ? 's' : ''} à ouvrir depuis la page Boosters.`}
        </p>
      </Panneau>

      {/* ------------------------------ Les règles ------------------------------ */}
      {estAdmin && (
        <Panneau
          zone="regles"
          icone="trophy"
          titre="Games par joueur"
          sousTitre="Le nombre de games qui comptent pour chaque joueur. La dernière ouvre son Booster Finisseur."
        >
          <form
            className="adm-ligne-form"
            onSubmit={(e) => {
              e.preventDefault();
              void envoie(
                '/api/admin/config',
                { maxGamesPerPlayer: maxGames },
                { methode: 'PATCH', succes: 'Limite de games enregistrée.' },
              );
            }}
          >
            <input
              type="number"
              className="field num"
              min={1}
              max={100}
              value={maxGames}
              onChange={(e) => setMaxGames(Number(e.target.value))}
              aria-label="Games par joueur"
            />
            <button className="btn" disabled={busy !== null || maxGames === config.maxGamesPerPlayer}>
              Enregistrer
            </button>
          </form>
        </Panneau>
      )}

      {estAdmin && (
        <Panneau
          zone="sauvegarde"
          icone="layers"
          titre="Sauvegarde"
          sousTitre="Un export complet de la base, journal compris. Il contient des données personnelles : à garder pour soi, et à supprimer une fois inutile."
        >
          <a
            href="/api/admin/backup"
            className="btn no-underline"
            onClick={() => setMessage({ kind: 'success', text: 'Export lancé.' })}
          >
            Exporter la base (JSON)
          </a>
        </Panneau>
      )}
    </EcranAdmin>
  );
}
