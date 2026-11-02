import { BarreAdmin } from '@/components/admin/Kit';
import { exigeRole } from '@/lib/auth/acces';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { estTesteur } from '@/lib/services/cartesDeTest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modération' };

/**
 * L'espace de modération : une barre — son nom, ses sections, l'ouverture des
 * boosters —, puis l'écran de la section. Chaque page revérifie le rôle
 * (`exigeRole`) : la mise en page seule ne protège rien.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await exigeRole('admin');
  const joueurId = playerIdOf(session);
  const testeur = await getStore().read((db) => estTesteur(db, joueurId));
  return (
    <div className="adm">
      <BarreAdmin testeur={testeur} />
      {children}
    </div>
  );
}
