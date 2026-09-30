import { NextResponse } from 'next/server';
import { fail, guard, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { generationDe, vueBoosters, vueDuels, vueSubs } from '@/lib/services/overlay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Un overlay ne remonte jamais plus loin qu'une journée. */
const PORTEE_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Le flux des overlays OBS — voir `lib/services/overlay.ts`.
 *
 * Pas de session : la clé du lien fait foi. Une clé mal signée est refusée
 * avant toute lecture ; une clé d'une génération révoquée, après. Le débit
 * est borné par adresse : trois overlays qui lisent toutes les deux secondes
 * y tiennent largement, une boucle de requêtes non.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'overlay', limit: { limit: 240, windowMs: 60_000 } });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const generation = generationDe(url.searchParams.get('cle'));
  if (generation === null) return fail('NON_AUTORISE', 'Lien d’overlay invalide.');

  const brut = Date.parse(url.searchParams.get('depuis') ?? '');
  const maintenant = Date.now();
  const depuis = new Date(
    Number.isFinite(brut) ? Math.min(maintenant, Math.max(brut, maintenant - PORTEE_MAX_MS)) : maintenant,
  ).toISOString();

  const flux = await getStore().fluxOverlay(depuis);
  if (flux.generation !== generation) return fail('NON_AUTORISE', 'Lien d’overlay révoqué.');

  return ok({
    maintenant: flux.maintenant,
    boosters: vueBoosters(flux),
    duels: vueDuels(flux),
    subs: vueSubs(flux),
  });
}
