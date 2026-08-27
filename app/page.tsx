import Link from 'next/link';
import { SubsBanner } from '@/components/SubsBanner';
import { DataRow, EmptyState, PageHead, StatTile, flakes, flakesShort } from '@/components/ui';
import { getStore } from '@/lib/db/store';
import { THEMES } from '@/lib/domain/catalog';
import { SEASON } from '@/lib/domain/rules';
import type { ThemeId } from '@/lib/domain/types';
import { getOverview, getRanking, type RankingRow } from '@/lib/services/league';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Classement général' };

const MEDALS = ['🥇', '🥈', '🥉'];
const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/**
 * Pastilles de familles : disque plein à 6/6, anneau à 4/6, point éteint sinon.
 *
 * Des points colorés plutôt que les emojis des familles : à 14 px dans un
 * tableau, quatre emojis se ressemblent tous et font du bruit, là où trois
 * états de disque se lisent d'un coup d'œil.
 */
function ThemeDots({ row }: { row: RankingRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {THEME_IDS.map((id) => {
        const theme = THEMES[id];
        const full = row.completedThemes.includes(id);
        const part = row.partialThemes.includes(id);
        return (
          <span
            key={id}
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: full ? theme.color : 'transparent',
              border: `1.5px solid ${full || part ? theme.color : 'rgba(255,255,255,0.16)'}`,
              boxShadow: full ? `0 0 8px ${theme.color}80` : undefined,
              opacity: full || part ? 1 : 0.5,
            }}
            title={
              full
                ? `${theme.name} complète — ${theme.fullBonusLabel}`
                : part
                  ? `${theme.name} 4/6 — ${theme.partialBonusLabel}`
                  : `${theme.name} — non complétée`
            }
          />
        );
      })}
    </span>
  );
}

function PlayerName({ row }: { row: RankingRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Link
        href={`/joueurs/${row.slug}`}
        className="truncate font-display text-[17px] font-bold tracking-wide text-ink no-underline hover:text-ice"
      >
        {row.pseudo}
      </Link>
      {row.shielded && (
        <span title="Protégé par un bouclier" aria-label="Protégé" className="shrink-0">
          🛡
        </span>
      )}
    </span>
  );
}

export default async function ClassementPage() {
  const [ranking, overview, totalSubs] = await Promise.all([
    getRanking(),
    getOverview(),
    getStore().read((db) => db.config.totalSubs),
  ]);

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={`${SEASON.name} · ${SEASON.edition}`}
        title="Classement"
        accent="Général"
        actions={
          <div className="glass glass-soft px-4 py-3">
            <div className="text-[13px] tracking-[0.16em] text-faint uppercase">
              Qualification finale
            </div>
            <div className="font-display text-base font-bold text-gold">
              🏆 Top {SEASON.finalistCount} — session de 3 h
            </div>
          </div>
        }
      />

      <SubsBanner totalSubs={totalSubs} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
        <>
          {/* -------- Mobile : une carte par joueur, rien ne défile ------- */}
          <section className="space-y-2.5 md:hidden" aria-label="Classement">
            {ranking.map((row) => (
              <DataRow
                key={row.id}
                highlight={row.finalist}
                lead={
                  <div className="flex items-center gap-3">
                    <span className="w-8 shrink-0 text-center font-display text-xl font-black text-muted">
                      {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
                    </span>
                    <div className="min-w-0">
                      <PlayerName row={row} />
                      <div className="mt-0.5">
                        <ThemeDots row={row} />
                      </div>
                    </div>
                  </div>
                }
                trail={
                  <div>
                    <div className="num font-display text-2xl leading-none font-black text-ice">
                      {row.totals.totalScore}
                    </div>
                    <div className="text-[13px] tracking-wider text-faint uppercase">points</div>
                  </div>
                }
                fields={[
                  { label: 'Games', value: row.totals.countedGames },
                  { label: 'Kills', value: row.totals.totalKills },
                  { label: 'Moyenne', value: row.totals.averageScore },
                  {
                    label: 'Top 1/2/3',
                    value: (
                      <>
                        <span className={row.totals.top1 > 0 ? 'text-gold' : 'text-faint'}>
                          {row.totals.top1}
                        </span>
                        <span className="text-faint">/{row.totals.top2}</span>
                        <span className="text-faint">/{row.totals.top3}</span>
                      </>
                    ),
                  },
                  {
                    label: 'Meilleure',
                    value: <span className="text-aurora">{row.totals.bestScore}</span>,
                  },
                  { label: 'Flocons', value: `❄ ${flakesShort(row.snowflakes)}` },
                ]}
              />
            ))}
          </section>

          {/* -------- Écran large : le tableau complet -------------------- */}
          <section className="glass hidden overflow-hidden md:block">
            <table className="grid-table">
              <thead>
                <tr>
                  <th className="w-14">#</th>
                  <th>Joueur</th>
                  <th className="text-right">Points</th>
                  <th className="text-right">Games</th>
                  <th className="text-right">Moy.</th>
                  <th className="text-right">Kills</th>
                  <th className="text-center">Top 1/2/3</th>
                  <th className="text-right">Meilleure</th>
                  <th className="text-center">Collection</th>
                  <th className="text-right">❄</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row) => (
                  <tr key={row.id} className={row.finalist ? 'finalist' : undefined}>
                    <td className="font-display text-lg font-black text-muted">
                      {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
                    </td>
                    <td>
                      <PlayerName row={row} />
                    </td>
                    <td className="num text-right font-display text-xl font-black text-ice">
                      {row.totals.totalScore}
                    </td>
                    <td className="num text-right text-muted">{row.totals.countedGames}</td>
                    <td className="num text-right text-muted">{row.totals.averageScore}</td>
                    <td className="num text-right text-muted">{row.totals.totalKills}</td>
                    <td className="num text-center">
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
                    <td className="text-center">
                      <ThemeDots row={row} />
                    </td>
                    <td className="num text-right text-muted">{flakesShort(row.snowflakes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <p className="px-1 text-[13px] leading-relaxed text-faint">
        Égalité départagée par le nombre de Top 1, puis les kills, puis la meilleure game. Liseré
        doré : places qualificatives. Pastilles de collection pleines à 6/6, estompées à 4/6.
      </p>
    </div>
  );
}
