import { EcranSaison } from '@/components/admin/EcranSaison';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saison — Administration' };

export default async function AdminSaisonPage() {
  await exigeRole('moderateur');
  const data = await getStore().read((db) => ({
    config: {
      maxGamesPerPlayer: db.config.maxGamesPerPlayer,
      totalSubs: db.config.totalSubs,
    },
    joueurs: db.players
      .filter((p) => p.active)
      .map((p) => ({ id: p.id, pseudo: p.pseudo, subsOfferts: p.subsOfferts }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
    packsEnFile: db.packsDus.filter((p) => p.ouvertureId === null).length,
  }));

  return <EcranSaison config={data.config} joueurs={data.joueurs} packsEnFile={data.packsEnFile} />;
}
