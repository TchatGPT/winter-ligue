import { EcranJoueurs, type FiltreJoueurs, type LigneJoueur } from '@/components/admin/EcranJoueurs';
import { exigeRole } from '@/lib/auth/acces';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { getStore } from '@/lib/db/store';
import { totalsOf } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Joueurs — Modération' };

/** Les filtres qu'on peut demander dans l'adresse : `?filtre=sans-pseudo`. */
const FILTRES: Record<string, FiltreJoueurs> = {
  'sans-pseudo': 'sansActivision',
  'boosters-perso': 'boosters',
  moderation: 'modo',
};

export default async function AdminJoueursPage({
  searchParams,
}: {
  searchParams: Promise<{ [cle: string]: string | string[] | undefined }>;
}) {
  await exigeRole('admin');
  const brut = (await searchParams).filtre;
  const filtre = typeof brut === 'string' && Object.hasOwn(FILTRES, brut) ? FILTRES[brut] : 'tous';
  const chaine = chaineDeLaLigue();

  const { joueurs } = await getStore().read((db) => ({
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
          boostersPerso: db.packsDus.filter(
            (d) => d.packId === 'perso' && d.joueurId === p.id && d.ouvertureId === null,
          ).length,
          streameuse: estLaStreameuse(p, chaine),
          games: totals.countedGames,
          score: totals.totalScore,
          inscritLe: p.joinedAt,
        };
      })
      .sort((a, b) => b.score - a.score),
  }));

  return <EcranJoueurs joueurs={joueurs} filtreInitial={filtre} />;
}
