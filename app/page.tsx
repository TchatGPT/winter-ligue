import Link from 'next/link';
import { StatTile, EmptyState, formatFlakes } from '@/components/ui';
import { THEMES } from '@/lib/domain/catalog';
import { SEASON } from '@/lib/domain/rules';
import { getOverview, getRanking } from '@/lib/services/league';
import type { ThemeId } from '@/lib/domain/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Classement général' };

function placementCell(count: number, color: string) {
  return (
    <span className={count > 0 ? color : 'text-faint'}>{count}</span>
  );
}

export default async function ClassementPage() {
  const [ranking, overview] = await Promise.all([getRanking(), getOverview()]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{SEASON.edition}</p>
          <h1 className="section-title">
            Classement <em>Général</em>
          </h1>
        </div>
        <div className="panel px-4 py-2.5 text-right">
          <div className="text-[10px] uppercase tracking-[0.15em] text-faint">
            Qualification finale
          </div>
          <div className="font-display text-sm font-bold text-gold">
            🏆 Top {SEASON.finalistCount} — session de 3 h
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Joueurs" value={overview.playerCount} />
        <StatTile label="Games jouées" value={overview.gameCount} accent="muted" />
        <StatTile label="Kills cumulés" value={formatFlakes(overview.totalKills)} accent="aurora" />
        <StatTile
          label="Meilleure game"
          value={overview.bestScore}
          hint={overview.bestScorePlayer ?? undefined}
          accent="gold"
        />
        <StatTile
          label="Cartes en circulation"
          value={overview.cardsInCirculation}
          hint={`${overview.activeListings} en vente`}
          accent="violet"
        />
      </section>

      {ranking.length === 0 ? (
        <EmptyState
          title="Aucun joueur inscrit"
          hint="La modération peut ajouter les participants depuis l’onglet Modération. La connexion Twitch les inscrira automatiquement une fois activée."
        />
      ) : (
        <section className="panel panel-frost">
          <div className="scroll-x">
            <table className="rank-table min-w-[720px]">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Joueur</th>
                  <th className="text-right">Points</th>
                  <th className="text-right">Games</th>
                  <th className="text-right">Moy.</th>
                  <th className="text-right">Kills</th>
                  <th className="text-center">Top 1/2/3</th>
                  <th className="text-right">Meilleure</th>
                  <th className="text-right">❄</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => (
                  <tr key={row.id} className={row.finalist ? 'finalist' : undefined}>
                    <td className="font-display text-base font-black text-muted">
                      {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}
                    </td>
                    <td>
                      <Link
                        href={`/joueurs/${row.slug}`}
                        className="font-display text-sm font-bold uppercase tracking-wide text-ink no-underline hover:text-ice"
                      >
                        {row.pseudo}
                      </Link>
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {row.shielded && (
                          <span title="Protégé par un Bouclier de Givre" aria-label="Protégé">
                            🛡
                          </span>
                        )}
                        {row.completedThemes.map((theme) => {
                          const meta = THEMES[theme as ThemeId];
                          return meta ? (
                            <span
                              key={theme}
                              title={`Famille ${meta.name} complète — ${meta.setBonusLabel}`}
                              aria-label={`Famille ${meta.name} complète`}
                              className="text-xs"
                            >
                              {meta.glyph}
                            </span>
                          ) : null;
                        })}
                      </span>
                    </td>
                    <td className="num text-right font-display text-lg font-black text-ice">
                      {row.totals.totalScore}
                    </td>
                    <td className="num text-right text-muted">{row.totals.countedGames}</td>
                    <td className="num text-right text-muted">{row.totals.averageScore}</td>
                    <td className="num text-right text-muted">{row.totals.totalKills}</td>
                    <td className="num text-center text-xs">
                      {placementCell(row.totals.top1, 'text-gold')} /{' '}
                      {placementCell(row.totals.top2, 'text-ink')} /{' '}
                      {placementCell(row.totals.top3, 'text-muted')}
                    </td>
                    <td className="num text-right text-aurora">{row.totals.bestScore}</td>
                    <td className="num text-right text-faint">{formatFlakes(row.snowflakes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
            Égalité départagée par le nombre de Top 1, puis les kills, puis la meilleure game.
            Liseré doré : places qualificatives.
          </p>
        </section>
      )}
    </div>
  );
}
