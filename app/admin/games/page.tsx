import { EcranGames, type LigneGame } from '@/components/admin/EcranGames';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Games — Administration' };

export default async function AdminGamesPage() {
  await exigeRole('moderateur');
  const data = await getStore().read((db) => {
    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Inconnu';

    // Les trente dernières, la plus récente d'abord : au-delà, on cherche dans
    // le journal, pas dans un tableau de saisie.
    const recentes: LigneGame[] = [...db.games]
      .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
      .slice(0, 30)
      .map((g) => ({
        id: g.id,
        pseudo: pseudo(g.playerId),
        kills: g.kills,
        placement: g.placement,
        bonusPoints: g.bonusPoints,
        score: g.score,
        playedAt: g.playedAt,
        note: g.note,
      }));

    return { recentes };
  });

  return <EcranGames recentes={data.recentes} />;
}
