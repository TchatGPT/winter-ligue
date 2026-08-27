import { NextResponse } from 'next/server';
import { authorizeUrl, createState, isTwitchEnabled } from '@/lib/auth/twitch';
import { fail } from '@/lib/api/respond';

export const runtime = 'nodejs';

/** Démarre le flux OAuth Twitch. Inactif tant que les identifiants ne sont pas fournis. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isTwitchEnabled()) {
    return fail('INTROUVABLE', 'La connexion Twitch n’est pas encore activée.');
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get('returnTo') ?? '/';
  // Seul un chemin interne est accepté : pas de redirection ouverte via ?returnTo=.
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';

  return NextResponse.redirect(authorizeUrl(createState(returnTo)));
}
