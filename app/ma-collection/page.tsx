import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CollectionBoard } from '@/components/CollectionBoard';
import { CardTile, Meter, StatTile, flakes } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { SET_TIERS } from '@/lib/domain/rules';
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

      {/* ---------------------------- Bonus de familles -------------------- */}
      <section>
        <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
          Bonus de familles
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {profile.themes.map((theme) => (
            <div
              key={theme.id}
              className="glass p-3"
              style={{
                borderColor: theme.complete ? theme.color : undefined,
                borderLeft: `3px solid ${theme.complete ? theme.color : `${theme.color}44`}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-display text-sm font-bold tracking-wide uppercase"
                  style={{ color: theme.color }}
                >
                  <span aria-hidden="true">{theme.glyph}</span> {theme.name}
                </span>
                <span className="num shrink-0 text-xs text-muted">
                  {theme.owned}/{theme.total}
                </span>
              </div>

              {/* Deux jalons visibles sur la barre : le palier 4/6 puis le 6/6. */}
              <div className="relative mt-2">
                <Meter ratio={theme.owned / theme.total} color={theme.color} />
                <span
                  className="absolute top-0 h-1 w-px bg-bg"
                  style={{ left: `${(SET_TIERS.partial / theme.total) * 100}%` }}
                  aria-hidden="true"
                />
              </div>

              <dl className="mt-2 space-y-0.5 text-[13px]">
                <div className="flex gap-1.5">
                  <dt className={theme.partial ? 'text-aurora' : 'text-faint'}>
                    {theme.partial ? '✓' : `${SET_TIERS.partial}/${theme.total}`}
                  </dt>
                  <dd className={theme.partial && !theme.complete ? 'text-ink' : 'text-faint'}>
                    {theme.partialBonusLabel}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className={theme.complete ? 'text-aurora' : 'text-faint'}>
                    {theme.complete ? '✓' : `${theme.total}/${theme.total}`}
                  </dt>
                  <dd className={theme.complete ? 'text-ink' : 'text-faint'}>
                    {theme.fullBonusLabel}
                  </dd>
                </div>
              </dl>

              {!theme.complete && (
                <p className="mt-1.5 text-[13px] text-faint">
                  Encore {theme.toNextTier} carte{theme.toNextTier > 1 ? 's' : ''} avant le prochain
                  palier.
                </p>
              )}
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
                <span className="text-[13px] uppercase tracking-wider text-faint">
                  {entry.discovered
                    ? entry.copies > 0
                      ? `${entry.copies} exemplaire${entry.copies > 1 ? 's' : ''} en réserve`
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
  );
}
