import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { guard, ok } from '@/lib/api/respond';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';

/**
 * Déconnexion de **cet appareil** : son cookie est effacé, les sessions des
 * autres appareils restent ouvertes. Elle a révoqué tous les jetons du joueur,
 * sur tous ses appareils : se déconnecter sur le PC déconnectait aussi le
 * téléphone, qui retombait sur l'accueil sans comprendre pourquoi (décidé par
 * l'organisation le 14/10/2026).
 *
 * `sessions_depuis` reste lu par `getSession()` : une date déjà posée garde son
 * effet. Rien ne s'écrit au journal : la modération le lit, et d'où chacun se
 * connecte ne la regarde pas.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'logout', limit: LIMITS.mutation });
  if (!g.ok) return g.response;
  await clearSessionCookie();
  return ok({ deconnecte: true });
}
