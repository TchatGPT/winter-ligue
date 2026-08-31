import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { playerIdOf } from '@/lib/auth/session';
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
  // Le rôle et le profil sont deux choses distinctes : la session de secours a
  // un rôle sans profil, un administrateur qui joue a les deux.
  const playerId = playerIdOf(session);
  return ok({
    role: session.role,
    profile: playerId ? await getProfile(playerId) : null,
    twitchEnabled: isTwitchEnabled(),
  });
}
