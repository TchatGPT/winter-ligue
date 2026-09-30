import { EcranJournal, type LigneJournal } from '@/components/admin/EcranJournal';
import { exigeRole } from '@/lib/auth/acces';
import { SUJET_SECOURS } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal — Administration' };

/** Qui a agi, en clair : un pseudo plutôt qu'un identifiant. */
const ACTEURS_SYSTEME: Record<string, string> = {
  [SUJET_SECOURS]: 'Session de secours',
  twitch: 'Twitch',
  systeme: 'Système',
};

export default async function AdminJournalPage() {
  await exigeRole('moderateur');
  const store = getStore();
  // Trois cents lignes : de quoi remonter une soirée entière sans transformer la
  // page en export. Le filtre travaille sur ce lot, donc en mémoire du client.
  const [lignes, pseudos] = await Promise.all([
    store.journal(300),
    store.read((db) => new Map(db.players.map((p) => [p.id, p.pseudo]))),
  ]);
  const entrees = lignes.map(
    (e): LigneJournal => ({
      id: e.id,
      at: e.at,
      actor: pseudos.get(e.actor) ?? ACTEURS_SYSTEME[e.actor] ?? e.actor,
      action: e.action,
      detail: e.detail,
    }),
  );

  return <EcranJournal entrees={entrees} />;
}
