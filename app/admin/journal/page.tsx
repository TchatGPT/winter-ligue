import { EcranJournal, type LigneJournal } from '@/components/admin/EcranJournal';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal — Administration' };

export default async function AdminJournalPage() {
  await exigeRole('moderateur');
  // Trois cents lignes : de quoi remonter une soirée entière sans transformer la
  // page en export. Le filtre travaille sur ce lot, donc en mémoire du client.
  const entrees = await getStore().read((db) =>
    db.audit
      .slice(-300)
      .reverse()
      .map(
        (e): LigneJournal => ({ at: e.at, actor: e.actor, action: e.action, detail: e.detail }),
      ),
  );

  return <EcranJournal entrees={entrees} />;
}
