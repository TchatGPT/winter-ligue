import { EcranJoueurs, type LigneJoueur } from '@/components/admin/EcranJoueurs';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { totalsOf } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Joueurs — Administration' };

export default async function AdminJoueursPage() {
  const session = await exigeRole('moderateur');
  const estAdmin = session.role === 'admin';

  const joueurs = await getStore().read((db) =>
    db.players
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
  );

  return <EcranJoueurs joueurs={joueurs} estAdmin={estAdmin} />;
}
