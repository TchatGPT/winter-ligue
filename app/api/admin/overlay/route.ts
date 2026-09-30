import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Régénère les liens d'overlay : la génération avance, et tous les liens
 * donnés jusque-là cessent de marcher. Réservé aux administrateurs — c'est la
 * parade quand un lien a été montré à l'écran.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'admin-overlay', role: 'admin', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const generation = await getStore().transaction((db) => {
    db.config.overlayGeneration = (db.config.overlayGeneration ?? 1) + 1;
    audit(db, g.session?.sub ?? 'admin', 'OVERLAY_REGENERE', null, `Liens d’overlay régénérés (génération ${db.config.overlayGeneration})`);
    return db.config.overlayGeneration;
  });
  return ok({ generation });
}
