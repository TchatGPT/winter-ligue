import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { boostersPersoSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { ajusteBoostersPerso } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le − et le + du compteur de Boosters Perso d'un joueur (Modération → Joueurs).
 * Personne ne règle le sien : un autre membre de la modération le fait.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-boosters-perso',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: boostersPersoSchema,
  });
  if (!g.ok) return g.response;

  if (g.body.playerId === playerIdOf(g.session)) {
    return fail('NON_AUTORISE', 'On ne règle pas ses propres Boosters Perso : un autre membre de la modération le fait.');
  }

  try {
    return ok(
      await getStore().transaction((db) =>
        ajusteBoostersPerso(db, g.body.playerId, g.body.sens, g.session?.sub ?? 'admin'),
      ),
    );
  } catch (error) {
    return toResponse(error);
  }
}
