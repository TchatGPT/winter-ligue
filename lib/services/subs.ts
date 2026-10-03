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
 * Les Boosters Perso — un par sub de niveau 3, un tous les cinq subs offerts —
 * sont la seule chose qu'un sub vaut à quelqu'un en particulier. Les subs de
 * Twitch les versent d'office à qui a payé (`ajouteSubsTwitch`) ; la
 * modération les déplace d'un joueur à l'autre (`ajusteBoostersPerso`).
 */

import type { Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { crossedMilestones, nextMilestone, SUBS } from '@/lib/domain/rules';
import type { PackId } from '@/lib/domain/types';
import { audit } from './ledger';
import { ajoutePackDu, crediteBoostersPerso } from './packs';
import { commuAccelereDepuis, declencheEvenements } from '@/lib/services/evenements';
import { dejaVu, gesteDuMessage, ligneDuGeste, recitDuGeste, retiens } from '@/lib/domain/twitchSubs';

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

  // Les évènements d'abord : une Tempête ouverte par cette saisie accélère
  // déjà le Booster Commu pour les subs qui la suivent. Ils se déclenchent sur
  // les mêmes franchissements, dans la même transaction : un palier ne peut pas
  // verser ses flocons sans ouvrir sa fenêtre, ni l'inverse.
  const evenements = declencheEvenements(db, from, to);
  const crossed = crossedMilestones(from, to, commuAccelereDepuis(db));
  const recipients = db.players.filter((p) => p.active);

  const packs: PackId[] = [];
  for (const milestone of crossed) {
    packs.push(milestone.packId);
    ajoutePackDu(db, milestone.packId, null, `palier de ${milestone.every} subs (total ${to})`);
  }

  const milestones = crossed.map((m) => m.label);

  if (crossed.length > 0) {
    db.subEvents.push({
      id: newId(),
      at: new Date().toISOString(),
      delta,
      totalAfter: to,
      milestones,
      // Les subs ne versent plus de flocons : la colonne reste, à zéro.
      snowflakesEach: 0,
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
    packs,
    recipients: recipients.length,
    next: nextMilestone(to),
  };
}

/**
 * Un message de Twitch : un sub, un resub, des subs offerts — ce que
 * `gesteDuMessage` dit qu'il vaut. Un sub Prime ne compte pas.
 *
 * Compté une seule fois : Twitch renvoie un message qu'il croit perdu, et la
 * mémoire des messages comptés vit dans la même transaction que le compteur —
 * les deux réussissent ou échouent ensemble. Un message qui n'ajoute rien (le
 * destinataire d'un sub offert, déjà compté par le cadeau) n'est pas retenu.
 *
 * Ce qu'il vaut à qui l'a payé — un Booster Perso par sub de niveau 3, un tous
 * les cinq subs offerts — est mis en file d'office, s'il a un compte dans la
 * ligue (`crediteBoostersPerso`). Sinon le registre le garde, et la
 * modération le voit dans la liste de ce qui attend.
 *
 * À appeler dans une transaction. Renvoie null si le message ne change rien.
 */
export function ajouteSubsTwitch(
  db: Database,
  message: { id: string; type: string; evenement: Record<string, unknown>; maintenant: number },
): AddSubsResult | null {
  if (dejaVu(db.config.twitchVus, message.id)) return null;
  const geste = gesteDuMessage(message.type, message.evenement);
  if (!geste) return null;
  db.config.twitchVus = retiens(db.config.twitchVus, message.id, message.maintenant);
  const resultat = addSubs(db, geste.nombre, 'twitch', recitDuGeste(geste));
  // Au registre, que lit la modération : qui, combien, quand, à quel niveau.
  db.subsTwitch.push(ligneDuGeste(message, geste));
  // Ce qu'il vaut à qui l'a payé. Un cadeau anonyme ne vaut rien à personne.
  const payeur = geste.twitchId && !geste.anonyme ? db.players.find((p) => p.twitchId === geste.twitchId) : undefined;
  if (payeur) {
    crediteBoostersPerso(
      db,
      payeur,
      {
        niveau3: geste.niveau === 3 ? geste.nombre : 0,
        offerts: geste.genre === 'cadeau' && geste.niveau !== 3 ? geste.nombre : 0,
      },
      recitDuGeste(geste),
    );
  }
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
