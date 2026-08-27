import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { cancelListingSchema, createListingSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { cancelListing, createListing, viewListing } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Met une carte en vente. La copie est verrouillée : elle devient injouable. */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'market-list',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: createListingSchema,
  });
  if (!g.ok) return g.response;
  if (g.session!.role !== 'joueur') {
    return fail('NON_AUTORISE', 'Seul un joueur peut vendre une carte.');
  }

  try {
    const listing = await getStore().transaction((db) => {
      const created = createListing(db, g.session!.sub, {
        cardInstanceId: g.body.cardInstanceId,
        startPrice: g.body.startPrice,
        buyoutPrice: g.body.buyoutPrice,
        durationHours: g.body.durationHours,
      });
      return viewListing(db, created);
    });
    return ok(listing);
  } catch (error) {
    return toResponse(error);
  }
}

/** Retire une vente, uniquement si personne n'a encore enchéri. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'market-cancel',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: cancelListingSchema,
  });
  if (!g.ok) return g.response;

  try {
    const listing = await getStore().transaction((db) =>
      cancelListing(db, g.session!.sub, g.body.listingId),
    );
    return ok({ id: listing.id, status: listing.status });
  } catch (error) {
    return toResponse(error);
  }
}
