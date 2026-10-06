/**
 * Les subs Twitch, tels que le tchat de la chaîne les annonce au site.
 *
 * Fonctions pures : ce que vaut un message, s'il est encore frais, et la
 * mémoire des messages déjà comptés. La signature, le réseau et la base vivent
 * ailleurs (`lib/services/twitchSubs.ts`, `app/api/twitch/eventsub/route.ts`).
 *
 * ## D'où viennent les subs
 *
 * Des annonces du tchat (`channel.chat.notification`) : ce sont les seuls
 * messages de Twitch qui disent si un sub est Prime. `channel.subscribe`
 * annonce un sub Prime comme un sub de niveau 1, et ignore les resubs.
 *
 * ## Ce qui compte pour un sub
 *
 * Un sub payé, un pour un, quel que soit son niveau : un nouveau sub, un resub
 * — Twitch ne l'annonce que si l'abonné le partage dans le tchat —, et chaque
 * sub offert, même anonyme. Les subs Prime ne comptent pas, ni nouveaux ni
 * renouvelés ; les bits, les follows et les raids non plus.
 *
 * Un cadeau de masse s'annonce deux fois : une annonce pour celui qui offre,
 * avec le nombre, puis une par destinataire. Il n'est compté qu'une fois, par
 * la première. Un resub né d'un cadeau — son destinataire qui partage ses mois
 * — a été compté quand il a été offert.
 *
 * ## Le niveau 3
 *
 * Un sub de niveau 3 compte pour un, comme les autres, et vaut en plus un
 * Booster Perso à qui le paie : l'abonné, ou celui qui l'offre. Le site ne le
 * donne pas lui-même — la modération règle les Boosters Perso à la main — : il
 * le dit au journal et au registre, et compte ce qui attend les non-inscrits.
 */

import { packsPersoAcquis } from './rules';

/** Les annonces du tchat : subs, resubs et cadeaux, avec les Prime à part. */
export const TYPE_TCHAT = 'channel.chat.notification';

/** Les abonnements EventSub que le site demande à Twitch pour les subs. */
export const TYPES_SUBS = [TYPE_TCHAT] as const;

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

/**
 * Ce qui compte pour un sub, et ce qui ne compte pas, tel que les joueurs le
 * lisent — sur la page des boosters et dans les règles.
 */
export const CE_QUI_COMPTE = ['Sub T1, T2 ou T3', 'Resub partagé dans le tchat', 'Chaque sub offert'] as const;
export const CE_QUI_NE_COMPTE_PAS = ['Sub Prime, nouveau ou resub', 'Resub non partagé', 'Bits, follows et raids'] as const;

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

/** Un sub payé, tel qu'il compte : au compteur de la saison, et au registre. */
export interface GesteSub {
  genre: 'sub' | 'resub' | 'cadeau';
  /** Combien de subs il ajoute au compteur : un, ou le nombre offert. */
  nombre: number;
  /** Le niveau du sub : 1, 2 ou 3. */
  niveau: number;
  /** Qui a payé — l'abonné, ou celui qui offre ; null pour un cadeau anonyme. */
  twitchId: string | null;
  pseudo: string;
  anonyme: boolean;
}

/** Le niveau d'un sub, tel que Twitch l'écrit (`1000`, `2000`, `3000`). */
export function niveauDe(tier: unknown): number {
  return tier === '3000' ? 3 : tier === '2000' ? 2 : 1;
}

