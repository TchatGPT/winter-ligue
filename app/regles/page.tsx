import { Regles } from '@/components/Regles';
import { exigeSession } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { resolvedPacks } from '@/lib/services/packs';

export const metadata = { title: 'Règles de la saison' };
export const dynamic = 'force-dynamic';

/** Les règles de la saison : le contenu est dans `components/Regles`. */
export default async function ReglesPage() {
  await exigeSession();
  const { maxGames, packs } = await getStore().read((db) => ({
    maxGames: db.config.maxGamesPerPlayer,
    // Les taux tels que la ligue les règle : ceux que le serveur tire.
    packs: resolvedPacks(db),
  }));
  return <Regles maxGames={maxGames} packs={packs} />;
}
