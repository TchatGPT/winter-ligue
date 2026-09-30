import 'server-only';

/**
 * Économie des subs Twitch.
 *
 * Un seul point d'entrée : `addSubs()`, que les subs viennent de la
 * modération ou de Twitch (`ajouteSubsTwitch`). Il incrémente le compteur de saison,
 * détermine les paliers franchis, verse les flocons **à tous les joueurs
 * actifs, à parts égales**, et met en file les packs collectifs. Personne ne
 * peut désigner le bénéficiaire d'un versement.
 *
 * Les subs qu'un joueur offre lui-même se comptent à part, par
 * `attribueSubsJoueur` dans `packs.ts` : ils lui valent des packs Perso, et
 * c'est la seule chose qu'un sub achète à quelqu'un en particulier.
 */

import type { Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { crossedMilestones, nextMilestone, SUBS } from '@/lib/domain/rules';
import type { PackId } from '@/lib/domain/types';
import { audit, credit } from './ledger';
import { ajoutePackDu } from './packs';
import { declencheEvenements } from '@/lib/services/evenements';
import {
  dejaVu,
  recitDuMessage,
  retiens,
  subsDuMessage,
} from '@/lib/domain/twitchSubs';

export class SubError extends Error {
  constructor(
    message: string,
    readonly code: 'DELTA_INVALIDE',
  ) {
    super(message);
    this.name = 'SubError';
  }
}

export interface AddSubsResult {
  totalSubs: number;
  /** Libellés des paliers franchis, dans l'ordre. */
  milestones: string[];
  /** Les évènements ouverts par cette saisie, avec leur heure de fin. */
  evenements: { label: string; endsAt: string }[];
  snowflakesEach: number;
  /** Les packs mis en file, à ouvrir à l'antenne. */
  packs: PackId[];
  recipients: number;
  /** Prochain palier, pour la barre de progression. */
  next: ReturnType<typeof nextMilestone>;
}

/**
 * Ajoute des subs et distribue ce que les paliers franchis prévoient.
 *
 * À appeler dans une transaction : compteur, versements et mise en file
 * réussissent ou échouent ensemble.
 */
export function addSubs(db: Database, delta: number, actor: string, precision?: string): AddSubsResult {
  if (!Number.isInteger(delta) || delta <= 0 || delta > 10_000) {
    throw new SubError('Nombre de subs invalide.', 'DELTA_INVALIDE');
  }

  const from = db.config.totalSubs;
  const to = from + delta;
  db.config.totalSubs = to;

  const crossed = crossedMilestones(from, to);
  const recipients = db.players.filter((p) => p.active);

  let snowflakesEach = 0;
  const packs: PackId[] = [];

  for (const milestone of crossed) {
    if (milestone.kind === 'FLOCONS' && milestone.amount) {
      snowflakesEach += milestone.amount;
    } else if (milestone.kind === 'PACK' && milestone.packId) {
      packs.push(milestone.packId);
      ajoutePackDu(db, milestone.packId, null, `palier de ${milestone.every} subs (total ${to})`);
    }
  }

  if (snowflakesEach > 0) {
    for (const player of recipients) {
      credit(db, player.id, snowflakesEach, 'SUBS_TWITCH', String(to));
    }
  }

  const milestones = crossed.map((m) => m.label);

  // Les évènements se déclenchent sur les mêmes franchissements, dans la même
  // transaction : un palier ne peut pas verser ses flocons sans ouvrir sa
  // fenêtre, ni l'inverse.
  const evenements = declencheEvenements(db, from, to);

  if (crossed.length > 0) {
    db.subEvents.push({
      id: newId(),
      at: new Date().toISOString(),
      delta,
      totalAfter: to,
      milestones,
      snowflakesEach,
      packs,
      recipients: recipients.length,
    });
  }

  audit(
    db,
    actor,
    'SUBS_AJOUTES',
    null,
    `+${delta} subs (total ${to})${precision ? ` · ${precision}` : ''}${milestones.length ? ` — ${milestones.join(', ')}` : ''}${
      evenements.length ? ` — évènements : ${evenements.map((e) => e.label).join(', ')}` : ''
    }`,
  );

  return {
    totalSubs: to,
    milestones,
    evenements: evenements.map((e) => ({ label: e.label, endsAt: e.endsAt })),
    snowflakesEach,
    packs,
    recipients: recipients.length,
    next: nextMilestone(to),
  };
}

/**
 * Un message de Twitch : un sub, ou des subs offerts. Un réabonnement ne compte pas.
 *
 * Compté une seule fois : Twitch renvoie un message qu'il croit perdu, et la
 * mémoire des messages comptés vit dans la même transaction que le compteur —
 * les deux réussissent ou échouent ensemble. Un message qui n'ajoute rien (le
 * destinataire d'un sub offert, déjà compté par le cadeau) n'est pas retenu.
 *
 * Twitch ne donne de Booster Perso à personne : la modération les règle à la
 * main, joueur par joueur (`ajusteBoostersPerso`).
 *
 * À appeler dans une transaction. Renvoie null si le message ne change rien.
 */
export function ajouteSubsTwitch(
  db: Database,
  message: { id: string; type: string; evenement: Record<string, unknown>; maintenant: number },
): AddSubsResult | null {
  if (dejaVu(db.config.twitchVus, message.id)) return null;
  const subs = subsDuMessage(message.type, message.evenement);
  if (subs === 0) return null;
  db.config.twitchVus = retiens(db.config.twitchVus, message.id, message.maintenant);
  const resultat = addSubs(db, subs, 'twitch', recitDuMessage(message.type, message.evenement, subs));
  return resultat;
}

/**
 * Remet le compteur de la saison à zéro, avant son vrai départ : les subs de
 * l'avant-saison ne comptent plus, et les évènements qu'ils ont ouverts
 * s'arrêtent. Ce qu'ils ont versé reste versé — flocons, boosters en file,
 * subs offerts — et le journal garde la trace de tout.
 *
 * À appeler dans une transaction. Réservé à l'administration.
 */
export function remetSubsAZero(db: Database, actor: string): { avant: number } {
  const avant = db.config.totalSubs;
  db.config.totalSubs = 0;
  db.subEvents = [];
  db.evenements = [];
  audit(db, actor, 'SUBS_REMIS_A_ZERO', null, `Compteur de subs remis à zéro (il était à ${avant}).`);
  return { avant };
}

/** État du compteur, pour la bannière publique. */
export function subsOverview(db: Database) {
  const next = nextMilestone(db.config.totalSubs);
  return {
    totalSubs: db.config.totalSubs,
    next,
    milestones: SUBS.milestones,
    recent: db.subEvents.slice(-6).reverse(),
  };
}
