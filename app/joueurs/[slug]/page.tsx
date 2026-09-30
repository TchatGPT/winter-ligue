import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardFrame } from '@/components/CardFrame';
import { SaisonEnCases, type CaseGame } from '@/components/SaisonEnCases';
import { SnowCap } from '@/components/SnowCap';
import { IconTwitch } from '@/components/icons';
import { flakes } from '@/components/ui';
import { exigeSession } from '@/lib/auth/acces';
import { getCard } from '@/lib/domain/catalog';
import { ECONOMY, libelleMultiplicateur, PACKS_REGLES } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';
import { getFicheJoueur, getPublicProfile } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug);
  return { title: profile ? profile.pseudo : 'Joueur inconnu' };
}

/** « 1er », « 2e », « 3e »… */
const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

const signe = (n: number) => (n > 0 ? `+${flakes(n)}` : n < 0 ? `−${flakes(-n)}` : '0');

/**
 * La fiche d'un joueur.
 *
 * En tête, qui il est et où il en est : son rang, sa qualification pour la
 * finale, ses points. Une bande de chiffres, puis deux colonnes : à gauche sa
 * saison game par game, en graphique puis en liste ; à droite ce qu'il a en
 * main — ses flocons, ses cartes, ses duels. Chaque titre est dans sa plaque :
 * rien n'est posé à même la photo.
 *
 * Le grand livre n'est pas montré : la fiche est publique, `getFicheJoueur`
 * le retire côté serveur.
 */
