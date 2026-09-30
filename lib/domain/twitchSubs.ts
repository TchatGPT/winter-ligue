/**
 * Les subs Twitch, tels qu'EventSub les annonce au site.
 *
 * Fonctions pures : ce que vaut un message, s'il est encore frais, et la
 * mémoire des messages déjà comptés. La signature, le réseau et la base vivent
 * ailleurs (`lib/services/twitchSubs.ts`, `app/api/twitch/eventsub/route.ts`).
 *
 * ## Ce qui compte pour un sub
 *
 * Un nouvel abonnement, un réabonnement annoncé dans le tchat, et chaque sub
 * offert. Twitch annonce un cadeau deux fois — un message pour celui qui offre,
 * avec le nombre, puis un message par destinataire : il n'est compté qu'une
 * fois, par le premier. Le palier du sub (1, 2 ou 3) ne change rien : un sub
 * est un sub.
 */

/** Les abonnements EventSub que le site demande à Twitch. */
export const TYPES_SUBS = [
  'channel.subscribe',
  'channel.subscription.gift',
  'channel.subscription.message',
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
    case 'channel.subscription.message':
      return 1;
    default:
      return 0;
  }
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
  if (type === 'channel.subscription.message') return `réabonnement de ${nomDe(e)}`;
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
