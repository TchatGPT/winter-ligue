import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La santé du serveur qui répond : son âge, ce que lui a coûté son démarrage
 * (connexion à la base, schéma), un aller-retour avec la base, et ce que lui
 * coûtent les chargements et les écritures depuis (`Store.sonde`).
 *
 * Elle ne lit aucune donnée — un `select 1` — et ne dit rien de la ligue :
 * des durées et un nombre de lignes. Publique, pour qu'on puisse mesurer un
 * démarrage à froid sans session ; bornée à trente appels par minute.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'sante', limit: LIMITS.sante });
  if (!g.ok) return g.response;
  try {
    const debut = performance.now();
    const sonde = await getStore().sonde();
    return ok({ ...sonde, region: process.env.VERCEL_REGION ?? null, totalMs: Math.round(performance.now() - debut) });
  } catch (error) {
    return toResponse(error);
  }
}
