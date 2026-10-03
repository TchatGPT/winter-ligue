import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { boostersPersoSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { ajusteBoostersPerso } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le − et le + du compteur de Boosters Perso d'un joueur, sous son pseudo dans
 * le classement. Un membre de la modération peut régler le sien — décidé par
 * l'organisation : le journal garde qui a fait quoi.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-boosters-perso',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: boostersPersoSchema,
  });
  if (!g.ok) return g.response;

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
