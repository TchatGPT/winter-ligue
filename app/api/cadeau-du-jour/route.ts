import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { cadeauDuJourSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { prendsCadeauDuJour } from '@/lib/services/cadeauDuJour';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Un joueur prend son cadeau du jour.
 *
 * Le navigateur n'envoie rien que la demande : le jour, la série, le montant et
 * le droit d'y prétendre se décident dans `prendsCadeauDuJour`, dans la
 * transaction — deux clics simultanés n'en donnent qu'un.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'cadeau-du-jour',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: cadeauDuJourSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) return fail('NON_AUTHENTIFIE', 'Connexion requise.');

  try {
    const resultat = await getStore().transaction((db) => prendsCadeauDuJour(db, joueurId));
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
