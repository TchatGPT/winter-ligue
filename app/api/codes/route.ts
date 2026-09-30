import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { utiliseCodeSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { utiliseCode } from '@/lib/services/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Un joueur tape un code cadeau.
 *
 * Le navigateur n'envoie que le code : le montant, les utilisations et le droit
 * de s'en servir se décident dans `utiliseCode`. Les essais sont comptés serré,
 * pour qu'on ne trouve pas un code en les enchaînant.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'code-cadeau',
    role: 'joueur',
    limit: LIMITS.code,
    schema: utiliseCodeSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) return fail('NON_AUTHENTIFIE', 'Connexion requise.');

  try {
    const resultat = await getStore().transaction((db) =>
      utiliseCode(db, joueurId, g.body.code, chaineDeLaLigue()),
    );
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
