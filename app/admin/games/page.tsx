import { EcranGames, type LigneGame, type OptionJoueur } from '@/components/admin/EcranGames';
import { getStore } from '@/lib/db/store';
import { gamesOf } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Games — Administration' };

export default async function AdminGamesPage() {
  const data = await getStore().read((db) => {
    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Inconnu';

    const joueurs: OptionJoueur[] = db.players
      .filter((p) => p.active)
      .map((p) => ({
        id: p.id,
        pseudo: p.pseudo,
        games: gamesOf(db, p.id).length,
        snowflakes: p.snowflakes,
      }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'));

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

    return { joueurs, recentes };
  });

  return <EcranGames joueurs={data.joueurs} recentes={data.recentes} />;
}
