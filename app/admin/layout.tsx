import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/Cadre';
import { getSession } from '@/lib/auth/session';
import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Administration' };

/**
 * Le cadre de l'espace d'administration.
 *
 * Le contrôle d'accès est ici, une fois, plutôt que répété en tête de chaque
 * page : une section qu'on ajoute demain est protégée sans qu'on ait à y penser.
 * C'est aussi ce qui rend l'oubli impossible — il n'y a plus rien à oublier.
 *
 * Ce n'est pas pour autant le contrôle : chaque route d'API revérifie la
 * session de son côté. Masquer un onglet n'a jamais empêché personne d'appeler
 * une route.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'moderateur')) {
    redirect('/connexion');
  }
  const estAdmin = session.role === 'admin';

  return (
    <div className="space-y-5">
      {/* L'entête et les onglets sur une plaque de verre : posés à même la
          photo, ils ne se lisaient pas. */}
      <section className="glass glass-reflet relative overflow-hidden px-5 pt-7 pb-0 sm:px-7">
        <SnowCap radius="var(--r-lg)" seed="admin" epaisseur={16} />
        <header className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <TitreGlace taille="page" eyebrow="Accès réservé">
              {estAdmin ? 'Administration' : 'Modération'}
            </TitreGlace>
          </div>
          <span className="badge" style={estAdmin ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
            {estAdmin ? 'Administrateur' : 'Modérateur'}
          </span>
        </header>

        <div className="relative mt-5">
          <AdminNav estAdmin={estAdmin} />
        </div>
      </section>

      {children}
    </div>
  );
}
