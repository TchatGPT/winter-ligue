import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { batailleSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { annuleBataille, vueBataille } from '@/lib/services/batailles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Annule sa bataille tant que personne ne l'a rejointe, et récupère sa mise.
 *
 * Sans cette sortie, une bataille créée un soir sans adversaire immobiliserait
 * les flocons de l'hôte indéfiniment.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'batailles-annuler',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: batailleSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut annuler une bataille.');
  }

  try {
    const vue = await getStore().transaction((db) =>
      vueBataille(db, annuleBataille(db, joueurId, g.body.batailleId)),
    );
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
