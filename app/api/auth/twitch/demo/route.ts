import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * L'ancienne entrée de la connexion simulée, qui faisait entrer n'importe qui
 * en administrateur. Elle est fermée ; l'adresse reste pour les liens déjà
 * posés, et renvoie à la page de connexion.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-demo', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  return NextResponse.redirect(`${url.origin}/connexion`);
}
