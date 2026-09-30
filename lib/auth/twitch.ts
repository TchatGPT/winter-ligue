import 'server-only';

/**
 * Authentification Twitch.
 *
 * Le flux est OAuth 2.0 « authorization code ». Le paramètre `state` est signé,
 * il expire au bout de dix minutes, et il est lié au navigateur qui a commencé
 * la connexion par un nonce posé en cookie : un `state` volé, ou fabriqué pour
 * faire entrer quelqu'un sur le compte d'un autre, ne sert à rien.
 *
 * Tant que `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` ne sont pas définis,
 * `isTwitchEnabled()` renvoie false et la connexion Twitch est **fermée**. Elle
 * a été simulée un temps — un clic, et l'on entrait en administrateur — : cette
 * porte laissait n'importe qui prendre la main sur la ligue, elle n'existe plus.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { cleDerivee } from '@/lib/auth/session';
import { SEASON } from '@/lib/domain/rules';

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const MODERATED_URL = 'https://api.twitch.tv/helix/moderation/channels';

/** Le cookie qui lie un `state` au navigateur qui l'a demandé. */
const COOKIE_OAUTH = 'wl_oauth';
/** Le temps laissé pour passer chez Twitch et revenir. */
const DUREE_STATE_S = 10 * 60;

export function isTwitchEnabled(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

/**
 * Un chemin du site, et rien d'autre : pas d'adresse d'un autre domaine
 * (`//ailleurs.fr`, `/\ailleurs.fr`, que les navigateurs lisent comme telle),
 * pas de retour à la ligne. Tout le reste ramène à l'accueil.
 */
export function cheminInterne(brut: string | null | undefined): string {
  if (!brut || !brut.startsWith('/') || brut.startsWith('//') || brut.startsWith('/\\')) return '/';
  if (brut.length > 200) return '/';
  for (let i = 0; i < brut.length; i += 1) {
    const code = brut.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return '/';
  }
  return brut;
}

function signe(charge: string): string {
  return createHmac('sha256', cleDerivee('oauth-state')).update(charge).digest('base64url');
}

/** Comparaison à temps constant de deux chaînes. */
function egales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Le départ d'une connexion : le `state` qui part chez Twitch, et le nonce qui
 * reste dans le navigateur. Au retour, les deux doivent se répondre.
 */
export function createState(returnTo: string): { state: string; nonce: string } {
  const nonce = randomBytes(32).toString('base64url');
  const charge = Buffer.from(
    JSON.stringify({ n: nonce, r: cheminInterne(returnTo), e: Math.floor(Date.now() / 1000) + DUREE_STATE_S }),
  ).toString('base64url');
  return { state: `${charge}.${signe(charge)}`, nonce };
}

export function verifyState(
  state: string | null,
  nonce: string | undefined,
): { valid: boolean; returnTo: string } {
  const refus = { valid: false, returnTo: '/' };
  if (!state || !nonce) return refus;
  const point = state.lastIndexOf('.');
  if (point <= 0) return refus;

  const charge = state.slice(0, point);
  if (!egales(state.slice(point + 1), signe(charge))) return refus;

  try {
    const lu = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8')) as { n?: unknown; r?: unknown; e?: unknown };
    if (typeof lu.e !== 'number' || lu.e * 1000 <= Date.now()) return refus;
    if (typeof lu.n !== 'string' || !egales(lu.n, nonce)) return refus;
    return { valid: true, returnTo: cheminInterne(typeof lu.r === 'string' ? lu.r : '/') };
  } catch {
    return refus;
  }
}

/** Pose le nonce du départ, pour dix minutes, sur les seules routes Twitch. */
export async function poseNonce(nonce: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_OAUTH, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/twitch',
    maxAge: DUREE_STATE_S,
  });
}

/** Lit le nonce du départ, et l'efface : un `state` ne sert qu'une fois. */
export async function reprendsNonce(): Promise<string | undefined> {
  const jar = await cookies();
  const nonce = jar.get(COOKIE_OAUTH)?.value;
  jar.set(COOKIE_OAUTH, '', { httpOnly: true, sameSite: 'lax', path: '/api/auth/twitch', maxAge: 0 });
  return nonce;
}

