import 'server-only';

import { redirect } from 'next/navigation';
import { aLeRang, getSession, playerIdOf, type Role, type SessionPayload } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { destination } from '@/lib/domain/aiguillage';

/**
 * L'accès aux pages du site.
 *
 * Déconnecté, on ne voit que l'accueil, qui présente la ligue et invite à se
 * connecter. Connecté sans pseudo Activision, on passe d'abord par la page de
 * bienvenue.
 *
 * La décision elle-même vit dans `lib/domain/aiguillage.ts`, où elle est
 * testée ; ici on rassemble les faits — le cookie, la base — et on suit.
 *
 * Ce n'est qu'un aiguillage : chaque route d'API revérifie la session.
 */
export async function exigeSession(): Promise<SessionPayload> {
  const session = await getSession();
  const playerId = playerIdOf(session);

  const joueur = playerId
    ? await getStore().read((db) => {
        const p = db.players.find((x) => x.id === playerId);
        return p ? { activisionId: p.activisionId } : null;
      })
    : null;

  const ou = destination({
    connecte: session !== null,
    compteTrouve: joueur !== null,
    activision: Boolean(joueur?.activisionId),
  });
  if (ou || !session) redirect(ou ?? '/');

  return session;
}

/**
 * L'accès à une page de l'administration, en tête de **chaque** page.
 *
 * La mise en page de `/admin` vérifie aussi, mais elle ne suffit pas : lors
 * d'une navigation entre deux onglets, Next ne rejoue que la page, pas la mise
 * en page — et une requête fabriquée peut demander la seule page. Le contrôle
 * est donc au plus près des données.
 */
export async function exigeRole(minimum: Extract<Role, 'moderateur' | 'admin'>): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !aLeRang(session.role, minimum)) redirect('/connexion');
  return session;
}
