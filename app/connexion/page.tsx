import Link from 'next/link';
import { connexionDeDeveloppement } from '@/lib/auth/dev';
import { redirect } from 'next/navigation';
import { LoginForms } from '@/components/LoginForms';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { motDePasseConfigure } from '@/lib/auth/secours';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { Notice } from '@/components/ui';
import { getStore, sansBaseDurable } from '@/lib/db/store';
import { EnTetePage } from '@/components/EnTetePage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion' };

/**
 * Ce que la connexion Twitch peut renvoyer ici. Le texte vient de cette table,
 * jamais de l'adresse : un lien piégé ne fait pas écrire ce qu'il veut à la page.
 */
const ERREURS: Record<string, string> = {
  twitch: 'Twitch n’a pas confirmé la connexion. Réessaie dans un instant.',
  expire: 'La connexion a expiré ou n’a pas été commencée ici. Recommence depuis le bouton.',
  desactive: 'Ce compte a été désactivé par la modération.',
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Déjà connecté : rien à faire ici — `getSession()` n'a rendu la session
  // qu'après avoir vérifié le compte en base. Une session de secours, sans
  // joueur, reste sur cette page dès que le site a une base : elle administre,
  // elle ne joue pas.
  const session = await getSession();
  let sansCompte = false;
  if (session) {
    if (playerIdOf(session) !== null || sansBaseDurable()) redirect('/');
    sansCompte = true;
  }

  const brut = (await searchParams).erreur;
  const erreur = typeof brut === 'string' ? (ERREURS[brut] ?? null) : null;

  // La liste des joueurs pour la connexion de développement n'est envoyée au
  // client que si cette connexion est réellement ouverte — sinon, elle reste
  // `null` et ne fuite aucun identifiant.
  const devPlayers = connexionDeDeveloppement()
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

      {erreur && <Notice kind="error">{erreur}</Notice>}

      {sansCompte && (
        <Notice>
          Tu es dans la session de secours : elle administre la ligue, sans compte joueur derrière elle.{' '}
          <Link href="/admin">Aller à l’administration</Link>
        </Notice>
      )}

      <LoginForms twitchEnabled={isTwitchEnabled()} motDePasse={motDePasseConfigure()} devPlayers={devPlayers} />
    </div>
  );
}
