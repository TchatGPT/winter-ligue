import { NextResponse } from 'next/server';
import { createToken, setSessionCookie, verifyPassword } from '@/lib/auth/session';
import { fail, guard, ok } from '@/lib/api/respond';
import { loginSchema } from '@/lib/api/schemas';
import { LIMITS, reset } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';

/**
 * Connexion de la modération.
 *
 * Le mot de passe n'est jamais stocké : seul son empreinte scrypt vit dans
 * `ADMIN_PASSWORD_HASH`. La limitation à 5 tentatives par quart d'heure et par
 * IP rend le forçage impraticable, et la réponse est volontairement identique
 * que le hash soit absent ou le mot de passe faux — on ne renseigne pas un
 * attaquant sur l'état de la configuration.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-login',
    limit: LIMITS.login,
    schema: loginSchema,
  });
  if (!g.ok) return g.response;

  const hash = process.env.ADMIN_PASSWORD_HASH;
  const valid = hash ? await verifyPassword(g.body.password, hash) : false;

  if (!valid) {
    return fail('NON_AUTHENTIFIE', 'Mot de passe incorrect.');
  }

  // Connexion réussie : on relâche le compteur pour ne pas pénaliser l'admin.
  reset(`admin-login:${g.ip}`);
  await setSessionCookie(createToken('admin', 'admin'));
  return ok({ role: 'admin' });
}
