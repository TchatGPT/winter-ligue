import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { creeCodeSchema, desactiveCodeSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { creeCode, desactiveCode } from '@/lib/services/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Les codes cadeaux, côté modération : c'est ainsi que les flocons se donnent.
 * Un code porte un montant et un nombre d'utilisations ; il se crée, et se
 * désactive. Chaque geste est inscrit au journal.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-codes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: creeCodeSchema,
  });
  if (!g.ok) return g.response;

  try {
    const code = await getStore().transaction((db) => creeCode(db, g.body, g.session?.sub ?? 'admin'));
    return ok({ id: code.id, code: code.code, montant: code.montant, utilisationsMax: code.utilisationsMax });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-codes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: desactiveCodeSchema,
  });
  if (!g.ok) return g.response;

  try {
    const code = await getStore().transaction((db) => desactiveCode(db, g.body.id, g.session?.sub ?? 'admin'));
    return ok({ id: code.id, actif: code.actif });
  } catch (error) {
    return toResponse(error);
  }
}
