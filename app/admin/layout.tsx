import Link from 'next/link';
import { AdminNav } from '@/components/admin/Cadre';
import { EnTetePage } from '@/components/EnTetePage';
import { exigeRole } from '@/lib/auth/acces';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Modération' };

/**
 * Le cadre de l'espace de modération : l'en-tête des pages du site, puis la
 * navigation en pastilles.
 *
 * Le contrôle d'accès est ici **et** en tête de chaque page (`exigeRole`) :
 * lors d'une navigation entre onglets, Next ne rejoue que la page, et une
 * requête fabriquée peut demander la seule page. Ce n'est pas pour autant le
 * contrôle : chaque route d'API revérifie la session de son côté.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigeRole('admin');

  return (
    <div className="space-y-5">
      <EnTetePage
        icone="shield"
        eyebrow="Accès réservé"
        titre="Modération"
        lead="Les joueurs, les subs, les overlays du stream et le journal. Les boosters s’ouvrent sur leur page, les games se saisissent depuis le classement."
        droite={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/boosters" className="btn btn-sm no-underline">
              Page Boosters →
            </Link>
          </div>
        }
      />

      <AdminNav />

      {children}
    </div>
  );
}
