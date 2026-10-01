import 'server-only';

/**
 * Sessions signées, sans dépendance externe.
 *
 * Le jeton est un `payload.signature` en base64url, signé en HMAC-SHA256 avec
 * `AUTH_SECRET`. Il est stocké dans un cookie HttpOnly + SameSite=Lax + Secure :
 * inaccessible au JavaScript de la page, donc insensible au vol par XSS, et non
 * renvoyé sur les requêtes intersites d'écriture.
 *
 * Le jeton ne contient qu'un identifiant et un rôle, et le rôle du jeton ne
 * sert à rien : à chaque requête, `getSession()` relit en base le rôle, l'état
 * et la date de révocation du joueur. Un admin rétrogradé perd ses droits
 * à la requête suivante, un compte désactivé est dehors, et « Se déconnecter »
 * révoque tous les jetons déjà émis — pas seulement le cookie de ce navigateur.
 */

import { cookies } from 'next/headers';
import { cache } from 'react';
import { getStore } from '@/lib/db/store';
import { roleConfirme } from '@/lib/domain/revocation';
import { COOKIE_OPTIONS, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyToken, type Role, type SessionPayload } from './jeton';

// La fabrication des jetons vit dans `jeton.ts`, sans accès à la base : le
// proxy s'en sert pour prolonger les sessions.
export { cleDerivee, createToken, SESSION_COOKIE, verifyToken } from './jeton';
export type { Role, SessionPayload } from './jeton';

/**
 * Session courante : le cookie de la requête, vérifié, puis confronté à la base.
 *
 * Mise en cache le temps d'une requête (`cache` de React) : la mise en page,
 * la barre latérale et la page la demandent chacune, la base n'est lue qu'une
 * fois.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const jar = await cookies();
  const jeton = verifyToken(jar.get(SESSION_COOKIE)?.value);
  return jeton ? confirme(jeton) : null;
});

/**
 * Ce que dit la base d'un jeton dont la signature est bonne.
 *
 * Toute session doit désigner un joueur actif, émise après sa dernière
 * déconnexion ; son rôle est celui de la base, jamais celui du jeton. Il n'y a
 * plus de session sans joueur : celle « de secours », qu'ouvrait un mot de
 * passe, a disparu avec lui — un ancien jeton de ce genre ne désigne aucun
 * compte, et il est refusé ici.
 */
async function confirme(jeton: SessionPayload): Promise<SessionPayload | null> {
  const role = roleConfirme(jeton, await getStore().etatSession(jeton.sub));
  return role ? { ...jeton, role } : null;
}

/** Hiérarchie des rôles : un admin peut tout ce que peut un joueur, et davantage. */
const RANG: Record<Role, number> = { joueur: 0, admin: 1 };

/**
 * Ce rôle suffit-il ? Les rôles sont hiérarchiques, et une seule ligne le dit :
 * ce qui demande `joueur` accepte un admin.
 */
export function aLeRang(role: Role, minimum: Role): boolean {
  return RANG[role] >= RANG[minimum];
}

/**
 * L'identifiant du joueur derrière une session, ou null.
 *
 * À utiliser partout où l'on veut savoir « qui joue », par opposition à « qui a
 * le droit de faire quoi ». Les deux questions ont été confondues tant qu'il n'y
 * avait que deux rôles : tester `role === 'joueur'` répondait aux deux à la
 * fois. Depuis qu'un joueur peut être admin, ce test
 * exclut du jeu ceux à qui on vient de donner des droits — ils se voyaient
 * refuser l'ouverture d'un booster avec un « connexion requise » alors qu'ils
 * étaient connectés.
 */
export function playerIdOf(session: SessionPayload | null): string | null {
  return session?.sub ?? null;
}

export async function isAdmin(): Promise<boolean> {
  return (await getSession())?.role === 'admin';
}

export async function setSessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, maxAge });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
}
