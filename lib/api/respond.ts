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
import { getSession, type Role, type SessionPayload } from '@/lib/auth/session';
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

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(extra ?? {}) } },
    { status: STATUS[code] },
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

export interface GuardOptions<T> {
  /** Rôle minimum exigé. Omis = route publique. */
  role?: Role;
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
    if (options.role === 'admin' && session.role !== 'admin') {
      return { ok: false, response: fail('NON_AUTORISE', 'Accès réservé à la modération.') };
    }
  }

  let body = undefined as T;
  if (options.schema) {
    let raw: unknown;
    try {
      raw = await request.json();
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
