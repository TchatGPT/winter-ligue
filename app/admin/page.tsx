import { redirect } from 'next/navigation';
import { AdminPanel, type AdminPlayer } from '@/components/AdminPanel';
import {
  AdminReglages,
  type ReglageBooster,
  type ReglageJoueur,
} from '@/components/AdminReglages';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { resolvedBoosters } from '@/lib/services/boosters';
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
  // Les deux échelons entrent ; ce qu'ils voient diffère plus bas, et chaque
  // route revérifie de son côté.
  if (!session || (session.role !== 'admin' && session.role !== 'moderateur')) {
    redirect('/connexion');
  }
  const estAdmin = session.role === 'admin';

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
      roles: db.players
        .filter((p) => p.active)
        .map((p): ReglageJoueur => ({ id: p.id, pseudo: p.pseudo, role: p.role }))
        .sort(
          (a, b) =>
            ['admin', 'moderateur', 'joueur'].indexOf(a.role) -
              ['admin', 'moderateur', 'joueur'].indexOf(b.role) ||
            a.pseudo.localeCompare(b.pseudo, 'fr'),
        ),
      boosters: resolvedBoosters(db).map(
        (b): ReglageBooster => ({
          id: b.id,
          name: b.name,
          price: b.price,
          weights: b.weights,
          slots: b.slots,
          modifie: db.boosterSettings.some((r) => r.boosterId === b.id),
        }),
      ),
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
          {estAdmin ? (
            <>
              Admini<em>stration</em>
            </>
          ) : (
            <>
              Modé<em>ration</em>
            </>
          )}
        </h1>
      </header>

      <AdminPanel
        players={data.players}
        config={data.config}
        auditTrail={data.auditTrail}
      />

      {estAdmin && <AdminReglages joueurs={data.roles} boosters={data.boosters} />}
    </div>
  );
}
