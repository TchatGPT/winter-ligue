import { EcranSaison } from '@/components/admin/EcranSaison';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saison — Administration' };

export default async function AdminSaisonPage() {
  const data = await getStore().read((db) => ({
    config: {
      maxGamesPerPlayer: db.config.maxGamesPerPlayer,
      shopOpen: db.config.shopOpen,
      marketOpen: db.config.marketOpen,
      totalSubs: db.config.totalSubs,
    },
    joueurs: db.players
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, pseudo: p.pseudo }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
  }));

  return <EcranSaison config={data.config} joueurs={data.joueurs} />;
}
