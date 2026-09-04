import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { batailleSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { batailleContreBot, vueBataille } from '@/lib/services/batailles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lance sa bataille contre l'adversaire virtuel, faute d'humain.
 *
 * Le bot ouvre les mêmes sachets avec les mêmes tables, tirés par la même
 * fonction : il gagne à peu près une fois sur deux, et l'espérance du mode est
 * neutre. C'est délibéré — un site dont les taux affichés sont ceux qui
 * s'appliquent ne peut pas se permettre un adversaire truqué à côté.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'batailles-bot',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: batailleSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut lancer une bataille.');
  }

  try {
    const vue = await getStore().transaction((db) =>
      vueBataille(db, batailleContreBot(db, joueurId, g.body.batailleId)),
    );
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
