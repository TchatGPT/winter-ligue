import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForms } from '@/components/LoginForms';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { Notice } from '@/components/ui';
import { getStore, sansBaseDurable } from '@/lib/db/store';
import { EnTetePage } from '@/components/EnTetePage';

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
  // Déjà connecté avec un compte valide : rien à faire ici. Une session dont
  // le compte a disparu reste sur cette page, pour se reconnecter — comme une
  // session de secours, sans joueur, dès que le site a une base.
  const session = await getSession();
  let sansCompte = false;
  if (session) {
    const playerId = playerIdOf(session);
    const valide =
      playerId === null
        ? sansBaseDurable()
        : await getStore().read((db) => db.players.some((p) => p.id === playerId));
    if (valide) redirect('/');
    sansCompte = playerId === null;
  }

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
      <EnTetePage
        icone="user"
        eyebrow="Accès"
        titre="Se connecter"
        droite={
          <Link href="/" className="btn btn-sm no-underline">
            ← Retour à l’accueil
          </Link>
        }
      />

      {sansCompte && (
        <Notice>
          Ta session n’est rattachée à aucun joueur : reconnecte-toi pour miser, jouer tes duels et ouvrir
          tes boosters.
        </Notice>
      )}

      <LoginForms twitchEnabled={isTwitchEnabled()} devPlayers={devPlayers} />
    </div>
  );
}