/** Une partie de l'annonce, ou null : Twitch met à null ce qui ne la concerne pas. */
function partie(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Un nom affiché, borné : il finit dans le journal. */
function nomDe(v: unknown): string {
  const nom = typeof v === 'string' && v.trim() ? v.trim() : 'quelqu’un';
  return nom.slice(0, 40);
}

/** Un identifiant Twitch, ou null. */
function idDe(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null;
}

/** Un nombre de subs offerts : un entier positif, borné ; zéro s'il est farfelu. */
function totalDe(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? Math.min(v, SUBS_PAR_MESSAGE_MAX) : 0;
}

/**
 * Ce que vaut un message de Twitch : le sub payé qu'il annonce, ou null s'il ne
 * compte pas — un sub Prime, un resub né d'un cadeau, le destinataire d'un
 * cadeau, un raid, une annonce, un message de modération…
 */
export function gesteDuMessage(type: string, evenement: Evenement): GesteSub | null {
  const e = evenement ?? {};
  if (type === TYPE_TCHAT) return gesteDuTchat(e);

  // L'ancien branchement, d'avant les annonces du tchat : ses messages arrivent
  // tant que la streameuse n'a pas rebranché, et comptent comme avant — un
  // nouveau sub, Prime compris, et chaque sub offert. Rebrancher les retire.
  if (type === 'channel.subscribe') {
    // Le destinataire d'un sub offert : déjà compté par le message du cadeau.
    if (e.is_gift === true) return null;
    return {
      genre: 'sub',
      nombre: 1,
      niveau: niveauDe(e.tier),
      twitchId: idDe(e.user_id),
      pseudo: nomDe(e.user_name),
      anonyme: false,
    };
  }
  if (type === 'channel.subscription.gift') {
    const nombre = totalDe(e.total);
    if (nombre === 0) return null;
    const anonyme = e.is_anonymous === true;
    return {
      genre: 'cadeau',
      nombre,
      niveau: niveauDe(e.tier),
      twitchId: anonyme ? null : idDe(e.user_id),
      pseudo: anonyme ? 'Anonyme' : nomDe(e.user_name),
      anonyme,
    };
  }
  return null;
}

/** Une annonce du tchat : un sub, un resub, un cadeau — ou rien qui compte. */
function gesteDuTchat(e: Record<string, unknown>): GesteSub | null {
  // En tchat partagé, une annonce peut venir d'une autre chaîne : ses subs ne
  // sont pas les nôtres.
  const source = e.source_broadcaster_user_id;
  if (source !== undefined && source !== null && source !== e.broadcaster_user_id) return null;

  const anonyme = e.chatter_is_anonymous === true;
  const qui = {
    twitchId: anonyme ? null : idDe(e.chatter_user_id),
    pseudo: anonyme ? 'Anonyme' : nomDe(e.chatter_user_name),
    anonyme,
  };

  switch (e.notice_type) {
    case 'sub': {
      const sub = partie(e.sub);
      if (!sub || sub.is_prime === true) return null;
      return { genre: 'sub', nombre: 1, niveau: niveauDe(sub.sub_tier), ...qui };
    }
    case 'resub': {
      const resub = partie(e.resub);
      if (!resub || resub.is_prime === true || resub.is_gift === true) return null;
      return { genre: 'resub', nombre: 1, niveau: niveauDe(resub.sub_tier), ...qui };
    }
    case 'sub_gift': {
      const cadeau = partie(e.sub_gift);
      const masse = cadeau?.community_gift_id;
      // Un sub d'un cadeau de masse : compté par l'annonce du cadeau entier.
      if (!cadeau || (masse !== undefined && masse !== null && masse !== '')) return null;
      return { genre: 'cadeau', nombre: 1, niveau: niveauDe(cadeau.sub_tier), ...qui };
    }
    case 'community_sub_gift': {
      const cadeau = partie(e.community_sub_gift);
      const nombre = totalDe(cadeau?.total);
      if (!cadeau || nombre === 0) return null;
      return { genre: 'cadeau', nombre, niveau: niveauDe(cadeau.sub_tier), ...qui };
    }
    default:
      // Un sub offert ou Prime qui passe à un sub payé ne compte pas de
      // lui-même : ses mois payés comptent par leurs resubs. Ni les raids, ni
      // les annonces, ni les bits, ni ce que Twitch ajoutera demain.
      return null;
  }
}

/** Les Boosters Perso qu'un sub vaut d'emblée à qui l'a payé : un par sub de niveau 3. */
export function boostersDuGeste(g: Pick<GesteSub, 'niveau' | 'nombre' | 'anonyme'>): number {
  return g.niveau === 3 && !g.anonyme ? g.nombre : 0;
}

/** Ce que le journal dit d'un sub compté. */
export function recitDuGeste(g: GesteSub): string {
  const niveau = `T${g.niveau}`;
  const recit =
    g.genre === 'cadeau'
      ? `${g.nombre} sub${g.nombre > 1 ? 's' : ''} ${niveau} offert${g.nombre > 1 ? 's' : ''} par ${g.anonyme ? 'un anonyme' : g.pseudo}`
      : `${g.genre} ${niveau} de ${g.pseudo}`;
  const boosters = boostersDuGeste(g);
  return boosters > 0 ? `${recit} · vaut ${boosters} Booster${boosters > 1 ? 's' : ''} Perso` : recit;
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
  genre: 'sub' | 'resub' | 'cadeau';
  twitchId: string | null;
  pseudo: string;
  nombre: number;
  niveau: number;
}

/** La ligne du registre pour un message compté. */
export function ligneDuGeste(message: { id: string; maintenant: number }, g: GesteSub): LigneSub {
  return {
    id: message.id,
    le: new Date(message.maintenant).toISOString(),
    genre: g.genre,
    twitchId: g.twitchId,
    pseudo: g.pseudo,
    nombre: g.nombre,
    niveau: g.niveau,
  };
}

/** Ce qu'une personne a payé de subs, d'après le registre. */
export interface BilanSubs {
  /** Les subs qu'elle a offerts, tous niveaux confondus. */
  offerts: number;
  /** Ses subs de niveau 3, pris pour elle ou offerts. */
  niveau3: number;
  /** Ses subs pour elle-même : nouveaux subs et resubs partagés. */
  siens: number;
}

/** Le bilan des subs payés par un compte Twitch, d'après le registre. */
export function bilanDesSubs(registre: readonly LigneSub[], twitchId: string | null): BilanSubs {
  const bilan: BilanSubs = { offerts: 0, niveau3: 0, siens: 0 };
  if (!twitchId) return bilan;
  for (const l of registre) {
    if (l.twitchId !== twitchId) continue;
    if (l.genre === 'cadeau') bilan.offerts += l.nombre;
    else bilan.siens += l.nombre;
    if (l.niveau === 3) bilan.niveau3 += l.nombre;
  }
  return bilan;
}

export interface PersoEnAttente {
  twitchId: string;
  pseudo: string;
  /** Ses subs offerts de niveau 1 ou 2 : un Booster Perso tous les cinq. */
  offerts: number;
  /** Ses subs de niveau 3, pris ou offerts : un Booster Perso chacun. */
  niveau3: number;
  /** Les Boosters Perso qu'ils valent. */
  boosters: number;
  /** Ceux que la modération en a déjà redonnés à des joueurs de la ligue. */
  donnes: number;
  /** Ce qui reste à redonner — ou à lui verser, s'il s'inscrit. */
  restants: number;
  premier: string;
  dernier: string;
}

/**
 * Qui a payé des subs qui valent un Booster Perso — des subs offerts, des subs
 * de niveau 3 — sans être inscrit à la ligue. Ses Boosters Perso forment la
 * réserve des boosters cadeau : la modération les redonne à des joueurs de la
 * ligue (`donnes`, par compte Twitch), et ce qui reste lui est versé s'il
 * s'inscrit. Les cadeaux anonymes n'y figurent pas — on ne sait pas de qui.
 */
export function persoEnAttente(
  registre: readonly LigneSub[],
  inscrits: ReadonlySet<string>,
  donnes: ReadonlyMap<string, number> = new Map(),
): PersoEnAttente[] {
  const parPersonne = new Map<string, PersoEnAttente>();
  for (const l of registre) {
    if (!l.twitchId || inscrits.has(l.twitchId)) continue;
    const niveau3 = l.niveau === 3 ? l.nombre : 0;
    const offerts = l.niveau !== 3 && l.genre === 'cadeau' ? l.nombre : 0;
    if (niveau3 === 0 && offerts === 0) continue;
    const deja = parPersonne.get(l.twitchId);
    if (deja) {
      deja.niveau3 += niveau3;
      deja.offerts += offerts;
      if (l.le > deja.dernier) {
        deja.dernier = l.le;
        deja.pseudo = l.pseudo;
      }
      if (l.le < deja.premier) deja.premier = l.le;
    } else {
      parPersonne.set(l.twitchId, {
        twitchId: l.twitchId,
        pseudo: l.pseudo,
        offerts,
        niveau3,
        boosters: 0,
        donnes: 0,
        restants: 0,
        premier: l.le,
        dernier: l.le,
      });
    }
  }
  return [...parPersonne.values()]
    .map((p) => {
      const boosters = packsPersoAcquis(p.offerts, p.niveau3);
      const donnesIci = Math.min(boosters, donnes.get(p.twitchId) ?? 0);
      return { ...p, boosters, donnes: donnesIci, restants: boosters - donnesIci };
    })
    .sort(
      (a, b) =>
        b.boosters - a.boosters ||
        b.offerts + b.niveau3 - (a.offerts + a.niveau3) ||
        b.dernier.localeCompare(a.dernier),
    );
}