/**
 * L'adresse de retour — celle à déclarer dans la console développeur Twitch,
 * « OAuth Redirect URLs » : `https://www.winter-ligue.com/api/auth/twitch/callback`.
 *
 * Elle suit le domaine par lequel on est arrivé, sauf si
 * `NEXT_PUBLIC_SITE_URL` l'impose. Twitch refuse de toute façon toute adresse
 * qui n'est pas déclarée chez lui.
 */
export function redirectUri(origine: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || origine).replace(/\/$/, '');
  return `${base}/api/auth/twitch/callback`;
}

export function authorizeUrl(state: string, origine: string): string {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? '',
    redirect_uri: redirectUri(origine),
    response_type: 'code',
    // Le strict nécessaire : la liste des chaînes que la personne modère,
    // qui dit si elle est modératrice de la chaîne de la ligue. L'identité
    // publique vient sans portée ; l'adresse e-mail n'est jamais demandée.
    scope: 'user:read:moderated_channels',
    state,
    force_verify: 'true',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TwitchProfile {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  /**
   * Le rôle que Twitch donne à cette personne sur la chaîne de la ligue :
   * `admin` pour la streameuse **et pour ses modérateurs**, `joueur` pour tous
   * les autres. `null` quand la chaîne n'est pas configurée : on ne touche
   * alors à aucun rôle.
   */
  roleChaine: 'admin' | 'joueur' | null;
}

/** La chaîne de la ligue : `TWITCH_BROADCASTER_LOGIN`, sinon celle de la saison. */
export function chaineDeLaLigue(): string {
  const login = process.env.TWITCH_BROADCASTER_LOGIN?.trim().toLowerCase();
  return login || SEASON.chaine;
}

/**
 * Cette personne modère-t-elle la chaîne de la ligue ?
 *
 * On lit, avec son propre jeton, la liste des chaînes qu'elle modère. En cas
 * d'échec ou de doute, la réponse est non : un rôle ne s'accorde jamais par
 * défaut.
 */
async function modereLaChaine(jeton: string, userId: string, chaine: string): Promise<boolean> {
  let curseur: string | undefined;
  // Cent chaînes par page ; cinq pages suffisent largement, et bornent l'appel.
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ user_id: userId, first: '100' });
    if (curseur) params.set('after', curseur);
    const reponse = await fetch(`${MODERATED_URL}?${params.toString()}`, {
      headers: { authorization: `Bearer ${jeton}`, 'client-id': process.env.TWITCH_CLIENT_ID! },
      cache: 'no-store',
    });
    if (!reponse.ok) return false;
    const charge = (await reponse.json()) as {
      data?: { broadcaster_login: string }[];
      pagination?: { cursor?: string };
    };
    if ((charge.data ?? []).some((c) => c.broadcaster_login.toLowerCase() === chaine)) return true;
    curseur = charge.pagination?.cursor;
    if (!curseur) return false;
  }
  return false;
}

/**
 * Échange le code contre un jeton, puis lit le profil. L'adresse de retour
 * doit être exactement celle envoyée au départ : Twitch la compare.
 */
export async function exchangeCode(code: string, origine: string): Promise<TwitchProfile | null> {
  if (!isTwitchEnabled()) return null;

  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(origine),
    }),
    cache: 'no-store',
  });
  if (!tokenResponse.ok) return null;

  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return null;

  const userResponse = await fetch(USERS_URL, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
      'client-id': process.env.TWITCH_CLIENT_ID!,
    },
    cache: 'no-store',
  });
  if (!userResponse.ok) return null;

  const payload = (await userResponse.json()) as {
    data?: { id: string; login: string; display_name: string; profile_image_url: string }[];
  };
  const user = payload.data?.[0];
  if (!user) return null;

  const chaine = chaineDeLaLigue();
  let roleChaine: TwitchProfile['roleChaine'] = null;
  if (chaine) {
    // La streameuse et ses modérateurs administrent la ligue ; les autres jouent.
    if (user.login.toLowerCase() === chaine) roleChaine = 'admin';
    else roleChaine = (await modereLaChaine(token.access_token, user.id, chaine)) ? 'admin' : 'joueur';
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    avatarUrl: user.profile_image_url || null,
    roleChaine,
  };
}
