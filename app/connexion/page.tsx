import { LoginForms } from '@/components/LoginForms';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion' };

/**
 * La liste des joueurs pour la connexion de développement n'est envoyée au
 * client que si cette connexion est réellement ouverte — sinon, elle reste
 * `null` et ne fuite aucun identifiant.
 */
function devLoginAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true';
}

export default async function ConnexionPage() {
  const devPlayers = devLoginAllowed()
    ? await getStore().read((db) =>
        db.players
          .filter((p) => p.active)
          .slice(0, 20)
          .map((p) => ({ id: p.id, pseudo: p.pseudo })),
      )
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Accès</p>
        <h1 className="section-title">
          Se <em>Connecter</em>
        </h1>
      </header>

      <LoginForms twitchEnabled={isTwitchEnabled()} devPlayers={devPlayers} />
    </div>
  );
}
