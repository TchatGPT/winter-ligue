import { EcranCodes } from '@/components/admin/EcranCodes';
import { exigeRole } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { vueCodes } from '@/lib/services/codes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Codes cadeaux — Modération' };

/** Les codes cadeaux : c'est ainsi que les flocons se donnent. */
export default async function AdminCodesPage() {
  await exigeRole('admin');
  const codes = await getStore().read((db) => vueCodes(db));
  return <EcranCodes codes={codes} />;
}
