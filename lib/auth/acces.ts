import 'server-only';

import { redirect } from 'next/navigation';
import { getSession, playerIdOf, type SessionPayload } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';

/**
 * L'accès aux pages du site.
 *
 * Déconnecté, on ne voit que l'accueil, qui présente la ligue et invite à se
 * connecter. Connecté sans pseudo Activision, on passe d'abord par la page de
 * bienvenue : sans ce pseudo, la modération ne peut pas reconnaître le
 * joueur sur les captures de fin de game, donc ses games ne seraient pas
 * saisies.
 *
 * Ce n'est qu'un aiguillage : chaque route d'API revérifie la session.
 */
export async function exigeSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect('/');

  const playerId = playerIdOf(session);
  if (playerId) {
    const joueur = await getStore().read((db) => {
      const p = db.players.find((x) => x.id === playerId);
      return p ? { activisionId: p.activisionId } : null;
    });
    // Le compte n'existe plus (base vidée) : on renvoie se reconnecter,
    // plutôt que de faire tourner l'accueil et la bienvenue l'un sur l'autre.
    if (!joueur) redirect('/connexion');
    if (!joueur.activisionId) redirect('/bienvenue');
  }
  return session;
}
