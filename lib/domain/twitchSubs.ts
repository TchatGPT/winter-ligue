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
 * Aucun message ne vaut quoi que ce soit à un joueur en particulier : les
 * Boosters Perso se règlent à la main, par la modération.
 */

/** Les abonnements EventSub que le site demande à Twitch. */
export const TYPES_SUBS = [
  'channel.subscribe',
  'channel.subscription.gift',
] as const;

/**
 * Les modérateurs de la chaîne, en direct. Un modérateur ajouté sur Twitch
 * administre la ligue, un modérateur retiré redevient joueur — à la requête
 * suivante, puisque le rôle d'une session se relit en base. Sans cela, le rôle
 * ne suivait la chaîne qu'à la connexion, et c'est pour cela qu'une session ne
 * durait que douze heures.
 */
export const TYPES_MODERATION = ['channel.moderator.add', 'channel.moderator.remove'] as const;

/** Tout ce que le site demande à Twitch, en un seul branchement. */
export const TYPES_EVENTSUB = [...TYPES_SUBS, ...TYPES_MODERATION] as const;

/** Le rôle que donne un message de modération, ou null si ce n'en est pas un. */
export function roleDuMessage(type: string): 'admin' | 'joueur' | null {
  if (type === 'channel.moderator.add') return 'admin';
  if (type === 'channel.moderator.remove') return 'joueur';
  return null;
}

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

/* ------------------------------ Le registre ------------------------------ */

export interface LigneSub {
  id: string;
  le: string;
  genre: 'sub' | 'cadeau';
  twitchId: string | null;
  pseudo: string;
  nombre: number;
  niveau: number;
}

/** Le niveau d'un sub, tel que Twitch l'écrit (`1000`, `2000`, `3000`). */
export function niveauDe(tier: unknown): number {
  return tier === '3000' ? 3 : tier === '2000' ? 2 : 1;
}

/** La ligne du registre pour un message compté. */
export function ligneDuSub(
  message: { id: string; type: string; evenement: Record<string, unknown> | undefined; maintenant: number },
  nombre: number,
): LigneSub {
  const e = message.evenement ?? {};
  const cadeau = message.type === 'channel.subscription.gift';
  const anonyme = cadeau && e.is_anonymous === true;
  return {
    id: message.id,
    le: new Date(message.maintenant).toISOString(),
    genre: cadeau ? 'cadeau' : 'sub',
    twitchId: !anonyme && typeof e.user_id === 'string' && e.user_id ? e.user_id : null,
    pseudo: anonyme ? 'Anonyme' : nomDe(e),
    nombre,
    niveau: niveauDe(e.tier),
  };
}

export interface CadeauEnAttente {
  twitchId: string;
  pseudo: string;
  /** Tous les subs qu'il a offerts. */
  subs: number;
  dernier: string;
}

/**
 * Qui a offert des subs sans être inscrit à la ligue : ses Boosters Perso
 * l'attendent. Les cadeaux anonymes n'y figurent pas — on ne sait pas de qui.
 */
export function cadeauxEnAttente(registre: readonly LigneSub[], inscrits: ReadonlySet<string>): CadeauEnAttente[] {
  const parDonateur = new Map<string, CadeauEnAttente>();
  for (const l of registre) {
    if (l.genre !== 'cadeau' || !l.twitchId || inscrits.has(l.twitchId)) continue;
    const deja = parDonateur.get(l.twitchId);
    if (deja) {
      deja.subs += l.nombre;
      if (l.le > deja.dernier) {
        deja.dernier = l.le;
        deja.pseudo = l.pseudo;
      }
    } else {
      parDonateur.set(l.twitchId, { twitchId: l.twitchId, pseudo: l.pseudo, subs: l.nombre, dernier: l.le });
    }
  }
  return [...parDonateur.values()].sort((a, b) => b.subs - a.subs || b.dernier.localeCompare(a.dernier));
}
