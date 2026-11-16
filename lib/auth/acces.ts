import 'server-only';

import { redirect } from 'next/navigation';
import { aLeRang, getSession, playerIdOf, type Role, type SessionPayload } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { destination } from '@/lib/domain/aiguillage';
import { estVisiteur } from '@/lib/auth/visiteur';

/**
 * L'accès aux pages du site.
 *
 * Déconnecté, on ne voit que l'accueil, qui présente la ligue et invite à se
 * connecter. Connecté sans pseudo Warzone, on entre, et la fenêtre
 * d'inscription le demande par-dessus la page.
 *
 * La décision elle-même vit dans `lib/domain/aiguillage.ts`, où elle est
 * testée ; ici on rassemble les faits — le cookie, la base — et on suit.
 *
 * Ce n'est qu'un aiguillage : chaque route d'API revérifie la session.
 */
export async function exigeSession(): Promise<SessionPayload> {
  const session = await getSession();
  const playerId = playerIdOf(session);

  const compteTrouve = playerId ? await getStore().read((db) => db.players.some((x) => x.id === playerId)) : false;

  const ou = destination({ connecte: session !== null, compteTrouve });
  if (ou || !session) redirect(ou ?? '/');

  return session;
}

/**
 * L'accès à une page de lecture — le classement, les boosters, les duels, les
 * fiches, les règles : un joueur connecté, ou un visiteur (`lib/auth/visiteur.ts`,
 * 16/11/2026). Le visiteur n'a pas de session : la page s'affiche sans rien de
 * ce qui agit, et chaque route qui écrit le refuse de toute façon.
 */
export async function exigeLecteur(): Promise<{ session: SessionPayload | null }> {
  if (await getSession()) return { session: await exigeSession() };
  if (await estVisiteur()) return { session: null };
  redirect('/');
}

/**
 * L'accès à une page de l'administration, en tête de **chaque** page.
 *
 * La mise en page de `/admin` vérifie aussi, mais elle ne suffit pas : lors
 * d'une navigation entre deux onglets, Next ne rejoue que la page, pas la mise
 * en page — et une requête fabriquée peut demander la seule page. Le contrôle
 * est donc au plus près des données.
 */
export async function exigeRole(minimum: Extract<Role, 'admin'>): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !aLeRang(session.role, minimum)) redirect('/connexion');
  return session;
}
