import 'server-only';

/**
 * Authentification Twitch — câblage prêt, activation différée.
 *
 * Le flux implémenté est OAuth 2.0 « authorization code », avec un paramètre
 * `state` signé qui sert à la fois de protection CSRF et de porteur de la page
 * de retour. Tant que `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` ne sont pas
 * définis, `isTwitchEnabled()` renvoie false et l'interface propose la connexion
 * de développement à la place.
 *
 * Rien à réécrire le jour où on branche Twitch : il suffira de renseigner les
 * variables d'environnement et de déclarer l'URL de redirection dans la console
 * développeur Twitch.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SEASON } from '@/lib/domain/rules';

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const MODERATED_URL = 'https://api.twitch.tv/helix/moderation/channels';

export function isTwitchEnabled(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

/**
 * Le code que la route de départ remet à l'adresse de retour tant que Twitch
 * n'est pas branché. Voir `lib/auth/simulation.ts`.
 */
export const CODE_SIMULATION = 'simulation';

function stateSecret(): string {
  return process.env.AUTH_SECRET ?? 'dev-secret-non-securise-uniquement-pour-le-developpement-local';
}

/** `state` = nonce.signature. Signé pour qu'un tiers ne puisse pas en forger un. */
export function createState(returnTo = '/'): string {
  const nonce = `${randomUUID()}|${encodeURIComponent(returnTo)}`;
  const signature = createHmac('sha256', stateSecret()).update(nonce).digest('base64url');
  return `${Buffer.from(nonce).toString('base64url')}.${signature}`;
}

export function verifyState(state: string | null): { valid: boolean; returnTo: string } {
  if (!state) return { valid: false, returnTo: '/' };
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return { valid: false, returnTo: '/' };

  const nonce = Buffer.from(state.slice(0, dot), 'base64url').toString('utf8');
  const expected = createHmac('sha256', stateSecret()).update(nonce).digest('base64url');
  const provided = state.slice(dot + 1);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, returnTo: '/' };

  const [, encodedReturn] = nonce.split('|');
  const returnTo = decodeURIComponent(encodedReturn ?? '/');
  // On n'accepte qu'un chemin interne : pas de redirection ouverte.
  return { valid: true, returnTo: returnTo.startsWith('/') ? returnTo : '/' };
}

/**
 * L'adresse de retour — celle à déclarer dans la console développeur Twitch,
 * « OAuth Redirect URLs » : `https://www.winter-ligue.com/api/auth/twitch/callback`.
 *
 * Elle suit le domaine par lequel on est arrivé, sauf si
 * `NEXT_PUBLIC_SITE_URL` l'impose. Elle ne dépendait que de cette variable,
 * absente sur Vercel : le jour du branchement, Twitch aurait renvoyé vers
 * localhost.
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
    // L'identité publique, et la liste des chaînes que la personne modère :
    // c'est elle qui dit si elle est modératrice de la chaîne de la ligue.
    scope: 'user:read:email user:read:moderated_channels',
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
   * `admin` pour la streameuse, `moderateur` pour ses modérateurs, `joueur`
   * pour tous les autres. `null` quand la chaîne n'est pas configurée
   * (`TWITCH_BROADCASTER_LOGIN`) : on ne touche alors à aucun rôle.
   */
  roleChaine: 'admin' | 'moderateur' | 'joueur' | null;
}

/** La chaîne de la ligue, en minuscules, ou null si elle n'est pas renseignée. */
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
    if (user.login.toLowerCase() === chaine) roleChaine = 'admin';
    else roleChaine = (await modereLaChaine(token.access_token, user.id, chaine)) ? 'moderateur' : 'joueur';
  }

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    avatarUrl: user.profile_image_url || null,
    roleChaine,
  };
}
