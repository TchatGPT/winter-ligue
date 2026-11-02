import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { carteDeTestSchema, retireCarteDeTestSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import type { PackId } from '@/lib/domain/types';
import { LIMITS } from '@/lib/security/ratelimit';
import { donneCarteDeTest, estTesteur, retireCarteDeTest } from '@/lib/services/cartesDeTest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La page de test : un testeur de la ligue se donne une carte (POST), ou retire
 * celle qui attend sa prochaine game (DELETE).
 *
 * Le garde demande la modération ; le service, dans la transaction, demande en
 * plus que le compte soit celui d'un testeur (`TESTEURS_CARTES`, lu en base).
 * Le navigateur n'envoie que le booster, la carte et une clé : que la carte
 * sorte de ce booster, et ce qu'elle fait, se décide sur le serveur.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-test-cartes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: carteDeTestSchema,
  });
  if (!g.ok) return g.response;
  const moi = playerIdOf(g.session);
  if (!moi) return fail('NON_AUTORISE', 'Il faut un compte de joueur pour se donner une carte.');

  try {
    const resultat = await getStore().transaction((db) => {
      if (!estTesteur(db, moi)) return null;
      const demande = { packId: g.body.packId as PackId, cardId: g.body.cardId, cle: g.body.cle };
      return donneCarteDeTest(db, moi, demande, g.session?.sub ?? 'admin');
    });
    if (!resultat) return fail('NON_AUTORISE', 'Cette page est réservée aux testeurs de la ligue.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-test-cartes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: retireCarteDeTestSchema,
  });
  if (!g.ok) return g.response;
  const moi = playerIdOf(g.session);
  if (!moi) return fail('NON_AUTORISE', 'Il faut un compte de joueur pour retirer une carte.');

  try {
    const resultat = await getStore().transaction((db) => {
      if (!estTesteur(db, moi)) return null;
      return retireCarteDeTest(db, moi, g.session?.sub ?? 'admin');
    });
    if (!resultat) return fail('NON_AUTORISE', 'Cette page est réservée aux testeurs de la ligue.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
