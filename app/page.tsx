import { Classement } from '@/components/Classement';
import { SubsBanner } from '@/components/SubsBanner';
import { Hero } from '@/components/Hero';
import { Accueil } from '@/components/Accueil';
import { SaisieGames } from '@/components/SaisieGames';
import { exigeSession } from '@/lib/auth/acces';
import { getSession } from '@/lib/auth/session';
import { chaineDeLaLigue, isTwitchEnabled } from '@/lib/auth/twitch';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { getStore } from '@/lib/db/store';
import { evenementsActifs } from '@/lib/services/evenements';
import { getOverview, getRanking } from '@/lib/services/league';
import { isReconnaissanceEnabled } from '@/lib/services/reconnaissance';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Classement général' };

function devLoginAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true';
}

export default async function ClassementPage() {
  // Déconnecté, on ne voit rien de la ligue : seulement ce qu'elle est, et
  // comment y entrer.
  if ((await getSession()) === null) {
    return <Accueil twitchEnabled={isTwitchEnabled()} devLogin={devLoginAllowed()} />;
  }
  const session = await exigeSession();
  // La saisie par capture vit ici, au-dessus du classement : c'est là que la
  // modération regarde le résultat. La route revérifie le rôle.
  const moderateur = session.role === 'admin' || session.role === 'moderateur';

  const [ranking, overview, subs] = await Promise.all([
    getRanking(),
    getOverview(),
    getStore().read((db) => ({
      totalSubs: db.config.totalSubs,
      evenements: evenementsActifs(db),
      joueurs: moderateur
        ? db.players
            .filter((p) => p.active && !estLaStreameuse(p, chaineDeLaLigue()))
            .map((p) => ({ id: p.id, pseudo: p.pseudo }))
            .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'))
        : [],
    })),
  ]);

  return (
    <div className="space-y-6">
      {/* Sur grand écran, le hero et les subs se partagent la largeur ; en
          dessous, ils s'empilent. Chacun se réorganise selon sa propre
          largeur, pas celle de la fenêtre. */}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr] xl:items-stretch">
        <Hero
          leader={
            ranking[0]
              ? { pseudo: ranking[0].pseudo, slug: ranking[0].slug, score: ranking[0].totals.totalScore }
              : null
          }
          joueurs={overview.playerCount}
          games={overview.gameCount}
          kills={overview.totalKills}
        />

        <SubsBanner totalSubs={subs.totalSubs} evenements={subs.evenements} />
      </div>

      {/* Toujours le classement, même vide : sa place reste la même, et le
          bouton de saisie avec. */}
        <Classement
          rows={ranking}
          outils={
            moderateur ? (
              // La clé : cet élément traverse la frontière serveur → client et se
              // retrouve dans la liste d'enfants de l'entête du classement.
              <SaisieGames key="saisie" joueurs={subs.joueurs} reconnaissance={isReconnaissanceEnabled()} />
            ) : undefined
          }
        />
    </div>
  );
}
