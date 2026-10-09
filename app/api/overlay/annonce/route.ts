import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { annonceOverlaySchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { annonceOuverture } from '@/lib/services/annonceBooster';
import { generationDe } from '@/lib/services/overlay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * L'overlay des boosters a révélé une carte : l'ouverture s'annonce dans le
 * tchat (`annonceOuverture`), au moment où le stream la voit.
 *
 * Pas de session : la clé du lien fait foi, comme pour lire le flux. Le
 * navigateur ne donne que l'ouverture ; le message se compose sur le serveur,
 * et une ouverture ne s'annonce qu'une fois, même si deux overlays la jouent.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'overlay-annonce',
    limit: { limit: 30, windowMs: 60_000 },
    schema: annonceOverlaySchema,
  });
  if (!g.ok) return g.response;

  const generation = generationDe(g.body.cle);
  if (generation === null) return fail('NON_AUTORISE', 'Lien d’overlay invalide.');
  try {
    // La génération des liens, par la lecture légère des overlays.
    const { generation: actuelle } = await getStore().fluxOverlay(new Date().toISOString());
    if (generation !== actuelle) return fail('NON_AUTORISE', 'Lien d’overlay révoqué.');
    return ok({ annonce: await annonceOuverture(g.body.ouvertureId, 'overlay') });
  } catch (error) {
    return toResponse(error);
  }
}
