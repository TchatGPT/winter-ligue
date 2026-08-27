import Link from 'next/link';
import { SubsBanner } from '@/components/SubsBanner';
import { EmptyState, PageHead, StatTile, flakes, flakesShort } from '@/components/ui';
import { getStore } from '@/lib/db/store';
import { THEMES } from '@/lib/domain/catalog';
import { SEASON } from '@/lib/domain/rules';
import type { ThemeId } from '@/lib/domain/types';
import { getOverview, getRanking } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Classement général' };

const MEDALS = ['🥇', '🥈', '🥉'];

export default async function ClassementPage() {
  const [ranking, overview, totalSubs] = await Promise.all([
    getRanking(),
    getOverview(),
    getStore().read((db) => db.config.totalSubs),
  ]);

  return (
    <div className="space-y-5">
      <PageHead
        eyebrow={`${SEASON.name} · ${SEASON.edition}`}
        title="Classement"
        accent="Général"
        actions={
          <div className="panel px-4 py-2 text-right">
            <div className="text-[10px] tracking-[0.15em] text-faint uppercase">
              Qualification finale
            </div>
            <div className="font-display text-sm font-bold text-gold">
              🏆 Top {SEASON.finalistCount} — session de 3 h
            </div>
          </div>
        }
      />

      <SubsBanner totalSubs={totalSubs} />

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Joueurs" value={overview.playerCount} />
        <StatTile label="Games jouées" value={overview.gameCount} accent="ink" />
        <StatTile label="Kills cumulés" value={flakes(overview.totalKills)} accent="aurora" />
        <StatTile
          label="Meilleure game"
          value={overview.bestScore}
          hint={overview.bestScorePlayer ?? undefined}
          accent="gold"
        />
        <StatTile
          label="Cartes en jeu"
          value={overview.cardsInCirculation}
          hint={`${overview.activeListings} en vente`}
          accent="violet"
        />
      </section>

      {ranking.length === 0 ? (
        <EmptyState
          title="Aucun joueur inscrit"
          hint="La modération ajoute les participants depuis l’onglet Modération. La connexion Twitch les inscrira automatiquement une fois activée."
        />
      ) : (
        <section className="panel panel-frost">
          <div className="scroll-x">
            <table className="grid-table min-w-[760px]">
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
                  <th className="text-right">Collection</th>
                  <th className="text-right">❄</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => (
                  <tr key={row.id} className={row.finalist ? 'finalist' : undefined}>
                    <td className="font-display text-base font-black text-muted">
                      {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/joueurs/${row.slug}`}
                          className="font-display text-sm font-bold tracking-wide text-ink no-underline hover:text-ice"
                        >
                          {row.pseudo}
                        </Link>
                        {row.shielded && (
                          <span title="Protégé par un bouclier" aria-label="Protégé">
                            🛡
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="num text-right font-display text-lg font-black text-ice">
                      {row.totals.totalScore}
                    </td>
                    <td className="num text-right text-muted">{row.totals.countedGames}</td>
                    <td className="num text-right text-muted">{row.totals.averageScore}</td>
                    <td className="num text-right text-muted">{row.totals.totalKills}</td>
                    <td className="num text-center text-xs">
                      <span className={row.totals.top1 > 0 ? 'text-gold' : 'text-faint'}>
                        {row.totals.top1}
                      </span>
                      <span className="text-faint"> / </span>
                      <span className={row.totals.top2 > 0 ? 'text-ink' : 'text-faint'}>
                        {row.totals.top2}
                      </span>
                      <span className="text-faint"> / </span>
                      <span className={row.totals.top3 > 0 ? 'text-muted' : 'text-faint'}>
                        {row.totals.top3}
                      </span>
                    </td>
                    <td className="num text-right text-aurora">{row.totals.bestScore}</td>
                    <td className="text-right">
                      <span className="inline-flex gap-1">
                        {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                          const theme = THEMES[id];
                          const full = row.completedThemes.includes(id);
                          const part = row.partialThemes.includes(id);
                          if (!full && !part) {
                            return (
                              <span key={id} className="text-xs opacity-20" title={theme.name}>
                                {theme.glyph}
                              </span>
                            );
                          }
                          return (
                            <span
                              key={id}
                              className="text-xs"
                              style={{ opacity: full ? 1 : 0.55 }}
                              title={`${theme.name} — ${
                                full ? theme.fullBonusLabel : theme.partialBonusLabel
                              }`}
                            >
                              {theme.glyph}
                            </span>
                          );
                        })}
                      </span>
                    </td>
                    <td className="num text-right text-faint">{flakesShort(row.snowflakes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-faint">
            Égalité départagée par le nombre de Top 1, puis les kills, puis la meilleure game.
            Liseré doré : places qualificatives. Les pastilles de collection sont pleines à 6/6,
            estompées à 4/6.
          </p>
        </section>
      )}
    </div>
  );
}
