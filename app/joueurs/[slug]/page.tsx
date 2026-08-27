import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardTile, EmptyState, StatTile, formatFlakes } from '@/components/ui';
import { getCard } from '@/lib/domain/catalog';
import { getPublicProfile } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  return { title: profile ? profile.pseudo : 'Joueur inconnu' };
}

/**
 * Profil public.
 *
 * Ne montre ni la main, ni le grand livre, ni les enchères en cours : ces
 * informations donneraient un avantage tactique. `getPublicProfile` les retire
 * côté serveur, elles ne transitent donc jamais.
 */
export default async function ProfilJoueurPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (!profile) notFound();

  const discovered = profile.collection.filter((c) => c.discovered);

  return (
    <div className="space-y-6">
      <nav className="text-xs text-faint">
        <Link href="/" className="text-muted no-underline hover:text-ice">
          Classement
        </Link>{' '}
        / {profile.pseudo}
      </nav>

      <header className="panel panel-frost flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line-bright bg-bg-3 font-display text-xl font-black text-ice">
          {profile.pseudo.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-black uppercase tracking-wide text-ink">
            {profile.pseudo}
          </h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {profile.shielded && <span className="badge border-ice/50 text-ice">🛡 Protégé</span>}
            {profile.themes
              .filter((t) => t.complete)
              .map((t) => (
                <span
                  key={t.id}
                  className="badge"
                  style={{ borderColor: `${t.color}55`, color: t.color }}
                  title={t.bonusLabel}
                >
                  {t.glyph} {t.name}
                </span>
              ))}
          </div>
        </div>
        {profile.twitchLogin && (
          <a
            href={`https://www.twitch.tv/${profile.twitchLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm no-underline"
            style={{ borderColor: '#9146FF', color: '#b98cff' }}
          >
            Twitch
          </a>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Points de saison" value={profile.totals.totalScore} accent="ice" />
        <StatTile
          label="Games"
          value={profile.totals.countedGames}
          hint={`moyenne ${profile.totals.averageScore}`}
          accent="muted"
        />
        <StatTile
          label="Kills"
          value={profile.totals.totalKills}
          hint={`${profile.totals.top1} Top 1`}
          accent="aurora"
        />
        <StatTile
          label="Meilleure game"
          value={profile.totals.bestScore}
          hint={`pire : ${profile.totals.worstScore}`}
          accent="gold"
        />
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
          Historique des games
        </h2>
        {profile.games.length === 0 ? (
          <EmptyState title="Aucune game enregistrée" />
        ) : (
          <div className="panel panel-frost scroll-x">
            <table className="rank-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Kills</th>
                  <th className="text-center">Top</th>
                  <th className="text-right">×</th>
                  <th className="text-right">Bonus</th>
                  <th className="text-right">Score</th>
                  <th>Cartes</th>
                </tr>
              </thead>
              <tbody>
                {profile.games.map((game) => (
                  <tr key={game.id} className={game.skipped ? 'opacity-45' : undefined}>
                    <td className="text-xs text-faint">
                      {new Date(game.playedAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {game.frozen && <span title="Game gelée"> ❄</span>}
                      {game.skipped && <span className="ml-1 text-[10px] uppercase">passée</span>}
                    </td>
                    <td className="num text-right text-ink">{game.kills}</td>
                    <td className="num text-center text-gold">{game.placement ?? '—'}</td>
                    <td className="num text-right text-muted">
                      {game.multiplier !== 1 ? `×${game.multiplier}` : '—'}
                    </td>
                    <td
                      className={`num text-right ${game.bonusPoints < 0 ? 'text-danger' : 'text-muted'}`}
                    >
                      {game.bonusPoints !== 0
                        ? `${game.bonusPoints > 0 ? '+' : ''}${game.bonusPoints}`
                        : '—'}
                    </td>
                    <td className="num text-right font-display text-base font-black text-ice">
                      {game.score}
                    </td>
                    <td className="text-xs">
                      {game.appliedCardIds.length === 0 ? (
                        <span className="text-faint">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {game.appliedCardIds.map((id, i) => {
                            const card = getCard(id);
                            return card ? (
                              <span key={`${id}-${i}`} title={card.name} aria-label={card.name}>
                                {card.glyph}
                              </span>
                            ) : null;
                          })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-black uppercase tracking-wide text-ink">
            Collection
          </h2>
          <span className="text-xs text-muted">
            {discovered.length} / {profile.collection.length} cartes découvertes ·{' '}
            <span className="num">❄ {formatFlakes(profile.snowflakes)}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {profile.collection.map((entry) => (
            <CardTile
              key={entry.cardId}
              cardId={entry.cardId}
              name={entry.discovered ? entry.name : '???'}
              rarity={entry.rarity}
              theme={entry.theme}
              glyph={entry.discovered ? entry.glyph : '❔'}
              dimmed={!entry.discovered}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
