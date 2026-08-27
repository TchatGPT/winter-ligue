import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { getProfile } from '@/lib/services/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contexte de la session courante.
 *
 * Volontairement tolérant : un visiteur non connecté reçoit une réponse 200
 * avec `profile: null` plutôt qu'une 401, ce qui évite au client d'avoir à
 * traiter une erreur pour un cas parfaitement normal.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'me' });
  if (!g.ok) return g.response;

  const session = g.session;
  if (!session) {
    return ok({ role: null, profile: null, twitchEnabled: isTwitchEnabled() });
  }
  if (session.role === 'admin') {
    return ok({ role: 'admin', profile: null, twitchEnabled: isTwitchEnabled() });
  }

  return ok({
    role: 'joueur',
    profile: await getProfile(session.sub),
    twitchEnabled: isTwitchEnabled(),
  });
}
