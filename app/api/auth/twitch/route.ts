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
 *
 * Avec `subs=1`, c'est le branchement des subs : la connexion demande en plus
 * de lire les subs de la chaîne. Le retour vérifie que c'est bien la
 * streameuse qui l'a accepté.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-depart', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  if (!isTwitchEnabled()) return NextResponse.redirect(`${url.origin}/connexion`);

  const subs = url.searchParams.get('subs') === '1';
  const { state, nonce } = createState(cheminInterne(url.searchParams.get('returnTo')), subs);
  await poseNonce(nonce);
  return NextResponse.redirect(authorizeUrl(state, url.origin, subs));
}
