import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import {
  chaineDeLaLigue,
  exchangeCode,
  isTwitchEnabled,
  PORTEE_SUBS,
  PORTEES_TCHAT,
  reprendsNonce,
  verifyState,
} from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { audit } from '@/lib/services/ledger';
import { brancheSubs } from '@/lib/services/twitchSubs';

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
 *
 * Le branchement des subs passe par ici : la streameuse se connecte en
 * autorisant la lecture de ses subs, et le site crée ses abonnements EventSub.
 * Quelqu'un d'autre qui tenterait le même chemin est connecté, sans plus.
 */
/** Assez de registre pour une saison de subs. */
const REGISTRE_SUBS = 5000;

export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'twitch-retour', limit: LIMITS.mutation });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || url.origin).replace(/\/$/, '');
  const refus = (motif: 'twitch' | 'expire' | 'desactive') => NextResponse.redirect(`${base}/connexion?erreur=${motif}`);

  const nonce = await reprendsNonce();
  if (!isTwitchEnabled()) return refus('twitch');

  const { valid, returnTo, subs } = verifyState(url.searchParams.get('state'), nonce);
  if (!valid) return refus('expire');

  const code = url.searchParams.get('code');
  if (!code || code.length > 512) return refus('twitch');

  const profile = await exchangeCode(code, url.origin);
  if (!profile) return refus('twitch');

  // Le registre des subs : un compte qui naît reçoit les Boosters Perso de ce
  // qu'il a payé avant de s'inscrire.
  const registre = await getStore().subsTwitch(REGISTRE_SUBS);
  const player = await getStore().transaction((db) => rattacheCompteTwitch(db, profile, registre));
  if (!player.active) return refus('desactive');

  await setSessionCookie(createToken(player.id, player.role));

  if (subs) {
    const cible = new URL(returnTo, base);
    const estLaChaine = profile.login.toLowerCase() === chaineDeLaLigue();
    if (!estLaChaine || !profile.portees.includes(PORTEE_SUBS)) {
      cible.searchParams.set('subs', 'refuse');
    } else {
      const branchement = await brancheSubs(profile.id, url.origin).catch(() => ({ ok: false, details: [] }));
      const tchat = PORTEES_TCHAT.every((p) => profile.portees.includes(p));
      await getStore().transaction((db) => {
        audit(
          db,
          player.id,
          branchement.ok ? 'SUBS_TWITCH_BRANCHES' : 'SUBS_TWITCH_REFUSES',
          null,
          branchement.ok
            ? `Twitch branché : subs, resubs et subs offerts, sans les Prime${
                tchat ? ', et annonces des codes cadeaux dans le tchat' : ' (sans le tchat)'
              }.`
            : `Twitch a refusé le branchement (${
                branchement.details.map((d) => `${d.type} : ${d.statut}`).join(', ') || 'jeton de l’application'
              }).`,
        );
      });
      cible.searchParams.set('subs', branchement.ok ? 'branche' : 'erreur');
    }
    return NextResponse.redirect(cible);
  }

  // Première connexion : la fenêtre d'inscription (pseudo Warzone) s'ouvre
  // par-dessus la page où l'on arrive, avant tout le reste.
  return NextResponse.redirect(`${base}${returnTo}`);
}
