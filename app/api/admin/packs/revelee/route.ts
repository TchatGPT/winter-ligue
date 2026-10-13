import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { revelationSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { regleCartesSansAttendre } from '@/lib/services/effects';
import { joueursEnLice } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La carte est révélée : ce qu'elle verse peut se voir.
 *
 * L'écran de qui ouvre l'appelle au moment où la carte apparaît, sans attendre
 * l'annonce dans le tchat — qui, elle, laisse d'abord sa chance à l'overlay.
 * Avec une ouverture, ses bénéficiaires sont réglés : la carte est à l'écran.
 * Sans, tout ce qui attend sa révélation depuis trop longtemps l'est — un
 * onglet fermé en pleine ouverture ne garde pas les flocons de quelqu'un.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-packs-revelee',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: revelationSchema,
  });
  if (!g.ok) return g.response;
  try {
    const reglees = await getStore().transaction((db) => {
      if (g.body.ouvertureId) {
        const o = db.ouvertures.find((x) => x.id === g.body.ouvertureId);
        if (!o) return 0;
        return o.beneficiaires.flatMap((id) => regleCartesSansAttendre(db, id, new Date(), true)).length;
      }
      return joueursEnLice(db).flatMap((p) => regleCartesSansAttendre(db, p.id)).length;
    });
    return ok({ reglees });
  } catch (error) {
    return toResponse(error);
  }
}
