import { NextResponse } from 'next/server';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { exchangeCode, isTwitchEnabled, verifyState } from '@/lib/auth/twitch';
import { fail } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

export const runtime = 'nodejs';

/**
 * Retour du flux OAuth Twitch.
 *
 * Le compte est rattaché par `twitchId`, pas par le pseudo : un joueur qui
 * renomme sa chaîne garde son classement, et personne ne récupère le compte
 * d'un autre en prenant son ancien pseudo.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isTwitchEnabled()) {
    return fail('INTROUVABLE', 'La connexion Twitch n’est pas encore activée.');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const { valid, returnTo } = verifyState(url.searchParams.get('state'));

  if (!valid) return fail('ORIGINE_REFUSEE', 'État OAuth invalide.');
  if (!code) return fail('REQUETE_INVALIDE', 'Code d’autorisation manquant.');

  const profile = await exchangeCode(code);
  if (!profile) return fail('NON_AUTHENTIFIE', 'Authentification Twitch refusée.');

  const player = await getStore().transaction((db) => rattacheCompteTwitch(db, profile));

  await setSessionCookie(createToken(player.id, player.role));

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? url.origin).replace(/\/$/, '');
  // Première connexion, ou pseudo Activision jamais renseigné : on passe par
  // la bienvenue avant tout le reste. Sans ce pseudo, ses games ne peuvent
  // pas être reconnues sur les captures.
  const destination = player.activisionId ? returnTo : '/bienvenue';
  return NextResponse.redirect(`${base}${destination}`);
}
