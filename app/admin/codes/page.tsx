import { EcranCodes } from '@/components/admin/EcranCodes';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { soldeMaxDe } from '@/lib/domain/rules';
import { vueCodes } from '@/lib/services/codes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Codes cadeaux — Modération' };

/** Les codes cadeaux : c'est ainsi que les flocons se donnent. */
export default async function AdminCodesPage() {
  await exigeRole('admin');
  const { codes, soldeMax } = await getStore().read((db) => ({ codes: vueCodes(db), soldeMax: soldeMaxDe(db.config.numero) }));
  return <EcranCodes codes={codes} soldeMax={soldeMax} />;
}
