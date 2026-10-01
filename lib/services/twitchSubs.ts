import 'server-only';

/**
 * Les subs Twitch, en direct : EventSub prévient le site à chaque sub.
 *
 * ## Le branchement
 *
 * La streameuse autorise une fois l'application à lire son tchat
 * (`user:read:chat`, avec `user:bot` et `channel:bot`), en passant par la
 * connexion Twitch avec `subs=1`. Le site crée alors, avec le jeton de
 * l'application, ses abonnements EventSub en webhook vers
 * `/api/twitch/eventsub` : les annonces du tchat — subs, resubs et cadeaux, les
 * seules à dire si un sub est Prime —, et les modérateurs ajoutés ou retirés
 * (`moderation:read`), pour que les rôles suivent la chaîne en direct. Rien
 * n'est stocké ici : Twitch garde l'autorisation et les abonnements, et
 * l'administration relit leur état chez lui.
 *
 * ## La signature
 *
 * Chaque message est signé par Twitch (HMAC-SHA256) avec un secret que le site
 * lui a donné en créant l'abonnement. Ce secret est tiré d'`AUTH_SECRET`, pour
 * cet usage seul : il n'est écrit nulle part, et changer `AUTH_SECRET` oblige à
 * rebrancher.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cleDerivee } from '@/lib/auth/session';
import { baseDuSite } from '@/lib/auth/twitch';
import { TYPE_TCHAT, TYPES_EVENTSUB } from '@/lib/domain/twitchSubs';
import { entetes, jetonApplication, oublieJeton } from './twitchApp';

const EVENTSUB_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';

/** Là où Twitch envoie ses messages. */
export const CHEMIN_EVENTSUB = '/api/twitch/eventsub';

function secret(): string {
  return cleDerivee('eventsub').toString('hex');
}

/** La signature de Twitch est-elle la bonne ? Comparée à temps constant. */
export function signatureValide(id: string, horodatage: string, corps: string, signature: string): boolean {
  const attendue = `sha256=${createHmac('sha256', secret()).update(id + horodatage + corps).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------ Les abonnements ---------------------------- */

interface AbonnementTwitch {
  id: string;
  type: string;
  status: string;
  transport: { method: string; callback?: string };
}

/** Les abonnements du site chez Twitch : ceux qui visent son adresse. */
async function nosAbonnements(jeton: string): Promise<AbonnementTwitch[] | null> {
  const tous: AbonnementTwitch[] = [];
  let curseur: string | undefined;
  // Cent par page ; cinq pages bornent l'appel, bien au-delà de nos trois.
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams();
    if (curseur) params.set('after', curseur);
    const reponse = await fetch(`${EVENTSUB_URL}?${params.toString()}`, { headers: entetes(jeton), cache: 'no-store' });
    if (!reponse.ok) {
      if (reponse.status === 401) oublieJeton();
      return null;
    }
    const charge = (await reponse.json()) as { data?: AbonnementTwitch[]; pagination?: { cursor?: string } };
    tous.push(...(charge.data ?? []));
    curseur = charge.pagination?.cursor;
    if (!curseur) break;
  }
  return tous.filter((a) => a.transport.method === 'webhook' && a.transport.callback?.endsWith(CHEMIN_EVENTSUB));
}

export interface BranchementSubs {
  ok: boolean;
  /** Pour chaque type : accepté par Twitch, ou le code de son refus. */
  details: { type: string; ok: boolean; statut: number }[];
}

/**
 * La condition d'un abonnement. Les annonces du tchat se lisent au nom d'un
 * compte : celui de la streameuse, qui a autorisé `user:read:chat` et
 * `user:bot`, et `channel:bot` pour sa chaîne.
 */
function conditionDe(type: string, broadcasterId: string): Record<string, string> {
  return type === TYPE_TCHAT
    ? { broadcaster_user_id: broadcasterId, user_id: broadcasterId }
    : { broadcaster_user_id: broadcasterId };
}

/**
 * Branche les subs de la chaîne sur le site.
 *
 * Les abonnements qui existaient sont d'abord retirés, puis recréés : leur
 * secret suit `AUTH_SECRET`, et un branchement relancé répare toujours. Twitch
 * vérifie aussitôt l'adresse, en y envoyant un défi auquel la route répond.
 *
 * Le retrait est vérifié avant de rien créer : un ancien abonnement resté actif
 * à côté des annonces du tchat compterait chaque sub deux fois. Au moindre
 * doute, rien n'est créé, et le branchement échoue en le disant.
 *
 * La streameuse doit avoir autorisé l'application à lire son tchat : sans cela,
 * Twitch refuse l'abonnement (403).
 */
export async function brancheSubs(broadcasterId: string, origine: string): Promise<BranchementSubs> {
  const jeton = await jetonApplication();
  if (!jeton) return { ok: false, details: [] };

  const existants = await nosAbonnements(jeton);
  if (!existants) return { ok: false, details: [{ type: 'lecture des abonnements', ok: false, statut: 0 }] };
  for (const a of existants) {
    const retrait = await fetch(`${EVENTSUB_URL}?id=${encodeURIComponent(a.id)}`, {
      method: 'DELETE',
      headers: entetes(jeton),
      cache: 'no-store',
    });
    // 404 : déjà parti.
    if (!retrait.ok && retrait.status !== 404) {
      return { ok: false, details: [{ type: `retrait de ${a.type}`, ok: false, statut: retrait.status }] };
    }
  }

  const callback = `${baseDuSite(origine)}${CHEMIN_EVENTSUB}`;
  const details: BranchementSubs['details'] = [];
  for (const type of TYPES_EVENTSUB) {
    const reponse = await fetch(EVENTSUB_URL, {
      method: 'POST',
      headers: { ...entetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({
        type,
        version: '1',
        condition: conditionDe(type, broadcasterId),
        transport: { method: 'webhook', callback, secret: secret() },
      }),
      cache: 'no-store',
    });
    // 409 : il existe déjà — créé entre-temps, avec le même secret.
    details.push({ type, ok: reponse.ok || reponse.status === 409, statut: reponse.status });
  }
  return { ok: details.every((d) => d.ok), details };
}

export interface EtatSubsTwitch {
  /** Chaque type attendu, et son état chez Twitch (`enabled` quand tout va bien). */
  types: { type: string; statut: string | null }[];
  branche: boolean;
}

/** Ce que Twitch dit des abonnements du site. Null s'il ne répond pas. */
export async function etatSubsTwitch(): Promise<EtatSubsTwitch | null> {
  const jeton = await jetonApplication();
  if (!jeton) return null;
  const nos = await nosAbonnements(jeton);
  if (!nos) return null;
  const types = TYPES_EVENTSUB.map((type) => {
    const siens = nos.filter((a) => a.type === type);
    const actif = siens.find((a) => a.status === 'enabled');
    return { type, statut: actif?.status ?? siens[0]?.status ?? null };
  });
  return { types, branche: types.every((t) => t.statut === 'enabled') };
}
