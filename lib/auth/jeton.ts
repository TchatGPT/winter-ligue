import 'server-only';

/**
 * Les jetons de session : leur fabrication, leur vérification, leur
 * prolongation. Rien ici ne lit la base — c'est ce qui permet au proxy de
 * prolonger une session à chaque visite. Ce que la base dit du joueur (actif,
 * rôle, déconnexion) se confronte au jeton dans `session.ts`.
 *
 * Le jeton est un `payload.signature` en base64url, signé en HMAC-SHA256 avec
 * `AUTH_SECRET`.
 *
 * ## La durée
 *
 * Une session dure trente jours, et chaque visite la prolonge : un joueur qui
 * revient au moins une fois par mois ne se reconnecte plus. Elle a duré douze
 * heures, et chacun refaisait « Se connecter avec Twitch » tous les jours.
 *
 * La prolongation garde la date d'émission (`iat`) : « Se déconnecter », qui
 * révoque tout jeton émis avant elle, révoque aussi ceux qu'on a prolongés
 * depuis. Et elle s'arrête six mois après la connexion : une fois par
 * semestre, chacun repasse par Twitch.
 *
 * Le rôle ne dépend pas de cette durée : il se relit en base à chaque requête,
 * et la base suit la chaîne Twitch en direct (`channel.moderator.add/remove`,
 * voir `lib/services/twitchSubs.ts`).
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'wl_session';

const JOUR_S = 24 * 60 * 60;
/** La durée d'une session depuis la dernière visite. */
export const SESSION_TTL_SECONDS = 30 * JOUR_S;
/** Au-delà, plus de prolongation : il faut repasser par Twitch. */
export const SESSION_MAX_SECONDS = 180 * JOUR_S;
/** Une session ne se prolonge qu'une fois par jour au plus : pas un cookie neuf à chaque requête. */
const PROLONGE_APRES_S = JOUR_S;

/** Le rôle porté par une session. Le jeton en garde une copie, qui ne décide de rien. */
export type Role = 'joueur' | 'admin';

export interface SessionPayload {
  /** Identifiant du joueur. */
  sub: string;
  role: Role;
  /** Identifiant unique de session, utile pour tracer une révocation. */
  sid: string;
  /** Timestamps Unix en secondes. `iat` est la connexion, que la prolongation ne déplace pas. */
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

function scelle(payload: SessionPayload): string {
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function createToken(sub: string, role: Role, ttlSeconds = SESSION_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  return scelle({ sub, role, sid: randomUUID(), iat: now, exp: now + ttlSeconds });
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
    if (typeof payload.iat !== 'number') return null;
    if (!['admin', 'joueur'].includes(payload.role)) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * La nouvelle échéance d'une session qu'on revisite, ou null s'il n'y a rien
 * à changer : elle a été prolongée il y a moins d'un jour, ou elle a atteint
 * ses six mois. Fonction pure, sur des secondes.
 */
export function echeanceProlongee(jeton: Pick<SessionPayload, 'iat' | 'exp'>, maintenant: number): number | null {
  const echeance = Math.min(maintenant + SESSION_TTL_SECONDS, jeton.iat + SESSION_MAX_SECONDS);
  return echeance - jeton.exp >= PROLONGE_APRES_S ? echeance : null;
}

/**
 * Le jeton prolongé, ou null s'il est invalide ou n'a pas à l'être. Même
 * joueur, même rôle, même identifiant, même date d'émission : seule l'échéance
 * avance. Un jeton révoqué reste révoqué — c'est `iat` qui le dit.
 */
export function prolonge(token: string | undefined | null): { jeton: string; maxAge: number } | null {
  const lu = verifyToken(token);
  if (!lu) return null;
  const maintenant = Math.floor(Date.now() / 1000);
  const exp = echeanceProlongee(lu, maintenant);
  if (exp === null) return null;
  return { jeton: scelle({ ...lu, exp }), maxAge: exp - maintenant };
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
