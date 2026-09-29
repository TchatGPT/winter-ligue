import { redirect } from 'next/navigation';
import { Bienvenue } from '@/components/Bienvenue';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bienvenue' };

/**
 * La première connexion : le pseudo Activision.
 *
 * On y arrive depuis le retour Twitch, ou depuis n'importe quelle page tant
 * qu'il manque. La session de modération n'a pas de profil : elle file à
 * l'administration.
 */
export default async function BienvenuePage() {
  const session = await getSession();
  if (!session) redirect('/');
  const playerId = playerIdOf(session);
  if (!playerId) redirect('/admin');

  const joueur = await getStore().read((db) => {
    const p = db.players.find((x) => x.id === playerId);
    return p ? { pseudo: p.pseudo, activisionId: p.activisionId } : null;
  });
  if (!joueur) redirect('/');

  return <Bienvenue pseudo={joueur.pseudo} activisionId={joueur.activisionId} />;
}
