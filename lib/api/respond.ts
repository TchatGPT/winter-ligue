import 'server-only';

/**
 * Fabrique de réponses d'API et garde-fous partagés par toutes les routes.
 *
 * Trois choses passent systématiquement par ici :
 *  - la validation Zod du corps de requête,
 *  - la vérification d'origine (protection CSRF),
 *  - la limitation de débit.
 *
 * Une route qui oublierait l'un des trois serait une faille ; les regrouper
 * dans un seul `guard()` rend l'oubli visible à la relecture.
 */

import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { aLeRang, getSession, type Role, type SessionPayload } from '@/lib/auth/session';
import { consume, LIMITS } from '@/lib/security/ratelimit';

export type ApiErrorCode =
  | 'REQUETE_INVALIDE'
  | 'NON_AUTHENTIFIE'
  | 'NON_AUTORISE'
  | 'INTROUVABLE'
  | 'CONFLIT'
  | 'ORIGINE_REFUSEE'
  | 'TROP_DE_REQUETES'
  | 'ERREUR_SERVEUR';

const STATUS: Record<ApiErrorCode, number> = {
  REQUETE_INVALIDE: 400,
  NON_AUTHENTIFIE: 401,
  NON_AUTORISE: 403,
  INTROUVABLE: 404,
  CONFLIT: 409,
  ORIGINE_REFUSEE: 403,
  TROP_DE_REQUETES: 429,
  ERREUR_SERVEUR: 500,
};

/**
 * Une réponse d'API ne se met jamais en cache, ni par le navigateur ni par un
 * intermédiaire : elle dépend de la session, et un solde ou un rôle servi à la
 * mauvaise personne est une fuite.
 */
const SANS_CACHE = { 'cache-control': 'private, no-store' };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    { ok: true, data },
    { status: 200, ...init, headers: { ...SANS_CACHE, ...(init?.headers ?? {}) } },
  );
}

export function fail(
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(extra ?? {}) } },
    { status: STATUS[code], headers: SANS_CACHE },
  );
}

/**
 * Adresse cliente. Derrière Vercel, `x-forwarded-for` est réécrit par la
 * plateforme et n'est donc pas falsifiable ; en auto-hébergement il faut
 * s'assurer que le reverse proxy fait de même.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'inconnue';
}

/**
 * Protection CSRF. Les cookies étant en SameSite=Lax, une requête d'écriture
 * intersite n'emporte déjà pas la session ; cette vérification d'origine ferme
 * le cas des navigateurs anciens et des requêtes forgées côté serveur.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  // Une requête sans Origin ne vient pas d'un navigateur (curl, cron interne).
  if (!origin) return true;

  const allowed = new Set<string>();
  const host = request.headers.get('host');
  if (host) {
    allowed.add(`https://${host}`);
    if (process.env.NODE_ENV !== 'production') allowed.add(`http://${host}`);
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) allowed.add(configured.replace(/\/$/, ''));

  return allowed.has(origin.replace(/\/$/, ''));
}

/** Le corps d'une requête d'API ne dépasse pas 64 Kio, sauf route qui le dit. */
const CORPS_MAX = 64 * 1024;

export interface GuardOptions<T> {
  /** Rôle minimum exigé. Omis = route publique. */
  role?: Role;
  /** Taille maximale du corps, en octets. 64 Kio par défaut. */
  corpsMax?: number;
  /** Barème de limitation ; par défaut celui des lectures. */
  limit?: { limit: number; windowMs: number };
  /** Schéma du corps JSON. Omis = corps ignoré. */
  schema?: ZodType<T>;
  /** Nom utilisé comme clé de limitation. */
  scope: string;
}

export type GuardResult<T> =
  | { ok: true; session: SessionPayload | null; body: T; ip: string }
  | { ok: false; response: NextResponse };

/**
 * Applique origine, débit, authentification et validation dans cet ordre —
 * du contrôle le moins coûteux au plus coûteux, pour qu'un flood soit rejeté
 * avant d'avoir touché la base.
 */
export async function guard<T = undefined>(
  request: Request,
  options: GuardOptions<T>,
): Promise<GuardResult<T>> {
  const method = request.method.toUpperCase();
  const mutating = method !== 'GET' && method !== 'HEAD';

  if (mutating && !sameOrigin(request)) {
    return { ok: false, response: fail('ORIGINE_REFUSEE', 'Origine de la requête refusée.') };
  }

  const ip = clientIp(request);
  const barème = options.limit ?? LIMITS.read;
  const rate = consume(`${options.scope}:${ip}`, barème.limit, barème.windowMs);
  if (!rate.ok) {
    return {
      ok: false,
      response: fail('TROP_DE_REQUETES', 'Trop de requêtes, réessaie dans un instant.', {
        retryAfter: rate.retryAfter,
      }),
    };
  }

  const session = await getSession();
  if (options.role) {
    if (!session) {
      return { ok: false, response: fail('NON_AUTHENTIFIE', 'Connexion requise.') };
    }
    /*
     * Les rôles sont hiérarchiques, et une seule ligne le dit.
     *
     * Une route qui demande `joueur` accepte donc un admin, ce qui évite
     * l'erreur classique — lister les rôles autorisés route par route, puis en
     * oublier un le jour où on en ajoute un. Une route qui demande `admin`
     * n'accepte que lui.
     */
    if (!aLeRang(session.role, options.role)) {
      return { ok: false, response: fail('NON_AUTORISE', 'Droits insuffisants.') };
    }
  }

  let body = undefined as T;
  if (options.schema) {
    // Du JSON, et rien d'autre : un formulaire posté depuis un autre site ne
    // peut envoyer ce type sans demander la permission au navigateur.
    const type = request.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) {
      return { ok: false, response: fail('REQUETE_INVALIDE', 'Le corps doit être du JSON.') };
    }
    const max = options.corpsMax ?? CORPS_MAX;
    const annonce = Number(request.headers.get('content-length') ?? '0');
    if (annonce > max) {
      return { ok: false, response: fail('REQUETE_INVALIDE', 'Corps de requête trop volumineux.') };
    }
    let raw: unknown;
    try {
      const texte = await request.text();
      if (Buffer.byteLength(texte) > max) {
        return { ok: false, response: fail('REQUETE_INVALIDE', 'Corps de requête trop volumineux.') };
      }
      raw = JSON.parse(texte);
    } catch {
      return { ok: false, response: fail('REQUETE_INVALIDE', 'Corps JSON illisible.') };
    }
    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        response: fail('REQUETE_INVALIDE', 'Données invalides.', {
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        }),
      };
    }
    body = parsed.data;
  }

  return { ok: true, session, body, ip };
}
