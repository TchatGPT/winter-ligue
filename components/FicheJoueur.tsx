import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { CouronneGlace } from '@/components/CouronneGlace';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { IconCadeau, IconLayers, IconSnowflake, IconSwords, IconTrophy, IconTwitch } from '@/components/icons';
import { flakes } from '@/components/ui';
import { getCard } from '@/lib/domain/catalog';
import { CHANCE, ECONOMY, libelleMultiplicateur, PACKS_REGLES } from '@/lib/domain/rules';
import type { BilanSubs } from '@/lib/domain/twitchSubs';
import { decimal, shortDateTime } from '@/lib/format';
import type { FicheJoueur as DonneesFiche } from '@/lib/services/profile';

/** « 1er », « 2e », « 3e »… */
const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

const signe = (n: number) => (n > 0 ? `+${flakes(n)}` : n < 0 ? `−${flakes(-n)}` : '0');

/** Les games montrées d'emblée ; la suite se déplie. */
const GAMES_VISIBLES = 6;

/** La couronne, une médaille, ou le rang dans un disque de glace. */
function Rang({ position, id, className }: { position: number; id: string; className: string }) {
  if (position === 1) return <CouronneGlace className={className} id={`couronne-${id}`} />;
  if (position === 2 || position === 3)
    return <MedailleGlace rang={position} className={className} id={`medaille-${id}`} />;
  return <span className="profil-rang-chiffre">{position}</span>;
}

/** Une plaque de la fiche : sa neige, son icône, son titre, et ce qu'elle montre. */
function Plaque({
  id,
  graine,
  icone,
  eyebrow,
  titre,
  droite,
  className = '',
  children,
}: {
  id: string;
  graine: string;
  icone: ReactNode;
  eyebrow: string;
  titre: string;
  droite?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`glass profil-plaque ${className}`} aria-labelledby={id}>
      <SnowCap radius="var(--r-lg)" seed={graine} epaisseur={14} />
      <header className="profil-plaque-tete">
        <span className="profil-plaque-icone" aria-hidden="true">
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{titre}</h2>
        </div>
        {droite}
      </header>
      {children}
    </section>
  );
}

/**
 * La fiche d'un joueur.
 *
 * En tête, une plaque de verre éclairée par l'aurore : qui il est, où il en
 * est — sa couronne ou sa médaille, ses points, son rang, sa moyenne — et sa
 * saison en cinq chiffres, subs offerts compris. Puis trois colonnes : ses
 * games (la courbe de sa saison, et chaque game), ses duels et ses subs, ses
 * flocons et ses cartes. Une colonne sur un téléphone.
 *
 * Le grand livre n'est pas montré : la fiche est publique, `getFicheJoueur`
 * le retire côté serveur.
 */
