import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { boosterCadeauSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { donneBoosterCadeau } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Assez de registre pour une saison de subs. */
const REGISTRE_SUBS = 5000;

/**
 * Redonne un booster cadeau — un Booster Perso payé par quelqu'un qui n'est
 * pas inscrit — à un joueur de la ligue (Modération → Vue d'ensemble). Le
 * serveur choisit la réserve : le plus ancien donateur qui en a encore.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-boosters-cadeau',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: boosterCadeauSchema,
  });
  if (!g.ok) return g.response;

  try {
    // Le registre se lit à part ; un sub arrivé entre-temps ne fait que grossir la réserve.
    const registre = await getStore().subsTwitch(REGISTRE_SUBS);
    return ok(
      await getStore().transaction((db) =>
        donneBoosterCadeau(db, g.body.playerId, registre, g.session?.sub ?? 'admin'),
      ),
    );
  } catch (error) {
    return toResponse(error);
  }
}
