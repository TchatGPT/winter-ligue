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
 * Redonne des boosters cadeau — des Boosters Perso payés par quelqu'un qui
 * n'est pas inscrit — à un joueur de la ligue (Modération → Tableau de bord).
 * La modération choisit le viewer qui les a payés et combien ; le serveur
 * vérifie qu'il en reste assez. Sans viewer choisi, les plus anciens d'abord.
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
        donneBoosterCadeau(db, g.body.playerId, registre, g.session?.sub ?? 'admin', {
          donateur: g.body.donateur,
          nombre: g.body.nombre,
        }),
      ),
    );
  } catch (error) {
    return toResponse(error);
  }
}
