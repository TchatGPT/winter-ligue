import { EcranAlertes } from '@/components/admin/EcranAlertes';
import { exigeRole } from '@/lib/auth/acces';
import { alertesDe } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Alertes — Modération' };

/**
 * Les alertes du live : couper ce qui passe sur le stream et dans le tchat,
 * le temps de tester (16/11/2026). Réservé aux administrateurs : c'est un
 * réglage de la chaîne.
 */
export default async function AdminAlertesPage() {
  await exigeRole('admin');
  const alertes = await getStore().read((db) => alertesDe(db.config));
  return <EcranAlertes alertes={alertes} />;
}
