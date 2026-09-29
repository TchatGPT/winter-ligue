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
    const renseigne = await getStore().read(
      (db) => db.players.find((p) => p.id === playerId)?.activisionId ?? null,
    );
    if (!renseigne) redirect('/bienvenue');
  }
  return session;
}
