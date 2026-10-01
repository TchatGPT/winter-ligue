import { EcranJournal, type LigneJournal } from '@/components/admin/EcranJournal';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { ACTEURS_SYSTEME } from '@/lib/domain/acteurs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal — Modération' };

/** La marque, dans le détail d'une ligne, qui nomme le créateur d'un code. */
const CREE_PAR = ' · créé par ';

export default async function AdminJournalPage() {
  await exigeRole('admin');
  const store = getStore();
  // Trois cents lignes : de quoi remonter une soirée entière sans transformer la
  // page en export. Le filtre travaille sur ce lot, donc en mémoire du client.
  const [lignes, { pseudos, createurs }] = await Promise.all([
    store.journal(300),
    store.read((db) => ({
      pseudos: new Map(db.players.map((p) => [p.id, p.pseudo])),
      // Le créateur de chaque code encore en base, par son texte.
      createurs: new Map(db.codesCadeaux.map((c) => [c.code, c.creePar])),
    })),
  ]);

  /** Qui a agi, en clair : un pseudo plutôt qu'un identifiant. */
  const nom = (id: string) => pseudos.get(id) ?? ACTEURS_SYSTEME[id] ?? id;

  // Un code supprimé n'est plus en base : sa création, si elle est dans le lot,
  // dit encore qui l'a créé.
  for (const e of lignes) {
    if (e.action !== 'CODE_CREE') continue;
    const texte = texteDuCode(e.detail);
    if (texte && !createurs.has(texte)) createurs.set(texte, e.actor);
  }

  const entrees = lignes.map((e): LigneJournal => {
    let detail = e.detail;
    // Les lignes d'un code nomment son créateur. Celles d'avant que le journal
    // ne l'inscrive le reçoivent ici, à l'affichage : le journal, lui, ne se
    // réécrit pas.
    if (e.action.startsWith('CODE_') && !detail.includes(CREE_PAR)) {
      const createur = createurs.get(texteDuCode(detail) ?? '');
      if (createur) detail += `${CREE_PAR}${nom(createur)}`;
    }
    return { id: e.id, at: e.at, actor: nom(e.actor), action: e.action, detail };
  });

  return <EcranJournal entrees={entrees} />;
}

/** Le texte du code, en tête du détail : « K7M3PQ9X : … », ou le code seul. */
function texteDuCode(detail: string): string | null {
  return /^([A-Z0-9]{4,})(?:\s|$)/.exec(detail)?.[1] ?? null;
}
