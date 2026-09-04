import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { defausseSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { defausseCarte } from '@/lib/services/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Défausse une carte : elle disparaît, un flocon revient.
 *
 * Destruction et crédit dans la même transaction : impossible d'encaisser sans
 * perdre la carte, ni de la perdre sans être payé. Le geste est **définitif** et
 * n'a pas d'idempotence — deux envois défaussent deux exemplaires, ce qui est
 * exactement ce qu'un double clic sur deux cartes différentes doit faire ; c'est
 * à l'écran de demander confirmation.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'cards-defausser',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: defausseSchema,
  });
  if (!g.ok) return g.response;

  // L'identité, pas le rôle : un administrateur qui joue reste un joueur.
  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut défausser une carte.');
  }

  try {
    const result = await getStore().transaction((db) =>
      defausseCarte(db, joueurId, g.body.cardInstanceId),
    );
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
