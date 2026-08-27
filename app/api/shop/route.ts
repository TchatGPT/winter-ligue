import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { purchaseSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { BOOSTERS } from '@/lib/domain/catalog';
import { discountedPrice } from '@/lib/domain/economy';
import { LIMITS } from '@/lib/security/ratelimit';
import { purchaseAndOpen } from '@/lib/services/cards';
import { bonusesFor } from '@/lib/services/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Catalogue des boosters, avec le prix réellement applicable au joueur connecté. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'shop-read' });
  if (!g.ok) return g.response;

  const playerId = g.session?.role === 'joueur' ? g.session.sub : null;
  const store = getStore();

  const { discount, shopOpen } = await store.read((db) => ({
    discount: playerId ? bonusesFor(db as never, playerId).shopDiscount : 0,
    shopOpen: db.config.shopOpen,
  }));

  return ok({
    shopOpen,
    discount,
    boosters: BOOSTERS.map((b) => ({
      ...b,
      finalPrice: discountedPrice(b.price, discount),
    })),
  });
}

/**
 * Achat et ouverture d'un booster.
 *
 * Le tirage a lieu dans la même transaction que le débit : impossible de payer
 * sans recevoir, ni de recevoir sans payer. La clé d'idempotence protège du
 * double clic et des reprises réseau.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'shop-buy',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: purchaseSchema,
  });
  if (!g.ok) return g.response;
  if (g.session!.role !== 'joueur') {
    return fail('NON_AUTORISE', 'Seul un joueur peut ouvrir un booster.');
  }

  try {
    const result = await getStore().transaction((db) =>
      purchaseAndOpen(db, g.session!.sub, g.body.boosterId, g.body.idempotencyKey),
    );
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
