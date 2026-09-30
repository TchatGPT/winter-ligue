import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { exchangeCode, isTwitchEnabled, reprendsNonce, verifyState } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * L'adresse de retour de la connexion Twitch — celle à déclarer dans la
 * console développeur Twitch : `https://www.winter-ligue.com/api/auth/twitch/callback`.
 *
 * Trois vérifications avant d'ouvrir une session : le `state` porte notre
 * signature, il a moins de dix minutes, et il répond au nonce que ce
 * navigateur a reçu au départ. Puis Twitch doit accepter le code.
 *
 * Le compte est rattaché par `twitchId`, pas par le pseudo : un joueur qui
 * renomme sa chaîne garde son classement, et personne ne récupère le compte
 * d'un autre en prenant son ancien pseudo. Un compte désactivé par la
 * modération le reste : se reconnecter ne le rouvre pas.
 *
 * Chaque refus ramène à la page de connexion, qui dit pourquoi — jamais une
 * page d'erreur brute, et jamais un texte venu de la requête.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-retour', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || url.origin).replace(/\/$/, '');
  const refus = (motif: 'twitch' | 'expire' | 'desactive') => NextResponse.redirect(`${base}/connexion?erreur=${motif}`);

  const nonce = await reprendsNonce();
  if (!isTwitchEnabled()) return refus('twitch');

  const { valid, returnTo } = verifyState(url.searchParams.get('state'), nonce);
  if (!valid) return refus('expire');

  const code = url.searchParams.get('code');
  if (!code || code.length > 512) return refus('twitch');

  const profile = await exchangeCode(code, url.origin);
  if (!profile) return refus('twitch');

  const player = await getStore().transaction((db) => rattacheCompteTwitch(db, profile));
  if (!player.active) return refus('desactive');

  await setSessionCookie(createToken(player.id, player.role));

  // Première connexion, ou pseudo Activision jamais renseigné : on passe par
  // la bienvenue avant tout le reste. Sans ce pseudo, ses games ne peuvent
  // pas être reconnues sur les captures.
  const destination = player.activisionId ? returnTo : '/bienvenue';
  return NextResponse.redirect(`${base}${destination}`);
}
