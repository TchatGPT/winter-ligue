import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { buyoutSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { buyout, viewListing } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Achat immédiat : conclut la vente sur-le-champ et rembourse l'enchérisseur en tête. */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'market-buyout',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: buyoutSchema,
  });
  if (!g.ok) return g.response;
  if (g.session!.role !== 'joueur') {
    return fail('NON_AUTORISE', 'Seul un joueur peut acheter une carte.');
  }

  try {
    const result = await getStore().transaction((db) => {
      const listing = buyout(db, g.session!.sub, g.body.listingId);
      return viewListing(db, listing);
    });
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
