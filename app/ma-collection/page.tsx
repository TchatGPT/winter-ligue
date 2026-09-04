import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CollectionBoard } from '@/components/CollectionBoard';
import { GrilleCollection } from '@/components/GrilleCollection';
import { StatTile, flakes } from '@/components/ui';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { hasShield } from '@/lib/services/league';
import { getProfile } from '@/lib/services/profile';
import { shortDateTime } from '@/lib/format';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ma collection' };

/**
 * Espace personnel du joueur.
 *
 * La session est vérifiée ici, côté serveur : masquer l'onglet ne suffirait
 * pas, quelqu'un pourrait taper l'URL. Un visiteur non connecté est renvoyé
 * vers la page de connexion.
 */
export default async function MaCollectionPage() {
  const session = await getSession();
  // Un administrateur reste un joueur : c'est son compte qui décide, pas son
  // rôle. Seule la session de secours, qui n'a aucun compte derrière, est exclue.
  const playerId = playerIdOf(session);
  if (!playerId) redirect('/connexion');

  const profile = await getProfile(playerId);
  if (!profile) redirect('/connexion');

  const opponents = await getStore().read((db) =>
    db.players
      .filter((p) => p.active && p.id !== playerId)
      .map((p) => ({ id: p.id, pseudo: p.pseudo, shielded: hasShield(db, p.id) }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
  );

  const discovered = profile.collection.filter((c) => c.discovered).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <TitreGlace taille="page" eyebrow={profile.pseudo}>
          Ma collection
        </TitreGlace>
        <Link href={`/joueurs/${profile.slug}`} className="btn btn-sm">
          Voir mon profil public
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Flocons" value={`❄ ${flakes(profile.snowflakes)}`} />
        <StatTile
          label="Collection"
          value={`${discovered} / ${profile.collection.length}`}
          hint={`${Math.round(profile.completion * 100)} % découvert`}
          accent="violet"
        />
        <StatTile
          label="Points de saison"
          value={profile.totals.totalScore}
          hint={`${profile.totals.countedGames} games`}
          accent="gold"
        />
        <StatTile
          label="Statut"
          value={profile.shielded ? 'Protégé 🛡' : 'Exposé'}
          hint={profile.shielded ? 'Bouclier de Givre actif' : 'Aucun bouclier actif'}
          accent={profile.shielded ? 'aurora' : 'ink'}
        />
      </section>

      <CollectionBoard profile={profile} opponents={opponents} />

      <div className="grid gap-8 xl:grid-cols-[3fr_2fr] xl:items-start">
      {/* ------------------------------ Collection ------------------------- */}
      <section>
        <TitreGlace taille="bloc" className="mb-3">
          Cartes découvertes
        </TitreGlace>
        <GrilleCollection entrees={profile.collection} />
        <p className="mt-2 text-xs text-faint">
          Une carte jouée ou vendue reste découverte&nbsp;: la collection garde la trace de tout ce qui est passé entre tes mains.
        </p>
      </section>

      {/* ----------------------------- Grand livre ------------------------- */}
      <section>
        <TitreGlace taille="bloc" className="mb-3">
          Derniers mouvements de flocons
        </TitreGlace>
        <div className="glass scroll-x">
          <table className="grid-table min-w-[420px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Motif</th>
                <th className="text-right">Mouvement</th>
                <th className="text-right">Solde</th>
              </tr>
            </thead>
            <tbody>
              {profile.ledger.map((entry, i) => (
                <tr key={i}>
                  <td className="text-xs text-faint">
                    {shortDateTime(entry.createdAt)}
                  </td>
                  <td className="text-xs text-muted">{entry.reason.replaceAll('_', ' ')}</td>
                  <td
                    className={`num text-right font-bold ${entry.delta >= 0 ? 'text-aurora' : 'text-danger'}`}
                  >
                    {entry.delta >= 0 ? '+' : ''}
                    {flakes(entry.delta)}
                  </td>
                  <td className="num text-right text-muted">{flakes(entry.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </div>
  );
}
