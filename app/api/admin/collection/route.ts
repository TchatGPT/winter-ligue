import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { momentSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { createMomentCard, poolOverview } from '@/lib/services/collection';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Composition du pool, pour le tableau de bord de la modération. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'pool-read' });
  if (!g.ok) return g.response;
  return ok(await getStore().read((db) => poolOverview(db)));
}

/**
 * Crée une carte Moment.
 *
 * Réservé à la modération, et volontairement sans effet en jeu : une carte
 * créée à la volée pendant un live ne doit jamais pouvoir déséquilibrer le
 * classement. Elle entre dans les tirages dès sa création.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-moment',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: momentSchema,
  });
  if (!g.ok) return g.response;

  try {
    const card = await getStore().transaction((db) => {
      const created = createMomentCard(db, g.body);
      audit(db, 'admin', 'CARTE_MOMENT_CREEE', created.id, `${created.name} (${created.rarity})`);
      return created;
    });
    return ok(card);
  } catch (error) {
    return toResponse(error);
  }
}
