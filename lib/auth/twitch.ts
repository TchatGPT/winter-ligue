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

const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const USERS_URL = 'https://api.twitch.tv/helix/users';

export function isTwitchEnabled(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

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

export function redirectUri(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/auth/twitch/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    // Portée minimale : on ne veut que l'identité publique.
    scope: 'user:read:email',
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
}

/** Échange le code contre un jeton, puis lit le profil. */
export async function exchangeCode(code: string): Promise<TwitchProfile | null> {
  if (!isTwitchEnabled()) return null;

  const tokenResponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
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

  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    avatarUrl: user.profile_image_url || null,
  };
}
