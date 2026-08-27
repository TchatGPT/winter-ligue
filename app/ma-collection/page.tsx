import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CollectionBoard } from '@/components/CollectionBoard';
import { CardTile, StatTile, formatFlakes } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { hasShield } from '@/lib/services/league';
import { getProfile } from '@/lib/services/profile';

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
  if (!session || session.role !== 'joueur') redirect('/connexion');

  const profile = await getProfile(session.sub);
  if (!profile) redirect('/connexion');

  const opponents = await getStore().read((db) =>
    db.players
      .filter((p) => p.active && p.id !== session.sub)
      .map((p) => ({ id: p.id, pseudo: p.pseudo, shielded: hasShield(db, p.id) }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
  );

  const discovered = profile.collection.filter((c) => c.discovered).length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{profile.pseudo}</p>
          <h1 className="section-title">
            Ma <em>Collection</em>
          </h1>
        </div>
        <Link href={`/joueurs/${profile.slug}`} className="btn btn-sm">
          Voir mon profil public
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Flocons" value={`❄ ${formatFlakes(profile.snowflakes)}`} />
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
          accent={profile.shielded ? 'aurora' : 'muted'}
        />
      </section>

      {/* ---------------------------- Bonus de familles -------------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
          Bonus de familles
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {profile.themes.map((theme) => (
            <div
              key={theme.id}
              className="panel p-3"
              style={{ borderColor: theme.complete ? theme.color : undefined }}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold uppercase tracking-wide" style={{ color: theme.color }}>
                  <span aria-hidden="true">{theme.glyph}</span> {theme.name}
                </span>
                <span className="num text-xs text-muted">
                  {theme.owned}/{theme.total}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-2">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${(theme.owned / theme.total) * 100}%`,
                    background: theme.color,
                  }}
                />
              </div>
              <p
                className={`mt-2 text-xs ${theme.complete ? 'text-ink' : 'text-faint'}`}
              >
                {theme.complete ? '✓ ' : ''}
                {theme.bonusLabel}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CollectionBoard profile={profile} opponents={opponents} />

      {/* ------------------------------ Collection ------------------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
          Cartes découvertes
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {profile.collection.map((entry) => (
            <CardTile
              key={entry.cardId}
              cardId={entry.cardId}
              name={entry.discovered ? entry.name : '???'}
              rarity={entry.rarity}
              theme={entry.theme}
              glyph={entry.discovered ? entry.glyph : '❔'}
              dimmed={!entry.discovered}
              footer={
                <span className="text-[10px] uppercase tracking-wider text-faint">
                  {entry.discovered
                    ? entry.copies > 0
                      ? `${entry.copies} exemplaire${entry.copies > 1 ? 's' : ''} en main`
                      : 'Découverte — aucun exemplaire'
                    : 'Non découverte'}
                </span>
              }
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">
          Une carte jouée ou vendue reste découverte&nbsp;: les bonus de famille sont définitifs.
        </p>
      </section>

      {/* ----------------------------- Grand livre ------------------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
          Derniers mouvements de flocons
        </h2>
        <div className="panel panel-frost scroll-x">
          <table className="rank-table min-w-[420px]">
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
                    {new Date(entry.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="text-xs text-muted">{entry.reason.replaceAll('_', ' ')}</td>
                  <td
                    className={`num text-right font-bold ${entry.delta >= 0 ? 'text-aurora' : 'text-danger'}`}
                  >
                    {entry.delta >= 0 ? '+' : ''}
                    {formatFlakes(entry.delta)}
                  </td>
                  <td className="num text-right text-muted">{formatFlakes(entry.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
