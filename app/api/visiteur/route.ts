import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { fermeModeVisiteur, ouvreModeVisiteur } from '@/lib/auth/visiteur';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Entrer en mode visiteur : le bouton de l'accueil mène ici, qui pose le cookie
 * (`lib/auth/visiteur.ts`) et renvoie au classement. Rien d'autre ne change :
 * pas de session, pas de joueur, aucune route qui écrit ne s'ouvre.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'visiteur' });
  if (!g.ok) return g.response;
  await ouvreModeVisiteur();
  return NextResponse.redirect(new URL('/', request.url), 303);
}

/** Quitter le mode visiteur : retour à l'accueil. */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'visiteur', limit: LIMITS.mutation });
  if (!g.ok) return g.response;
  await fermeModeVisiteur();
  return ok({ visiteur: false });
}
