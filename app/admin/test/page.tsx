import { notFound } from 'next/navigation';
import { EcranTestCartes } from '@/components/admin/EcranTestCartes';
import { exigeRole } from '@/lib/auth/acces';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { vueTestCartes } from '@/lib/services/cartesDeTest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Test des cartes — Modération' };

/**
 * La page de test : un testeur de la ligue (`TESTEURS_CARTES`) se donne la
 * carte de son choix. Pour tout autre compte, elle n'existe pas.
 */
export default async function AdminTestPage() {
  const session = await exigeRole('admin');
  const vue = await getStore().read((db) => vueTestCartes(db, playerIdOf(session)));
  if (!vue) notFound();
  return <EcranTestCartes vue={vue} />;
}
