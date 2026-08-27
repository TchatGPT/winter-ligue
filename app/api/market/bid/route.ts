import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { bidSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { placeBid, viewListing } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Place une enchère.
 *
 * Les flocons sont mis sous séquestre immédiatement et l'enchérisseur précédent
 * est remboursé dans la même transaction : à aucun instant la somme des soldes
 * et des séquestres ne change. Une enchère de dernière seconde repousse la
 * clôture d'une minute, ce qui neutralise le sniping.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'market-bid',
    role: 'joueur',
    limit: LIMITS.bid,
    schema: bidSchema,
  });
  if (!g.ok) return g.response;
  if (g.session!.role !== 'joueur') {
    return fail('NON_AUTORISE', 'Seul un joueur peut enchérir.');
  }

  try {
    const result = await getStore().transaction((db) => {
      const bid = placeBid(db, g.session!.sub, g.body.listingId, g.body.amount);
      return {
        listing: viewListing(db, bid.listing),
        minimumNextBid: bid.minimumNextBid,
        balance: bid.balance,
        outbidPlayerId: bid.outbidPlayerId,
      };
    });
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
