import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { authorizeUrl, cheminInterne, createState, isTwitchEnabled, poseNonce } from '@/lib/auth/twitch';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Démarre la connexion Twitch.
 *
 * Twitch branché, on part chez lui avec un `state` signé, et le nonce qui le
 * lie à ce navigateur reste en cookie. Twitch pas encore branché, la connexion
 * est fermée : on revient à la page de connexion, qui le dit.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-depart', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  if (!isTwitchEnabled()) return NextResponse.redirect(`${url.origin}/connexion`);

  const { state, nonce } = createState(cheminInterne(url.searchParams.get('returnTo')));
  await poseNonce(nonce);
  return NextResponse.redirect(authorizeUrl(state, url.origin));
}
