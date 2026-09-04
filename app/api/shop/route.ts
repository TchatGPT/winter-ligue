import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { playerIdOf } from '@/lib/auth/session';
import { purchaseSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { prixSansEvenement, resolvedBoosters } from '@/lib/services/boosters';
import { purchaseAndOpen } from '@/lib/services/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Catalogue des boosters, avec le prix réellement applicable au joueur connecté. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'shop-read' });
  if (!g.ok) return g.response;

  const store = getStore();

  // Le prix affiché est le prix payé : il n'y a plus de remise de collection.
  // Le champ reste nommé `finalPrice` pour que le client n'ait pas à savoir
  // qu'il n'existe plus de prix « avant remise ».
  const { shopOpen, boosters } = await store.read((db) => ({
    shopOpen: db.config.shopOpen,
    // Le prix du jour, et le prix hors évènement à côté : c'est ce qui permet
    // à l'écran de barrer l'ancien pendant une braderie.
    boosters: resolvedBoosters(db as never).map((b) => ({
      ...b,
      basePrice: prixSansEvenement(db as never, b.id) ?? b.price,
    })),
  }));

  return ok({
    shopOpen,
    boosters: boosters.map((b) => ({ ...b, finalPrice: b.price })),
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
  // L'identité, pas le rôle : un administrateur qui joue reste un joueur.
  // Seule la session de secours, qui n'a aucun compte derrière, est écartée.
  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut ouvrir un booster.');
  }

  try {
    const result = await getStore().transaction((db) =>
      purchaseAndOpen(db, joueurId, g.body.boosterId, g.body.idempotencyKey),
    );
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
