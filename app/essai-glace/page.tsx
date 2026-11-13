import { EssaiGlace } from '@/components/EssaiGlace';
import { isTwitchEnabled } from '@/lib/auth/twitch';

/**
 * La page d'essai du booster pris dans la glace (13/11/2026) : un prototype à
 * valider avant de remplacer la vitrine de l'accueil. Rien n'y mène depuis le
 * site, et les moteurs de recherche ne l'indexent pas. À retirer une fois la
 * glace intégrée à l'accueil.
 */
export const metadata = {
  title: 'Essai · la glace',
  robots: { index: false, follow: false },
};

export default function EssaiGlacePage() {
  return <EssaiGlace entree={isTwitchEnabled() ? '/api/auth/twitch?returnTo=/' : '/connexion'} />;
}
