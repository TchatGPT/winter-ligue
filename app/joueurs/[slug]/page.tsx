import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigeSession } from '@/lib/auth/acces';
import { CardTile, EmptyState, StatTile, flakes, rarityMeta } from '@/components/ui';
import { getCard } from '@/lib/domain/catalog';
import { ECONOMY, libelleMultiplicateur, PACKS_REGLES } from '@/lib/domain/rules';
import { getPublicProfile } from '@/lib/services/profile';
import { shortDateTime } from '@/lib/format';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  return { title: profile ? profile.pseudo : 'Joueur inconnu' };
}

/**
 * Profil public.
 *
 * Ce qui attend sa prochaine game, ce qui lui est dû, ce qu'il a reçu, et ses
 * games. Le grand livre n'est pas montré : `getPublicProfile` le retire côté
 * serveur.
 */
export default async function ProfilJoueurPage({ params }: { params: Promise<{ slug: string }> }){
  await exigeSession();
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <nav className="text-xs text-faint">
        <Link href="/" className="text-muted no-underline hover:text-ice">
          Classement
        </Link>{' '}
        / {profile.pseudo}
      </nav>

      <header className="glass flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 font-display text-xl font-black text-ice">
          {profile.pseudo.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <TitreGlace taille="bloc" niveau={1}>
            {profile.pseudo}
          </TitreGlace>
          <p className="mt-1 text-[13px] text-muted">
            <span className="num">❄ {flakes(profile.snowflakes)}</span>
            <span className="text-faint"> / {flakes(ECONOMY.soldeMax)}</span> · chance{' '}
            <span className="num text-aurora">{libelleMultiplicateur(profile.chance)}</span> ·{' '}
            {profile.subsOfferts} sub{profile.subsOfferts > 1 ? 's' : ''} offert
            {profile.subsOfferts > 1 ? 's' : ''}, prochain Booster Perso dans {profile.subsAvantPack}
          </p>
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
          accent="ink"
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

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr] xl:items-start">
        <section>
          <TitreGlace taille="bloc" className="mb-3">
            Historique des games
          </TitreGlace>
          {profile.games.length === 0 ? (
            <EmptyState title="Aucune game enregistrée" />
          ) : (
            <div className="glass scroll-x">
              <table className="grid-table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Kills</th>
                    <th className="text-center">Top</th>
                    <th className="text-right">Cartes</th>
                    <th className="text-right">Score</th>
                    <th>Détail</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.games.map((game) => (
                    <tr key={game.id} className={game.skipped ? 'opacity-45' : undefined}>
                      <td className="text-xs text-faint">
                        {shortDateTime(game.playedAt)}
                        {game.skipped && <span className="ml-1 text-[13px] uppercase">passée</span>}
                      </td>
                      <td className="num text-right text-ink">{game.kills}</td>
                      <td className="num text-center text-gold">{game.placement ?? '—'}</td>
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
                        {game.applied.length === 0 ? (
                          <span className="text-faint">—</span>
                        ) : (
                          <span className="flex flex-wrap gap-1.5">
                            {game.applied.map((effect, i) => {
                              const card = getCard(effect.cardId);
                              if (!card) return null;
                              return (
                                <span
                                  key={`${effect.cardId}-${i}`}
                                  title={`${card.name} : ${effect.points > 0 ? '+' : ''}${effect.points} pts`}
                                  className={effect.points < 0 ? 'text-danger' : 'text-muted'}
                                >
                                  {card.glyph}
                                  <span className="num ml-0.5 text-[11px]">
                                    {effect.points > 0 ? '+' : ''}
                                    {effect.points}
                                  </span>
                                </span>
                              );
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

        <div className="space-y-6">
          <section>
            <TitreGlace taille="bloc" className="mb-3">
              Cartes en attente
            </TitreGlace>
            <p className="-mt-2 mb-3 text-[13px] text-faint">
              Une seule carte tombe par game. Les suivantes attendent leur tour, une par game. Une
              carte qui relève une game déjà jouée tombe dès qu’il y a deux games, dont une sans carte.
            </p>
            {profile.cartesEnAttente.length === 0 ? (
              <EmptyState
                title="Aucune carte en attente"
                hint={`Un Booster Perso tous les ${PACKS_REGLES.persoTousLes} subs offerts, et les boosters de la ligue.`}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {profile.cartesEnAttente.map((c) => {
                  // Le tour d'une carte se compte parmi celles qui attendent une
                  // prochaine game : les autres ne passent devant personne.
                  const tour =
                    c.moment === 'PROCHAINE'
                      ? profile.cartesEnAttente
                          .filter((x) => x.moment === 'PROCHAINE')
                          .findIndex((x) => x.id === c.id)
                      : -1;
                  return (
                    <CardTile
                      key={c.id}
                      cardId={c.cardId}
                      name={c.nom}
                      description={c.description}
                      rarity={c.rarity}
                      glyph={c.glyph}
                      power={c.power}
                      nature={c.nature}
                      dimmed={tour > 0}
                      footer={
                        <span className="text-[11px] text-faint">
                          {tour === 0 ? (
                            <strong className="text-aurora">Active</strong>
                          ) : tour > 0 ? (
                            `En réserve, game +${tour + 1}`
                          ) : (
                            'Attend une game à relever'
                          )}{' '}
                          · {c.pack}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          {profile.packsDus.length > 0 && (
            <section>
              <TitreGlace taille="bloc" className="mb-3">
                Boosters à ouvrir
              </TitreGlace>
              <ul className="glass divide-y divide-white/8">
                {profile.packsDus.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                    <span className="font-display font-bold text-ink capitalize">Booster {p.pack}</span>
                    <span className="text-xs text-faint">{p.raison}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <TitreGlace taille="bloc" className="mb-3">
              Dernières cartes reçues
            </TitreGlace>
            {profile.ouvertures.length === 0 ? (
              <EmptyState title="Rien encore" />
            ) : (
              <ul className="glass divide-y divide-white/8">
                {profile.ouvertures.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[14px]">
                    <span className="text-xs whitespace-nowrap text-faint">
                      {shortDateTime(o.openedAt)}
                    </span>
                    <span className="text-muted">{o.pack}</span>
                    <span className="font-display font-bold" style={{ color: rarityMeta(o.rarity).color }}>
                      {o.glyph} {o.nom}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
