import { EcranJoueurs, type LigneJoueur } from '@/components/admin/EcranJoueurs';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { vueCodes } from '@/lib/services/codes';
import { totalsOf } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Joueurs — Modération' };

export default async function AdminJoueursPage() {
  await exigeRole('admin');

  const { joueurs, codes } = await getStore().read((db) => ({
    joueurs: db.players
      .filter((p) => p.active)
      .map((p): LigneJoueur => {
        const totals = totalsOf(db, p.id);
        return {
          id: p.id,
          pseudo: p.pseudo,
          slug: p.slug,
          role: p.role,
          activisionId: p.activisionId,
          snowflakes: p.snowflakes,
          games: totals.countedGames,
          score: totals.totalScore,
        };
      })
      .sort((a, b) => b.score - a.score),
    codes: vueCodes(db),
  }));

  return <EcranJoueurs joueurs={joueurs} codes={codes} />;
}
