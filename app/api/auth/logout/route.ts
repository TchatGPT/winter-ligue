import { NextResponse } from 'next/server';
import { clearSessionCookie, playerIdOf } from '@/lib/auth/session';
import { guard, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';

/**
 * Déconnexion : le cookie est effacé, **et** tous les jetons du joueur sont
 * révoqués — la date posée ici fait refuser toute session émise avant elle,
 * sur tous ses appareils. Un cookie copié ailleurs ne survit pas.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'logout', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (joueurId) {
    await getStore().transaction((db) => {
      const joueur = db.players.find((p) => p.id === joueurId);
      if (joueur) joueur.sessionsDepuis = new Date().toISOString();
    });
  }
  await clearSessionCookie();
  return ok({ deconnecte: true });
}
