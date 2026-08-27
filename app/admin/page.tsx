import { redirect } from 'next/navigation';
import { AdminPanel, type AdminPlayer } from '@/components/AdminPanel';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { totalsOf } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modération' };

/**
 * Panneau de modération.
 *
 * Le contrôle d'accès est ici, côté serveur, et de nouveau dans chaque route
 * d'API appelée par le panneau. Masquer l'onglet dans la navigation n'est qu'un
 * confort visuel.
 */
export default async function AdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/connexion');

  const data = await getStore().read((db) => {
    const players: AdminPlayer[] = db.players
      .filter((p) => p.active)
      .map((p) => {
        const totals = totalsOf(db, p.id);
        return {
          id: p.id,
          pseudo: p.pseudo,
          slug: p.slug,
          snowflakes: p.snowflakes,
          games: totals.countedGames,
          score: totals.totalScore,
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      players,
      config: {
        maxGamesPerPlayer: db.config.maxGamesPerPlayer,
        shopOpen: db.config.shopOpen,
        marketOpen: db.config.marketOpen,
        totalSubs: db.config.totalSubs,
      },
      auditTrail: db.audit
        .slice(-40)
        .reverse()
        .map((e) => ({ at: e.at, actor: e.actor, action: e.action, detail: e.detail })),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Accès réservé</p>
        <h1 className="section-title">
          Modé<em>ration</em>
        </h1>
      </header>

      <AdminPanel
        players={data.players}
        config={data.config}
        auditTrail={data.auditTrail}
      />
    </div>
  );
}
