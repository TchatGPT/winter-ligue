import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard } from '@/lib/api/respond';
import { createToken, setSessionCookie, SUJET_SECOURS } from '@/lib/auth/session';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import type { Player } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * La connexion Twitch simulée : un clic, et l'on entre en administratrice.
 *
 * Temporaire, en attendant le vrai flux OAuth. On se connecte sur le compte
 * de la streameuse — celui dont le pseudo est `TWITCH_BROADCASTER_LOGIN`,
 * sinon le premier administrateur actif — ou, si la base n'en a aucun, sur un
 * compte « Streameuse » créé pour l'occasion.
 *
 * Elle se ferme d'elle-même : dès que les identifiants Twitch sont définis,
 * on file vers le vrai Twitch.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? url.origin).replace(/\/$/, '');
  if (isTwitchEnabled()) return NextResponse.redirect(`${base}/api/auth/twitch?returnTo=/`);

  const g = await guard(request, { scope: 'twitch-demo', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  /*
   * Sur Vercel sans base, chaque serveur a sa propre copie éphémère des
   * données : un compte créé sur l'un n'existe pas sur l'autre, et la page
   * suivante renverrait à la connexion, en boucle. On ouvre alors une session
   * d'administration sans compte joueur derrière, qui ne dépend d'aucune
   * donnée stockée.
   */
  const sansBase = Boolean(process.env.VERCEL) && !process.env.DATABASE_URL?.trim();
  if (sansBase) {
    try {
      await setSessionCookie(createToken(SUJET_SECOURS, 'admin'));
    } catch {
      return fail('ERREUR_SERVEUR', 'Connexion impossible : AUTH_SECRET manque côté serveur (32 caractères minimum).');
    }
    return NextResponse.redirect(`${base}/`);
  }

  try {
    const chaine = process.env.TWITCH_BROADCASTER_LOGIN?.trim().toLowerCase() || null;
    const admin = await getStore().transaction((db): Player => {
      const actifs = db.players.filter((p) => p.active && p.role === 'admin');
      const trouve =
        (chaine && actifs.find((p) => p.twitchLogin === chaine || p.slug === chaine)) || actifs[0];
      if (trouve) return trouve;

      const cree = rattacheCompteTwitch(db, {
        id: 'demo:streameuse',
        login: 'streameuse',
        displayName: 'Streameuse',
        avatarUrl: null,
        roleChaine: 'admin',
      });
      // Pour entrer sans détour : la bienvenue ne demandera rien à ce compte.
      cree.activisionId ??= cree.pseudo;
      return cree;
    });

    let jeton: string;
    try {
      jeton = createToken(admin.id, 'admin');
    } catch {
      return fail('ERREUR_SERVEUR', 'Connexion impossible : AUTH_SECRET manque côté serveur (32 caractères minimum).');
    }
    await setSessionCookie(jeton);
    return NextResponse.redirect(`${base}/`);
  } catch (error) {
    return toResponse(error);
  }
}
