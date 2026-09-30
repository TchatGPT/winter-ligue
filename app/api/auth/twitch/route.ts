import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { authorizeUrl, CODE_SIMULATION, createState, isTwitchEnabled, redirectUri } from '@/lib/auth/twitch';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Démarre la connexion Twitch.
 *
 * Twitch branché, on part chez Twitch. Sinon, on joue son rôle : on revient
 * aussitôt sur l'adresse de retour, avec un code de simulation et le même
 * `state` signé. Le circuit est donc déjà celui du vrai branchement, et
 * l'adresse de retour sert dès aujourd'hui — voir `lib/auth/simulation.ts`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-depart', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const raw = url.searchParams.get('returnTo') ?? '/';
  // Seul un chemin interne est accepté : pas de redirection ouverte via ?returnTo=.
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
  const state = createState(returnTo);

  if (isTwitchEnabled()) return NextResponse.redirect(authorizeUrl(state, url.origin));

  const retour = new URL(redirectUri(url.origin));
  retour.searchParams.set('code', CODE_SIMULATION);
  retour.searchParams.set('state', state);
  return NextResponse.redirect(retour.toString());
}