export function FicheJoueur({ fiche, subs }: { fiche: DonneesFiche; subs: BilanSubs }) {
  const { profil: p, rang, duels } = fiche;
  const t = p.totals;
  const aJoue = t.countedGames > 0;
  const classe = rang !== null && aJoue;

  const surtitre = fiche.streameuse
    ? 'Streameuse · hors classement'
    : !classe
      ? 'Pas encore de game cette saison'
      : rang.finaliste
        ? `${ordinal(rang.position)} au classement · qualifié pour la finale${
            rang.ecart !== null && rang.ecart > 0 ? ` · ${rang.ecart} pts d’avance` : ''
          }`
        : `${ordinal(rang.position)} au classement · à ${rang.ecart ?? 0} pts de la finale`;

  // Les games dans l'ordre où elles ont été jouées, numérotées.
  const chronologie = [...p.games].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const numeroDe = new Map(chronologie.map((g, i) => [g.id, i + 1]));
  const recentes = [...chronologie].reverse();
  const meilleure = Math.max(1, ...chronologie.map((g) => g.score));
  const restantes = Math.max(0, fiche.creneaux - t.countedGames);
  const boostersPerso = p.packsDus.filter((b) => b.pack === 'perso').length;

  const ligneGame = (g: (typeof recentes)[number]) => (
    <li
      key={g.id}
      className="profil-game"
      data-passee={g.skipped ? '' : undefined}
      data-top={g.placement !== null && g.placement <= 3 ? g.placement : undefined}
      style={{ ['--part' as string]: Math.max(0.04, g.score / meilleure) } as CSSProperties}
    >
      <span className="profil-game-numero">#{numeroDe.get(g.id)}</span>
      <span
        className="profil-game-top"
        aria-label={g.placement !== null && g.placement <= 3 ? `Top ${g.placement}` : 'Hors top 3'}
      >
        {g.placement !== null && g.placement <= 3 ? (
          <Rang position={g.placement} id={`game-${g.id}`} className="h-7 w-7" />
        ) : (
          <span className="profil-game-hors">—</span>
        )}
      </span>
      <div className="profil-game-corps">
        <p>
          <strong>{g.kills}</strong> kill{g.kills > 1 ? 's' : ''}
          {g.placement !== null && g.placement <= 3 && <span className="profil-game-place">Top {g.placement}</span>}
          {g.skipped && <span className="profil-game-passee">passée</span>}
        </p>
        {g.applied.length > 0 && (
          <p className="profil-game-cartes">
            {g.applied.map((effet, i) => {
              const carte = getCard(effet.cardId);
              if (!carte) return null;
              return (
                <span key={`${effet.cardId}-${i}`} data-malus={effet.points < 0 ? '' : undefined}>
                  {carte.name}
                  <b>
                    {effet.points > 0 ? '+' : ''}
                    {effet.points}
                  </b>
                </span>
              );
            })}
          </p>
        )}
        <small>{shortDateTime(g.playedAt)}</small>
      </div>
      <div className="profil-game-score">
        <strong>{g.score}</strong>
        <small>pts</small>
      </div>
      <i className="profil-game-barre" aria-hidden="true" />
    </li>
  );

  return (
    <div className="profil">
      {/* =============================== L'en-tête ============================== */}
      <section className="glass profil-hero" aria-labelledby="profil-nom">
        <SnowCap radius="var(--r-lg)" seed={`profil-${p.slug}`} epaisseur={20} />
        <span className="profil-hero-lumiere" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>

        <div className="profil-identite">
          <div className="profil-avatar">
            {p.avatarUrl ? (
              // L'avatar Twitch : une image externe, déjà autorisée par la CSP.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.avatarUrl} alt="" />
            ) : (
              <span aria-hidden="true">{p.pseudo.slice(0, 2).toUpperCase()}</span>
            )}
            {classe && (
              <span className="profil-avatar-rang" aria-hidden="true">
                <Rang position={rang.position} id="avatar" className="h-full w-full" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="eyebrow">{surtitre}</p>
            <h1 id="profil-nom" className="titre-glace profil-nom">
              <span className="glace" data-text={p.pseudo}>
                {p.pseudo}
              </span>
            </h1>
            <div className="profil-badges">
              {fiche.role !== 'joueur' && !fiche.streameuse && <span className="profil-badge">Modération</span>}
              {p.twitchLogin && (
                <a
                  href={`https://www.twitch.tv/${p.twitchLogin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profil-badge profil-badge-twitch no-underline"
                >
                  <IconTwitch className="h-3.5 w-3.5" /> {p.twitchLogin}
                </a>
              )}
              <Link href="/" className="profil-badge no-underline">
                ← Classement
              </Link>
            </div>
          </div>
        </div>

        {/* Les trois chiffres qu'on vient chercher, taillés dans la glace. */}
        <dl className="profil-trio">
          <div>
            <dt>Points</dt>
            <dd>
              <span className="glace" data-text={String(t.totalScore)}>
                {t.totalScore}
              </span>
            </dd>
          </div>
          <div>
            <dt>Rang</dt>
            <dd>
              {classe ? (
                <>
                  <span className="glace" data-text={String(rang.position)}>
                    {rang.position}
                  </span>
                  <small>/{rang.sur}</small>
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Moyenne</dt>
            <dd>
              {aJoue ? (
                <span className="glace" data-text={decimal(t.averageScore)}>
                  {decimal(t.averageScore)}
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {/* Sa saison en cinq chiffres. */}
        <ul className="profil-saison" aria-label="Sa saison en chiffres">
          <li>
            <span>Games</span>
            <b>
              {t.countedGames}
              <small>/{fiche.creneaux}</small>
            </b>
            <i className="profil-jauge" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (t.countedGames / Math.max(1, fiche.creneaux)) * 100)}%` }} />
            </i>
            <em>{restantes > 0 ? `${restantes} à jouer` : 'toutes jouées'}</em>
          </li>
          <li>
            <span>Kills</span>
            <b>{t.totalKills}</b>
            <em>
              {aJoue ? `${decimal(Math.round((t.totalKills / t.countedGames) * 10) / 10)} par game` : 'aucune game'}
            </em>
          </li>
          <li>
            <span>Podiums</span>
            <div className="profil-podiums">
              {([1, 2, 3] as const).map((n) => (
                <span key={n}>
                  <Rang position={n} id={`podium-${n}`} className="h-6 w-6" />
                  <b>{n === 1 ? t.top1 : n === 2 ? t.top2 : t.top3}</b>
                </span>
              ))}
            </div>
            <em>Top 1, 2 et 3</em>
          </li>
          <li>
            <span>Meilleure game</span>
            <b>{aJoue ? t.bestScore : '—'}</b>
            <em>{aJoue ? `la moins bonne : ${t.worstScore}` : 'aucune game'}</em>
          </li>
          <li>
            <span>Subs offerts</span>
            <b>{subs.offerts}</b>
            <em>{subs.niveau3 > 0 ? `${subs.niveau3} en T3` : 'à la chaîne'}</em>
          </li>
        </ul>
      </section>

      <div className="profil-grille">
        {/* =========================== Ses games =========================== */}
        <Plaque
          id="profil-games"
          graine={`profil-games-${p.slug}`}
          icone={<IconTrophy className="h-5 w-5" />}
          eyebrow="Sa saison, game par game"
          titre="Ses games"
          className="profil-games"
          droite={
            aJoue ? (
              <p className="profil-plaque-chiffre">
                {t.countedGames}
                <small>/{fiche.creneaux}</small>
              </p>
            ) : undefined
          }
        >
          {p.games.length === 0 ? (
            <p className="profil-vide">
              Aucune game saisie pour l’instant. Elles arrivent ici dès la première capture.
            </p>
          ) : (
            <>
              {/* La courbe : une barre par game, dans l'ordre, à la couleur de son
                  classement ; la moyenne en pointillés. */}
              <figure className="profil-courbe">
                <div
                  className="profil-courbe-barres"
                  style={{ ['--moyenne' as string]: t.averageScore / meilleure } as CSSProperties}
                  role="img"
                  aria-label={`Ses ${chronologie.length} games, de la première à la dernière : ${chronologie.map((g) => g.score).join(', ')} points.`}
                >
                  {chronologie.map((g) => (
                    <span
                      key={g.id}
                      title={`#${numeroDe.get(g.id)} · ${g.score} pts · ${g.kills} kills${g.placement && g.placement <= 3 ? ` · Top ${g.placement}` : ''}`}
                      data-top={g.placement !== null && g.placement <= 3 ? g.placement : undefined}
                      data-passee={g.skipped ? '' : undefined}
                      style={{ ['--part' as string]: Math.max(0.03, g.score / meilleure) } as CSSProperties}
                    />
                  ))}
                  <i className="profil-courbe-moyenne" aria-hidden="true" />
                </div>
                <figcaption>
                  <span>
                    <i data-legende="1" /> Top 1
                  </span>
                  <span>
                    <i data-legende="2" /> Top 2
                  </span>
                  <span>
                    <i data-legende="3" /> Top 3
                  </span>
                  <span>
                    <i data-legende="moyenne" /> Moyenne {decimal(t.averageScore)}
                  </span>
                </figcaption>
              </figure>

              <ol className="profil-liste-games">{recentes.slice(0, GAMES_VISIBLES).map(ligneGame)}</ol>
              {recentes.length > GAMES_VISIBLES && (
                <details className="profil-plus">
                  <summary>Voir les {recentes.length - GAMES_VISIBLES} games plus anciennes</summary>
                  <ol className="profil-liste-games">{recentes.slice(GAMES_VISIBLES).map(ligneGame)}</ol>
                </details>
              )}
            </>
          )}
        </Plaque>

        <div className="profil-colonne">
          {/* =============================== Les duels =============================== */}
          <Plaque
            id="profil-duels"
            graine={`profil-duels-${p.slug}`}
            icone={<IconSwords className="h-5 w-5" />}
            eyebrow="Ses flocons en jeu"
            titre="Duels"
          >
            {duels.joues === 0 ? (
              <p className="profil-vide">Aucun duel joué pour l’instant.</p>
            ) : (
              <>
                <dl className="profil-triplet">
                  <div>
                    <dt>Joués</dt>
                    <dd>{duels.joues}</dd>
                  </div>
                  <div>
                    <dt>Gagnés</dt>
                    <dd>
                      {duels.gagnes}
                      <small> · {Math.round((duels.gagnes / duels.joues) * 100)} %</small>
                    </dd>
                  </div>
                  <div data-signe={duels.net > 0 ? 'plus' : duels.net < 0 ? 'moins' : undefined}>
                    <dt>Bilan</dt>
                    <dd>
                      {signe(duels.net)} <span className="text-ice">❄</span>
                    </dd>
                  </div>
                </dl>
                <ul className="profil-duels">
                  {duels.derniers.map((d) => (
                    <li key={d.id} data-gagne={d.gagne ? '' : undefined}>
                      <span className="orbe orbe-sm" aria-hidden="true">
                        {d.adversaire.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b>{d.gagne ? 'Gagné' : 'Perdu'}</b> contre {d.adversaire}
                        <small>{shortDateTime(d.resolueA)}</small>
                      </span>
                      <strong>
                        {d.gagne ? '+' : '−'}
                        {flakes(d.mise)} ❄
                      </strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Plaque>

          {/* =============================== Ses subs =============================== */}
          <Plaque
            id="profil-subs"
            graine={`profil-subs-${p.slug}`}
            icone={<IconCadeau className="h-5 w-5" />}
            eyebrow="Son soutien à la chaîne"
            titre="Subs et Boosters Perso"
          >
            <dl className="profil-triplet">
              <div>
                <dt>Subs offerts</dt>
                <dd>{subs.offerts}</dd>
              </div>
              <div>
                <dt>Subs T3</dt>
                <dd>{subs.niveau3}</dd>
              </div>
              <div data-signe={boostersPerso > 0 ? 'plus' : undefined}>
                <dt>Boosters Perso</dt>
                <dd>{boostersPerso}</dd>
              </div>
            </dl>
            <p className="profil-note">
              Un Booster Perso par sub T3, et un tous les {PACKS_REGLES.persoTousLes} subs offerts : versé d’office à
              qui paie, ouvert à l’antenne. Compté depuis que la chaîne annonce ses subs au site.
            </p>
          </Plaque>
        </div>

        <div className="profil-colonne">
          {/* =============================== Les flocons ============================== */}
          <Plaque
            id="profil-flocons"
            graine={`profil-flocons-${p.slug}`}
            icone={<IconSnowflake className="h-5 w-5" />}
            eyebrow="Sa monnaie"
            titre="Flocons"
            droite={
              <p className="profil-plaque-chiffre">
                {flakes(p.snowflakes)} <span className="text-ice">❄</span>
              </p>
            }
          >
            <div className="profil-chance">
              <div className="profil-chance-tete">
                <span>Chance aux boosters</span>
                <strong>{libelleMultiplicateur(p.chance)}</strong>
              </div>
              <div className="jauge-chance" aria-hidden="true">
                <span style={{ width: `${(p.chance / CHANCE.max) * 100}%` }} />
              </div>
              <p className="profil-note">
                {flakes(p.snowflakes)} sur {flakes(ECONOMY.soldeMax)} ❄ : son solde pousse les raretés des boosters
                ouverts pour lui, jusqu’à ×{1 + CHANCE.max}.
              </p>
            </div>
            {p.packsDus.length > 0 && (
              <div className="profil-a-ouvrir">
                <span>À ouvrir</span>
                <ul>
                  {p.packsDus.map((b) => (
                    <li key={b.id} className="profil-badge" title={b.raison}>
                      Booster {b.pack}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Plaque>

          {/* =============================== Les cartes =============================== */}
          <Plaque
            id="profil-cartes"
            graine={`profil-cartes-${p.slug}`}
            icone={<IconLayers className="h-5 w-5" />}
            eyebrow="Les dernières reçues"
            titre="Ses cartes"
          >
            {p.ouvertures.length === 0 ? (
              <p className="profil-vide">Aucune carte reçue pour l’instant.</p>
            ) : (
              <ul className="profil-cartes">
                {p.ouvertures.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <span className="profil-carte">
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
          </Plaque>
        </div>
      </div>
    </div>
  );
}
