import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/Cadre';
import { getSession } from '@/lib/auth/session';

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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Accès réservé</p>
          <h1 className="section-title">
            {estAdmin ? (
              <>
                Admini<em>stration</em>
              </>
            ) : (
              <>
                Modé<em>ration</em>
              </>
            )}
          </h1>
        </div>
        <span className="badge" style={estAdmin ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
          {estAdmin ? 'Administrateur' : 'Modérateur'}
        </span>
      </header>

      <AdminNav estAdmin={estAdmin} />

      {children}
    </div>
  );
}
