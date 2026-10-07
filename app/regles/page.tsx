import { Regles } from '@/components/Regles';
import { exigeSession } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';

export const metadata = { title: 'Règles de la saison' };
export const dynamic = 'force-dynamic';

/** Les règles de la saison : le contenu est dans `components/Regles`. */
export default async function ReglesPage() {
  await exigeSession();
  const maxGames = await getStore().read((db) => db.config.maxGamesPerPlayer);
  return <Regles maxGames={maxGames} />;
}
