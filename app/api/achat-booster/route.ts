import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { achatBoosterSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { acheteBoosterPerso } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Un joueur échange ses flocons contre un Booster Perso.
 *
 * Le navigateur n'envoie qu'une clé d'achat : le prix, le solde et le droit
 * d'acheter se décident dans `acheteBoosterPerso`, dans la transaction — deux
 * clics avec la même clé n'achètent qu'un booster.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'achat-booster',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: achatBoosterSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) return fail('NON_AUTHENTIFIE', 'Connexion requise.');

  try {
    const resultat = await getStore().transaction((db) => acheteBoosterPerso(db, joueurId, g.body.cle));
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
