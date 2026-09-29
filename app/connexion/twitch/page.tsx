import { redirect } from 'next/navigation';
import { TwitchDemo } from '@/components/TwitchDemo';
import { isTwitchEnabled } from '@/lib/auth/twitch';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion Twitch' };

/**
 * L'écran d'autorisation Twitch, simulé.
 *
 * Quand la vraie connexion est branchée, on file directement chez Twitch :
 * cette page disparaît d'elle-même.
 */
export default function ConnexionTwitchPage() {
  if (isTwitchEnabled()) redirect('/api/auth/twitch?returnTo=/');
  return <TwitchDemo />;
}
