import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard } from '@/lib/api/respond';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { compteSimule } from '@/lib/auth/simulation';
import { CODE_SIMULATION, exchangeCode, isTwitchEnabled, verifyState } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * L'adresse de retour de la connexion Twitch — celle à déclarer dans la
 * console développeur Twitch : `https://www.winter-ligue.com/api/auth/twitch/callback`.
 *
 * Le compte est rattaché par `twitchId`, pas par le pseudo : un joueur qui
 * renomme sa chaîne garde son classement, et personne ne récupère le compte
 * d'un autre en prenant son ancien pseudo.
 *
 * Tant que Twitch n'est pas branché, elle accepte le code de simulation que
 * lui envoie `/api/auth/twitch`, et seulement lui. Une fois les identifiants
 * posés, ce code part chez Twitch comme n'importe quel autre, et Twitch le
 * refuse : la simulation se ferme d'elle-même.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-retour', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const { valid, returnTo } = verifyState(url.searchParams.get('state'));

  if (!valid) return fail('ORIGINE_REFUSEE', 'État OAuth invalide.');
  if (!code) return fail('REQUETE_INVALIDE', 'Code d’autorisation manquant.');

  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || url.origin).replace(/\/$/, '');

  if (!isTwitchEnabled()) {
    if (code !== CODE_SIMULATION) return fail('NON_AUTHENTIFIE', 'Authentification Twitch refusée.');
    try {
      const compte = await compteSimule();
      await setSessionCookie(createToken(compte.sujet, compte.role));
      return NextResponse.redirect(`${base}${compte.bienvenue ? '/bienvenue' : returnTo}`);
    } catch (error) {
      return toResponse(error);
    }
  }

  const profile = await exchangeCode(code, url.origin);
  if (!profile) return fail('NON_AUTHENTIFIE', 'Authentification Twitch refusée.');

  const player = await getStore().transaction((db) => rattacheCompteTwitch(db, profile));

  await setSessionCookie(createToken(player.id, player.role));

  // Première connexion, ou pseudo Activision jamais renseigné : on passe par
  // la bienvenue avant tout le reste. Sans ce pseudo, ses games ne peuvent
  // pas être reconnues sur les captures.
  const destination = player.activisionId ? returnTo : '/bienvenue';
  return NextResponse.redirect(`${base}${destination}`);
}
