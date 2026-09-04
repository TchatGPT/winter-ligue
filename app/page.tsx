import { Classement } from '@/components/Classement';
import { SubsBanner } from '@/components/SubsBanner';
import { Hero } from '@/components/Hero';
import { EmptyState } from '@/components/ui';
import { getStore } from '@/lib/db/store';
import { evenementsActifs } from '@/lib/services/evenements';
import { getOverview, getRanking } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Classement général' };

export default async function ClassementPage() {
  const [ranking, overview, subs] = await Promise.all([
    getRanking(),
    getOverview(),
    getStore().read((db) => ({
      totalSubs: db.config.totalSubs,
      evenements: evenementsActifs(db),
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

      {ranking.length === 0 ? (
        <EmptyState
          title="Aucun joueur inscrit"
          hint="La modération ajoute les participants depuis l’onglet Modération. La connexion Twitch les inscrira automatiquement une fois activée."
        />
      ) : (
        <Classement rows={ranking} />
      )}
    </div>
  );
}
