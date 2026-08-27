import 'server-only';

/**
 * Sessions signées, sans dépendance externe.
 *
 * Le jeton est un `payload.signature` en base64url, signé en HMAC-SHA256 avec
 * `AUTH_SECRET`. Il est stocké dans un cookie HttpOnly + SameSite=Lax + Secure :
 * inaccessible au JavaScript de la page, donc insensible au vol par XSS, et non
 * renvoyé sur les requêtes intersites d'écriture.
 *
 * Le jeton ne contient qu'un identifiant et un rôle. Le serveur ne fait jamais
 * confiance à autre chose : le solde de flocons, la collection et le rôle réel
 * sont toujours relus en base.
 */

import { createHmac, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = 'wl_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 h

export type Role = 'joueur' | 'admin';

export interface SessionPayload {
  /** Identifiant du joueur, ou 'admin' pour la session de modération. */
  sub: string;
  role: Role;
  /** Identifiant unique de session, utile pour tracer une révocation. */
  sid: string;
  /** Timestamps Unix en secondes. */
  iat: number;
  exp: number;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      // En production, un secret faible casse toute la chaîne : on refuse net.
      throw new Error('AUTH_SECRET manquant ou trop court (32 caractères minimum).');
    }
    return 'dev-secret-non-securise-uniquement-pour-le-developpement-local';
  }
  return value;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', secret()).update(payload).digest());
}

export function createToken(sub: string, role: Role, ttlSeconds = SESSION_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub,
    role,
    sid: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/** Vérifie signature puis expiration. Retourne null au moindre doute. */
export function verifyToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(encoded);

  // Comparaison à temps constant : pas de fuite d'information par la durée.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(encoded).toString('utf8')) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    if (payload.role !== 'admin' && payload.role !== 'joueur') return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Session courante lue depuis le cookie de la requête. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

export async function isAdmin(): Promise<boolean> {
  return (await getSession())?.role === 'admin';
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_SECONDS });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
}

/* ------------------------- Mot de passe administrateur -------------------- */

/**
 * Format stocké dans `ADMIN_PASSWORD_HASH` : `scrypt:<sel hex>:<clé hex>`.
 * Générer avec `npm run hash-password`.
 *
 * Le séparateur est un deux-points, et non un dollar : les fichiers `.env` de
 * Next développent les `$VAR`, ce qui mutilerait silencieusement une empreinte
 * contenant des dollars — et la connexion admin échouerait sans explication.
 */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const useSalt = salt ?? randomUUID().replace(/-/g, '');
  const derived = await scrypt(password, useSalt, 64);
  return `scrypt:${useSalt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  try {
    const derived = await scrypt(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
