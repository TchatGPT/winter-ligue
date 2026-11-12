import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { donneesFictivesSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { estTesteur } from '@/lib/services/cartesDeTest';
import { ajouteDonneesFictives, retireDonneesFictives } from '@/lib/services/donneesFictives';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Les données fictives de la page de test (12/11/2026) : 24 joueurs inventés,
 * leurs games et leurs cartes, et des boosters de la ligue à ouvrir — ou leur
 * retrait.
 *
 * Le garde demande la modération ; la transaction demande en plus que le
 * compte soit celui d'un testeur (`TESTEURS_CARTES`, lu en base). Le
 * navigateur n'envoie que l'action : ce qui est ajouté se décide sur le
 * serveur, et le journal en garde la trace.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-donnees-fictives',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: donneesFictivesSchema,
  });
  if (!g.ok) return g.response;
  const moi = playerIdOf(g.session);
  if (!moi) return fail('NON_AUTORISE', 'Cette page est réservée aux testeurs de la ligue.');
  const acteur = g.session?.sub ?? 'admin';

  try {
    const resultat = await getStore().transaction((db) => {
      if (!estTesteur(db, moi)) return null;
      return g.body.action === 'ajoute' ? ajouteDonneesFictives(db, acteur) : retireDonneesFictives(db, acteur);
    });
    if (!resultat) return fail('NON_AUTORISE', 'Cette page est réservée aux testeurs de la ligue.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
