import Link from 'next/link';
import { LoginForms } from '@/components/LoginForms';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { TitreGlace } from '@/components/TitreGlace';

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
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <TitreGlace taille="page" eyebrow="Accès">
          Se connecter
        </TitreGlace>
        <Link href="/" className="btn btn-sm no-underline">
          ← Retour à l’accueil
        </Link>
      </header>

      <LoginForms twitchEnabled={isTwitchEnabled()} devPlayers={devPlayers} />
    </div>
  );
}
