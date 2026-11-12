'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Panneau, Pastille } from '@/components/admin/Kit';
import { flakes } from '@/components/ui';
import {
  SAISONS,
  SUBS,
  nextMilestone,
  parametresSaison,
  type ParametresSaison,
} from '@/lib/domain/rules';

export interface ConfigSaison {
  maxGamesPerPlayer: number;
  totalSubs: number;
  /** La saison en cours (`SAISONS`). */
  numero: number;
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
  'channel.chat.notification': 'Les subs offerts et les subs T3',
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
  responsable = false,
  twitch,
}: {
  config: ConfigSaison;
  packsEnFile: number;
  estAdmin: boolean;
  /** Le responsable de la saison (`RESPONSABLES_SAISON`) : lui seul la lance. */
  responsable?: boolean;
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
        ton={twitch.configure && !branche ? 'danger' : 'aurore'}
        titre={branche ? 'Twitch est branché' : 'Twitch n’est pas branché'}
        sousTitre={
          branche
            ? 'Les subs offerts par 5 ou plus et les subs T3 arrivent tout seuls au compteur ; rien d’autre ne compte. Les codes cadeaux s’annoncent dans le tchat.'
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
          titre="Games par joueur"
          sousTitre={`Le nombre de games qui comptent pour chaque joueur. ${resumeSaison(parametresSaison(config.numero))}.`}
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

      {responsable && (
        <Panneau
          zone="changement"
          ton="glace"
          surtitre="Saison en cours"
          titre={parametresSaison(config.numero).nom}
          sousTitre={resumeSaison(parametresSaison(config.numero))}
        >
          <NouvelleSaison
            numero={config.numero}
            occupe={busy !== null}
            onLancer={(numero) =>
              envoie(
                '/api/admin/saison',
                { numero },
                { cle: 'nouvelle-saison', succes: `${parametresSaison(numero).nom} lancée : la ligue repart de zéro.` },
              )
            }
          />
        </Panneau>
      )}
    </EcranAdmin>
  );
}

/** Les réglages d'une saison, en une ligne. */
function resumeSaison(s: ParametresSaison): string {
  return [
    `${s.games} games`,
    `Booster Finisseur à la ${s.finisseurA}ᵉ`,
    s.uneParSessionApres !== null ? 'puis une game par session' : null,
    s.finalistes > 0 ? `finale à ${s.finalistes}` : 'pas de finale',
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Changer de saison : la ligue repart de zéro (12/11/2026). Réservé au
 * responsable de la saison (Jex3_) : le panneau n'existe que pour lui. On
 * choisit la saison — la suivante, ou revenir à une d'avant pour la montrer —,
 * puis une fenêtre demande de confirmer.
 */
function NouvelleSaison({
  numero,
  occupe,
  onLancer,
}: {
  numero: number;
  occupe: boolean;
  onLancer: (numero: number) => Promise<Record<string, unknown> | null>;
}) {
  const suivante = SAISONS.find((s) => s.numero > numero)?.numero ?? numero;
  const [choix, setChoix] = useState(suivante);
  const [confirme, setConfirme] = useState(false);
  const saison = parametresSaison(choix);
  const court = saison.nom.split(' · ')[0];
  const verbe = choix > numero ? `Passer en ${court}` : choix < numero ? `Revenir en ${court}` : `Recommencer la ${court}`;

  useEffect(() => {
    if (!confirme) return;
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !occupe) setConfirme(false);
    };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [confirme, occupe]);

  async function lance() {
    await onLancer(choix);
    setConfirme(false);
  }

  return (
    <section className="adm-nouvelle-saison">
      <div className="adm-saisons" role="radiogroup" aria-label="La saison à lancer">
        {SAISONS.map((s) => (
          <button
            key={s.numero}
            type="button"
            role="radio"
            aria-checked={choix === s.numero}
            className="adm-saison-choix"
            onClick={() => setChoix(s.numero)}
          >
            <span className="adm-saison-nom">
              {s.nom}
              {s.numero === numero && <Pastille ton="glace">en cours</Pastille>}
            </span>
            <span className="adm-saison-regle">{resumeSaison(s)}</span>
          </button>
        ))}
      </div>
      <div className="adm-saison-bilan">
        <p data-sens="efface">
          <b>Repart de zéro</b>
          Les games et les points, les flocons, les boosters à ouvrir, les cartes, les duels, les évènements, les codes
          cadeaux, le compteur de subs et les subs offerts.
        </p>
        <p data-sens="reste">
          <b>Reste</b>
          Les joueurs inscrits et leurs comptes, les cartes et les boosters du catalogue, le journal. Chaque joueur
          repart avec ses 3 Jokers.
        </p>
      </div>
      <div className="adm-saison-lancer">
        <button type="button" className="btn btn-danger" disabled={occupe} onClick={() => setConfirme(true)}>
          {verbe}
        </button>
      </div>
      {confirme &&
        createPortal(
          <div
            className="fenetre-voile"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirme-saison"
            onClick={() => !occupe && setConfirme(false)}
          >
            <div
              className="fenetre-carte glass glass-reflet relative grid gap-4 px-6 pt-7 pb-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="confirme-saison"
                className="font-display text-2xl leading-none font-black tracking-wide text-ink uppercase"
              >
                {verbe} ?
              </h2>
              <p className="text-[14px] leading-relaxed text-muted">
                Toute la ligue repart de zéro : games, points, flocons, boosters, cartes, duels, évènements, codes et
                subs. Les joueurs restent inscrits. Ça ne se récupère pas.
              </p>
              <p className="text-[14px] text-ink">{resumeSaison(saison)}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-ghost" disabled={occupe} onClick={() => setConfirme(false)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-danger" disabled={occupe} onClick={lance} autoFocus>
                  {occupe ? 'Remise à zéro…' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
