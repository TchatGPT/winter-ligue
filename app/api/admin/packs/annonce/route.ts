import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { annonceOuvertureSchema } from '@/lib/api/schemas';
import { LIMITS } from '@/lib/security/ratelimit';
import { annonceOuverture } from '@/lib/services/annonceBooster';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le secours de l'annonce d'une ouverture : l'écran de qui a ouvert le
 * booster la demande quelques secondes après la révélation. Si l'overlay OBS
 * l'a déjà faite, il ne se passe rien — une ouverture ne s'annonce qu'une fois.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-packs-annonce',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: annonceOuvertureSchema,
  });
  if (!g.ok) return g.response;
  try {
    return ok({ annonce: await annonceOuverture(g.body.ouvertureId, g.session?.sub ?? 'admin') });
  } catch (error) {
    return toResponse(error);
  }
}
