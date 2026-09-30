import Link from 'next/link';
import { AdminNav } from '@/components/admin/Cadre';
import { EnTetePage } from '@/components/EnTetePage';
import { exigeRole } from '@/lib/auth/acces';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administration' };

/**
 * Le cadre de l'espace d'administration : l'en-tête des pages du site, puis
 * la navigation en pastilles.
 *
 * Le contrôle d'accès est ici **et** en tête de chaque page (`exigeRole`) :
 * lors d'une navigation entre onglets, Next ne rejoue que la page, et une
 * requête fabriquée peut demander la seule page. Ce n'est pas pour autant le
 * contrôle : chaque route d'API revérifie la session de son côté.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await exigeRole('moderateur');
  const estAdmin = session.role === 'admin';

  return (
    <div className="space-y-5">
      <EnTetePage
        icone="shield"
        eyebrow="Accès réservé"
        titre={estAdmin ? 'Administration' : 'Modération'}
        lead={
          estAdmin
            ? 'Les joueurs, les subs, les overlays du stream et le journal. Les boosters s’ouvrent sur leur page, les games se saisissent depuis le classement.'
            : 'Les joueurs, les subs et le journal. Les règles de la saison — limite de games, rôles, sauvegarde — restent aux administrateurs.'
        }
        droite={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="admin-role" data-role={session.role}>
              {estAdmin ? 'Administrateur' : 'Modérateur'}
            </span>
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
