import { NextResponse } from 'next/server';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { exchangeCode, isTwitchEnabled, verifyState } from '@/lib/auth/twitch';
import { fail } from '@/lib/api/respond';
import { newId, getStore } from '@/lib/db/store';
import { ECONOMY } from '@/lib/domain/rules';
import { credit } from '@/lib/services/ledger';
import { makeSlug } from '@/lib/services/league';

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

  const player = await getStore().transaction((db) => {
    const existing = db.players.find((p) => p.twitchId === profile.id);
    if (existing) {
      // On rafraîchit l'affichage sans toucher au slug déjà partagé en lien.
      existing.pseudo = profile.displayName;
      existing.twitchLogin = profile.login;
      existing.avatarUrl = profile.avatarUrl;
      existing.active = true;
      return existing;
    }

    const created = {
      id: newId(),
      slug: makeSlug(db, profile.displayName),
      pseudo: profile.displayName,
      twitchId: profile.id,
      twitchLogin: profile.login,
      avatarUrl: profile.avatarUrl,
      snowflakes: 0,
      joinedAt: new Date().toISOString(),
      active: true,
    };
    db.players.push(created);
    credit(db, created.id, ECONOMY.welcomeGrant, 'INSCRIPTION', null);
    return created;
  });

  await setSessionCookie(createToken(player.id, 'joueur'));

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? url.origin).replace(/\/$/, '');
  return NextResponse.redirect(`${base}${returnTo}`);
}
