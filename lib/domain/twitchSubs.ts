/**
 * Les subs Twitch, tels qu'EventSub les annonce au site.
 *
 * Fonctions pures : ce que vaut un message, s'il est encore frais, et la
 * mémoire des messages déjà comptés. La signature, le réseau et la base vivent
 * ailleurs (`lib/services/twitchSubs.ts`, `app/api/twitch/eventsub/route.ts`).
 *
 * ## Ce qui compte pour un sub
 *
 * Un nouvel abonnement, et chaque sub offert. Les réabonnements ne comptent
 * pas : le site ne les demande même pas à Twitch. Twitch annonce un cadeau deux fois — un message pour celui qui offre,
 * avec le nombre, puis un message par destinataire : il n'est compté qu'une
 * fois, par le premier. Le palier du sub (1, 2 ou 3) ne change rien : un sub
 * est un sub.
 *
 * ## Ce qu'un sub vaut à un joueur
 *
 * En plus du compteur de la saison, deux gestes valent un Booster Perso à un
 * joueur de la ligue : offrir des subs en cadeaux groupés d'au moins
 * `PACKS_REGLES.cadeauMinTwitch` (ses subs offerts montent d'autant), et
 * prendre soi-même un sub de niveau 3. Rien d'autre : ni sub simple, ni
 * réabonnement, ni petit cadeau, ni cadeau anonyme.
 */

import { PACKS_REGLES } from './rules';

/** Les abonnements EventSub que le site demande à Twitch. */
export const TYPES_SUBS = [
  'channel.subscribe',
  'channel.subscription.gift',
] as const;

/** Le plus qu'un seul message peut ajouter : un cadeau de masse, borné. */
export const SUBS_PAR_MESSAGE_MAX = 1000;

/** Au-delà de dix minutes, un message est ignoré : c'est la règle de Twitch contre le rejeu. */
export const FRAICHEUR_MS = 10 * 60_000;

/** Combien de temps un message compté reste en mémoire : bien plus que sa fraîcheur. */
export const MEMOIRE_MS = 60 * 60_000;

/** Et combien de messages, au plus. */
export const MEMOIRE_MAX = 1000;

/** Un message déjà compté : son identifiant Twitch, et quand. */
export interface MessageVu {
  id: string;
  /** Date ISO. */
  le: string;
}

type Evenement = Record<string, unknown> | undefined;

/** Combien de subs ce message ajoute au compteur de la saison. */
export function subsDuMessage(type: string, evenement: Evenement): number {
  const e = evenement ?? {};
  switch (type) {
    case 'channel.subscribe':
      // Le destinataire d'un sub offert : déjà compté par le message du cadeau.
      return e.is_gift === true ? 0 : 1;
    case 'channel.subscription.gift': {
      const total = e.total;
      if (typeof total !== 'number' || !Number.isInteger(total) || total < 1) return 0;
      return Math.min(total, SUBS_PAR_MESSAGE_MAX);
    }
    default:
      // Les réabonnements (`channel.subscription.message`) ne comptent pas.
      return 0;
  }
}

/** Ce qu'un message vaut à un joueur en particulier, en plus du compteur de la saison. */
export type RecompenseTwitch =
  | { genre: 'subs-offerts'; twitchId: string; subs: number }
  | { genre: 'sub-niveau-3'; twitchId: string };

/**
 * Ce que ce message vaut à celui qui l'a fait : des subs offerts pour un
 * cadeau groupé assez gros, un Booster Perso pour un sub de niveau 3 pris pour
 * soi. Rien pour la streameuse sur sa propre chaîne.
 */
export function recompenseDuMessage(type: string, evenement: Evenement): RecompenseTwitch | null {
  const e = evenement ?? {};
  const twitchId = typeof e.user_id === 'string' && e.user_id ? e.user_id : null;
  if (!twitchId || twitchId === e.broadcaster_user_id) return null;

  if (type === 'channel.subscription.gift') {
    if (e.is_anonymous === true) return null;
    const subs = subsDuMessage(type, e);
    return subs >= PACKS_REGLES.cadeauMinTwitch ? { genre: 'subs-offerts', twitchId, subs } : null;
  }
  if (type === 'channel.subscribe') {
    // Pris pour soi : un sub de niveau 3 reçu en cadeau ne vaut rien à celui qui le reçoit.
    return e.is_gift !== true && e.tier === '3000' ? { genre: 'sub-niveau-3', twitchId } : null;
  }
  return null;
}

/** Le nom affiché d'un abonné, borné : il finit dans le journal. */
function nomDe(e: Record<string, unknown>): string {
  const nom = typeof e.user_name === 'string' && e.user_name.trim() ? e.user_name.trim() : 'quelqu’un';
  return nom.slice(0, 40);
}

/** Ce que le journal dit d'un message compté. */
export function recitDuMessage(type: string, evenement: Evenement, subs: number): string {
  const e = evenement ?? {};
  if (type === 'channel.subscription.gift') {
    const qui = e.is_anonymous === true ? 'un anonyme' : nomDe(e);
    return `${subs} sub${subs > 1 ? 's' : ''} offert${subs > 1 ? 's' : ''} par ${qui}`;
  }
  return `sub de ${nomDe(e)}`;
}

/**
 * Le message est-il encore frais ? Twitch date à la nanoseconde ; la
 * milliseconde suffit. Un horodatage illisible ne l'est pas.
 */
export function messageFrais(horodatage: string, maintenant: number): boolean {
  const t = Date.parse(horodatage.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(t) && Math.abs(maintenant - t) <= FRAICHEUR_MS;
}

export function dejaVu(vus: readonly MessageVu[], id: string): boolean {
  return vus.some((v) => v.id === id);
}

/** La mémoire, avec ce message en plus : sans ce qui a plus d'une heure, et bornée. */
export function retiens(vus: readonly MessageVu[], id: string, maintenant: number): MessageVu[] {
  const limite = maintenant - MEMOIRE_MS;
  const gardes = vus.filter((v) => Date.parse(v.le) >= limite);
  return [...gardes, { id, le: new Date(maintenant).toISOString() }].slice(-MEMOIRE_MAX);
}
