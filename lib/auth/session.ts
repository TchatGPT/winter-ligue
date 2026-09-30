import 'server-only';

/**
 * Sessions signées, sans dépendance externe.
 *
 * Le jeton est un `payload.signature` en base64url, signé en HMAC-SHA256 avec
 * `AUTH_SECRET`. Il est stocké dans un cookie HttpOnly + SameSite=Lax + Secure :
 * inaccessible au JavaScript de la page, donc insensible au vol par XSS, et non
 * renvoyé sur les requêtes intersites d'écriture.
 *
 * Le jeton ne contient qu'un identifiant et un rôle, et le rôle du jeton ne
 * sert à rien : à chaque requête, `getSession()` relit en base le rôle, l'état
 * et la date de révocation du joueur. Un modérateur rétrogradé perd ses droits
 * à la requête suivante, un compte désactivé est dehors, et « Se déconnecter »
 * révoque tous les jetons déjà émis — pas seulement le cookie de ce navigateur.
 */

import { createHmac, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getStore } from '@/lib/db/store';
import { roleConfirme } from '@/lib/domain/revocation';
import { empreinteAdmin } from '@/lib/auth/empreinte';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = 'wl_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 h

/**
 * Le rôle porté par une session.
 *
 * Identique à `PlayerRole` côté base, à ceci près qu'il vit aussi dans le jeton
 * : la session de secours ouverte par `ADMIN_PASSWORD_HASH` n'a pas de joueur
 * derrière elle, et vaut `admin` sans qu'aucune ligne ne le dise.
 */
export type Role = 'joueur' | 'moderateur' | 'admin';

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

/**
 * Une clé propre à un usage, tirée de `AUTH_SECRET`.
 *
 * Le `state` de la connexion Twitch ne se signe pas avec la clé des sessions :
 * une signature valable pour l'un ne doit jamais l'être pour l'autre. Et en
 * production, pas de secret faible de repli — `secret()` refuse net.
 */
export function cleDerivee(usage: string): Buffer {
  return createHmac('sha256', secret()).update(`winter-ligue:${usage}`).digest();
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
    if (!['admin', 'moderateur', 'joueur'].includes(payload.role)) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Session courante : le cookie de la requête, vérifié, puis confronté à la base.
 *
 * Mise en cache le temps d'une requête (`cache` de React) : la mise en page,
 * la barre latérale et la page la demandent chacune, la base n'est lue qu'une
 * fois.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const jar = await cookies();
  const jeton = verifyToken(jar.get(SESSION_COOKIE)?.value);
  return jeton ? confirme(jeton) : null;
});

/**
 * Ce que dit la base d'un jeton dont la signature est bonne.
 *
 * La session de secours n'a pas de ligne : elle ne vaut que tant que la porte
 * qui l'ouvre existe — retirer `ADMIN_PASSWORD_HASH` la ferme. Toute autre
 * session doit désigner un joueur actif, émise après sa dernière déconnexion ;
 * son rôle est celui de la base, jamais celui du jeton.
 */
async function confirme(jeton: SessionPayload): Promise<SessionPayload | null> {
  if (jeton.sub === SUJET_SECOURS) {
    return empreinteAdmin() ? { ...jeton, role: 'admin' } : null;
  }
  const role = roleConfirme(jeton, await getStore().etatSession(jeton.sub));
  return role ? { ...jeton, role } : null;
}

/** Hiérarchie des rôles : chacun peut ce que peut le précédent, et davantage. */
const RANG: Record<Role, number> = { joueur: 0, moderateur: 1, admin: 2 };

/**
 * Ce rôle suffit-il ? Les rôles sont hiérarchiques, et une seule ligne le dit :
 * ce qui demande `moderateur` accepte un admin.
 */
export function aLeRang(role: Role, minimum: Role): boolean {
  return RANG[role] >= RANG[minimum];
}

/**
 * Le sujet de la session de secours, ouverte par `ADMIN_PASSWORD_HASH`.
 *
 * Ce n'est l'identifiant d'aucun joueur : c'est une session sans compte
 * derrière, gardée pour reprendre la main si plus personne n'a le rôle.
 */
export const SUJET_SECOURS = 'admin';

/**
 * L'identifiant du joueur derrière une session, ou null.
 *
 * À utiliser partout où l'on veut savoir « qui joue », par opposition à « qui a
 * le droit de faire quoi ». Les deux questions ont été confondues tant qu'il n'y
 * avait que deux rôles : tester `role === 'joueur'` répondait aux deux à la
 * fois. Depuis qu'un joueur peut être modérateur ou administrateur, ce test
 * exclut du jeu ceux à qui on vient de donner des droits — ils se voyaient
 * refuser l'ouverture d'un booster avec un « connexion requise » alors qu'ils
 * étaient connectés.
 */
export function playerIdOf(session: SessionPayload | null): string | null {
  if (!session) return null;
  return session.sub === SUJET_SECOURS ? null : session.sub;
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

export async function setSessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge });
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