export default async function FicheJoueurPage({ params }: { params: Promise<{ slug: string }> }) {
  await exigeSession();
  const { slug } = await params;
  const fiche = await getFicheJoueur(slug);
  if (!fiche) notFound();

  const { profil: p, rang, duels } = fiche;
  const t = p.totals;
  const aJoue = t.countedGames > 0;

  const surtitre = fiche.streameuse
    ? 'Streameuse · hors classement'
    : !rang || !aJoue
      ? 'Pas encore de game cette saison'
      : rang.finaliste
        ? `${ordinal(rang.position)} au classement · qualifié pour la finale${
            rang.ecart !== null && rang.ecart > 0 ? ` · ${rang.ecart} pts d’avance` : ''
          }`
        : `${ordinal(rang.position)} au classement · à ${rang.ecart ?? 0} pts de la finale`;

  // Les games dans l'ordre où elles ont été jouées, numérotées pour les cases.
  const chronologie = [...p.games].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const numeroDe = new Map(chronologie.map((g, i) => [g.id, i + 1]));
  const points: CaseGame[] = chronologie.map((g, i) => ({
    numero: i + 1,
    date: shortDateTime(g.playedAt),
    kills: g.kills,
    placement: g.placement,
    cartes: g.bonusPoints,
    score: g.score,
    passee: g.skipped,
  }));
  const recentes = [...chronologie].reverse();

  const restantes = Math.max(0, fiche.creneaux - t.countedGames);
  const subsDansLeCycle = PACKS_REGLES.persoTousLes - p.subsAvantPack;

  return (
    <div className="space-y-5">
      {/* =============================== L'en-tête ============================== */}
      <section className="glass fiche-hero relative overflow-hidden">
        <SnowCap radius="var(--r-lg)" seed={`fiche-${p.slug}`} epaisseur={18} />

        <div className="fiche-identite relative">
          <div className="fiche-avatar">
            {p.avatarUrl ? (
              // L'avatar Twitch : une image externe, déjà autorisée par la CSP.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" />
            ) : (
              <span aria-hidden="true">{p.pseudo.slice(0, 2).toUpperCase()}</span>
            )}
            {rang && aJoue && (
              <span className="fiche-medaille medaille" data-rang={rang.position <= 3 ? rang.position : undefined}>
                {rang.position}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="eyebrow">{surtitre}</p>
            <h1 className="titre-glace titre-glace-page mt-1.5">
              <span className="glace" data-text={p.pseudo}>
                {p.pseudo}
              </span>
            </h1>
            <div className="fiche-badges">
              {fiche.role !== 'joueur' && !fiche.streameuse && (
                <span className="fiche-badge">Modération</span>
              )}
              {p.twitchLogin && (
                <a
                  href={`https://www.twitch.tv/${p.twitchLogin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fiche-badge fiche-twitch no-underline"
                >
                  <IconTwitch className="h-3.5 w-3.5" /> twitch.tv/{p.twitchLogin}
                </a>
              )}
              <Link href="/" className="fiche-badge no-underline">
                ← Classement
              </Link>
            </div>
          </div>
        </div>

        {/* Les trois chiffres qu'on vient chercher. */}
        <dl className="fiche-chiffres relative">
          <div>
            <dt>Points</dt>
            <dd>{t.totalScore}</dd>
          </div>
          <div>
            <dt>Rang</dt>
            <dd>
              {rang && aJoue ? (
                <>
                  {rang.position}
                  <small> / {rang.sur}</small>
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Moyenne</dt>
            <dd>{aJoue ? t.averageScore : '—'}</dd>
          </div>
        </dl>
      </section>

      {/* =============================== Les chiffres =========================== */}
      <section className="fiche-stats" aria-label="Sa saison en chiffres">
        <div className="glass glass-soft fiche-stat">
          <span>Games jouées</span>
          <strong>
            {t.countedGames}
            <small> / {fiche.creneaux}</small>
          </strong>
          <i className="fiche-barre" aria-hidden="true">
            <b style={{ width: `${Math.min(100, (t.countedGames / Math.max(1, fiche.creneaux)) * 100)}%` }} />
          </i>
          <em>{restantes > 0 ? `${restantes} encore à jouer` : 'toutes jouées'}</em>
        </div>
        <div className="glass glass-soft fiche-stat">
          <span>Kills</span>
          <strong>{t.totalKills}</strong>
          <em>{aJoue ? `${Math.round((t.totalKills / t.countedGames) * 10) / 10} par game` : 'aucune game'}</em>
        </div>
        <div className="glass glass-soft fiche-stat">
          <span>Podiums</span>
          <div className="fiche-podiums">
            {([1, 2, 3] as const).map((n) => (
              <span key={n}>
                <b className="medaille" data-rang={n}>
                  {n}
                </b>
                ×{n === 1 ? t.top1 : n === 2 ? t.top2 : t.top3}
              </span>
            ))}
          </div>
          <em>Top 1, Top 2, Top 3</em>
        </div>
        <div className="glass glass-soft fiche-stat">
          <span>Meilleure game</span>
          <strong>{aJoue ? t.bestScore : '—'}</strong>
          <em>{aJoue ? `la moins bonne : ${t.worstScore}` : 'aucune game'}</em>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          {/* =========================== Sa saison, game par game =========================== */}
          <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="fiche-games">
            <SnowCap radius="var(--r-lg)" seed={`fiche-games-${p.slug}`} epaisseur={14} />
            <header className="relative">
              <p className="eyebrow">Sa saison, game par game</p>
              <h2 id="fiche-games" className="fiche-titre">
                Historique des games
              </h2>
            </header>

            {p.games.length === 0 ? (
              <p className="fil-vide mt-4 text-[14px] text-muted">Aucune game saisie pour l’instant.</p>
            ) : (
              <>
                <SaisonEnCases games={points} creneaux={fiche.creneaux} />

                <ol className="fiche-games">
                  {recentes.map((g) => (
                    <li key={g.id} className="fiche-game" data-passee={g.skipped ? '' : undefined}>
                      <span className="fiche-game-numero">#{numeroDe.get(g.id)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="fiche-game-ligne">
                          {g.placement !== null && g.placement <= 3 ? (
                            <span className="fiche-top">
                              <b className="medaille" data-rang={g.placement}>
                                {g.placement}
                              </b>
                              Top {g.placement}
                            </span>
                          ) : (
                            <span className="fiche-top fiche-top-aucun">Hors top 3</span>
                          )}
                          <span>
                            <strong>{g.kills}</strong> kills
                          </span>
                          {g.skipped && <span className="fiche-passee">passée</span>}
                        </p>
                        <p className="fiche-game-date">{shortDateTime(g.playedAt)}</p>
                        {g.applied.length > 0 && (
                          <p className="fiche-game-cartes">
                            {g.applied.map((effet, i) => {
                              const carte = getCard(effet.cardId);
                              if (!carte) return null;
                              return (
                                <span key={`${effet.cardId}-${i}`} data-malus={effet.points < 0 ? '' : undefined}>
                                  {carte.glyph} {carte.name}
                                  <b>
                                    {effet.points > 0 ? '+' : ''}
                                    {effet.points}
                                  </b>
                                </span>
                              );
                            })}
                          </p>
                        )}
                      </div>
                      <div className="fiche-game-score">
                        <strong>{g.score}</strong>
                        <small>pts</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>

          {/* =============================== Les duels =============================== */}
          <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="fiche-duels">
            <SnowCap radius="var(--r-lg)" seed={`fiche-duels-${p.slug}`} epaisseur={14} />
            <header className="relative">
              <p className="eyebrow">Duels de flocons</p>
              <h2 id="fiche-duels" className="fiche-titre">
                Duels
              </h2>
            </header>

            {duels.joues === 0 ? (
              <p className="mt-3 text-[13.5px] text-muted">Aucun duel joué pour l’instant.</p>
            ) : (
              <>
                <dl className="fiche-duels-chiffres">
                  <div>
                    <dt>Joués</dt>
                    <dd>{duels.joues}</dd>
                  </div>
                  <div>
                    <dt>Gagnés</dt>
                    <dd>{duels.gagnes}</dd>
                  </div>
                  <div>
                    <dt>Bilan</dt>
                    <dd className={duels.net >= 0 ? 'text-aurora' : 'text-ink'}>
                      {signe(duels.net)} <span className="text-ice">❄</span>
                    </dd>
                  </div>
                </dl>
                <ul className="fiche-duels">
                  {duels.derniers.map((d) => (
                    <li key={d.id} data-gagne={d.gagne ? '' : undefined}>
                      <span>
                        <b>{d.gagne ? 'Gagné' : 'Perdu'}</b> contre {d.adversaire}
                      </span>
                      <span className="tabular-nums">
                        {d.gagne ? '+' : '−'}
                        {flakes(d.mise)} ❄
                      </span>
                      <small>{shortDateTime(d.resolueA)}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <div className="grid gap-5">
          {/* =============================== Les flocons ============================== */}
          <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="fiche-flocons">
            <SnowCap radius="var(--r-lg)" seed={`fiche-flocons-${p.slug}`} epaisseur={14} />
            <header className="relative flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Sa monnaie</p>
                <h2 id="fiche-flocons" className="fiche-titre">
                  Flocons
                </h2>
              </div>
              <p className="fiche-solde">
                {flakes(p.snowflakes)} <span className="text-ice">❄</span>
                <small> / {flakes(ECONOMY.soldeMax)}</small>
              </p>
            </header>

            <div className="fiche-bloc mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="fiche-bloc-titre">Chance aux boosters</span>
                <strong className="font-display text-2xl leading-none font-black text-ice">
                  {libelleMultiplicateur(p.chance)}
                </strong>
              </div>
              <div className="jauge-chance mt-2.5" aria-hidden="true">
                <span style={{ width: `${p.chance * 100}%` }} />
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Son solde pousse les raretés des boosters ouverts pour lui, jusqu’à ×2,00 à{' '}
                {flakes(ECONOMY.soldeMax)} ❄.
              </p>
            </div>

            <div className="fiche-bloc mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="fiche-bloc-titre">Subs offerts</span>
                <strong className="font-display text-2xl leading-none font-black text-ink">{p.subsOfferts}</strong>
              </div>
              <div className="fiche-subs" aria-hidden="true">
                {Array.from({ length: PACKS_REGLES.persoTousLes }, (_, i) => (
                  <i key={i} data-plein={i < subsDansLeCycle ? '' : undefined} />
                ))}
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Prochain Booster Perso dans {p.subsAvantPack} sub{p.subsAvantPack > 1 ? 's' : ''}. Seuls
                comptent les cadeaux groupés d’au moins {PACKS_REGLES.cadeauMinTwitch} subs.
              </p>
            </div>

            {p.packsDus.length > 0 && (
              <div className="fiche-bloc mt-3">
                <span className="fiche-bloc-titre">Boosters à ouvrir</span>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {p.packsDus.map((b) => (
                    <li key={b.id} className="fiche-badge" title={b.raison}>
                      Booster {b.pack}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* =============================== Les cartes =============================== */}
          <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="fiche-cartes">
            <SnowCap radius="var(--r-lg)" seed={`fiche-cartes-${p.slug}`} epaisseur={14} />
            <header className="relative">
              <p className="eyebrow">Ses cartes</p>
              <h2 id="fiche-cartes" className="fiche-titre">
                Cartes
              </h2>
            </header>

            <h3 className="fiche-bloc-titre mt-4">En attente</h3>
            {p.cartesEnAttente.length === 0 ? (
              <p className="mt-1.5 text-[13.5px] text-muted">
                Aucune. Un Booster Perso tous les {PACKS_REGLES.persoTousLes} subs offerts ou pour un sub de
                niveau 3, et les boosters de la ligue.
              </p>
            ) : (
              <ul className="fiche-cartes">
                {p.cartesEnAttente.map((c) => {
                  // Le tour d'une carte se compte parmi celles qui attendent une
                  // prochaine game : les autres ne passent devant personne.
                  const tour =
                    c.moment === 'PROCHAINE'
                      ? p.cartesEnAttente.filter((x) => x.moment === 'PROCHAINE').findIndex((x) => x.id === c.id)
                      : -1;
                  return (
                    <li key={c.id}>
                      <span className="fiche-carte">
                        <CardFrame
                          cardId={c.cardId}
                          name={c.nom}
                          rarity={c.rarity}
                          glyph={c.glyph}
                          nature={c.nature}
                          dimmed={tour > 0}
                        />
                      </span>
                      <b>{c.action}</b>
                      <small>
                        {tour === 0 ? 'Active' : tour > 0 ? `En réserve, game +${tour + 1}` : 'Relève une game jouée'}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}

            <h3 className="fiche-bloc-titre mt-5">Dernières reçues</h3>
            {p.ouvertures.length === 0 ? (
              <p className="mt-1.5 text-[13.5px] text-muted">Aucune carte reçue pour l’instant.</p>
            ) : (
              <ul className="fiche-cartes">
                {p.ouvertures.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <span className="fiche-carte">
                      <CardFrame cardId={o.cardId} name={o.nom} rarity={o.rarity} glyph={o.glyph} nature={o.nature} />
                    </span>
                    <b>{o.nom}</b>
                    <small>
                      {o.pack} · {shortDateTime(o.openedAt)}
                    </small>
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
