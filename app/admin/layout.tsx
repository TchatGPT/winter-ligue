import { BarreAdmin } from '@/components/admin/Kit';
import { exigeRole } from '@/lib/auth/acces';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modération' };

/**
 * L'espace de modération : une barre — son nom, ses sections, l'ouverture des
 * boosters —, puis l'écran de la section. Chaque page revérifie le rôle
 * (`exigeRole`) : la mise en page seule ne protège rien.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigeRole('admin');
  return (
    <div className="adm">
      <BarreAdmin />
      {children}
    </div>
  );
}
