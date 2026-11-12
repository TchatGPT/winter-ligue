'use client';

import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { CouronneGlace } from '@/components/CouronneGlace';
import { IconCrayon } from '@/components/icons';
import { MedailleGlace } from '@/components/MedailleGlace';
import { cardArt, cardVignettes, getCard } from '@/lib/domain/catalog';
import { decimal, shortDateTime } from '@/lib/format';
import type { FicheJoueur } from '@/lib/services/profile';

/**
 * La saison d'un joueur, game par game (refaite le 12/11/2026, dans le thème) :
 *
 *  - **les colonnes** : une par créneau de la saison — 38 en Mini Ligue, 65 en
 *    saison 2 —, des blocs de glace en relief pour les games jouées, un socle
 *    pour celles à venir. Le podium se lit à sa couronne et à ses médailles,
 *    une carte à un cristal sous la game, un Joker à un bloc vide. Deux
 *    moyennes, la sienne et celle de la ligue, nommées dans la marge. Le
 *    palier du Booster Finisseur est marqué ;
 *  - **la forme** : quatre chiffres de plus — les cinq dernières games, les
 *    kills par game, le taux de Top 10, ce que les cartes ont rapporté ;
 *  - **la grille** : une case par créneau, toujours la même taille, quelle que
 *    soit la saison ou le nombre de games jouées — rien à faire défiler, rien
 *    qui saute. Une case dit le score, le podium, la carte et ses points ;
 *  - **le détail** : la game choisie — dans les colonnes ou dans la grille —,
 *    sa carte en grand, ce qu'elle a fait, et pour la modération, « Corriger ».
 */

export type GameDuJoueur = FicheJoueur['profil']['games'][number];

/** Le podium d'une game : la couronne, une médaille, ou rien. */
function Podium({ place, id, className = 'h-4 w-4' }: { place: number | null; id: string; className?: string }) {
  if (place === 1) return <CouronneGlace className={className} id={`couronne-${id}`} />;
  if (place === 2 || place === 3) return <MedailleGlace rang={place} className={className} id={`medaille-${id}`} />;
  return null;
}

const podiumDe = (g: GameDuJoueur) => (!g.skipped && g.placement !== null && g.placement <= 3 ? g.placement : null);

/** Des graduations rondes : 0, 10, 20… jusqu'au-dessus de la meilleure game. */
function graduations(max: number): number[] {
  const pas = [5, 10, 20, 25, 50, 100].find((p) => max / p <= 4) ?? 100;
  const haut = Math.max(pas, Math.ceil(max / pas) * pas);
  return Array.from({ length: haut / pas + 1 }, (_, i) => i * pas);
}

const pts = (n: number) => `${n} pt${Math.abs(n) > 1 ? 's' : ''}`;
const signe = (n: number) => (n > 0 ? `+${decimal(n)}` : n < 0 ? `−${decimal(-n)}` : '±0');

/** Ce qu'une carte a fait sur la game, en court : « +15 », « −17 », « figée ». */
function effetCourt(cardId: string, points: number): string {
  const carte = getCard(cardId);
  if (carte?.effect.kind === 'fige_meilleure') return 'figée';
  if (carte?.effect.kind === 'supprime_pire') return 'supprimée';
  if (carte?.effect.kind === 'clone_kills' && points === 0) return 'kills clonés';
  if (points === 0) return '±0';
  return `${points > 0 ? '+' : '−'}${Math.abs(points)}`;
}

/** Les cartes d'une game, chacune avec ses points : celles posées dessus, et celles qui l'ont touchée. */
function cartesDe(g: GameDuJoueur): { cardId: string; points: number; resultat: string | null }[] {
  const points = new Map<string, number>();
  for (const a of g.applied) points.set(a.cardId, (points.get(a.cardId) ?? 0) + a.points);
  const vues = new Set<string>();
  const liste: { cardId: string; points: number; resultat: string | null }[] = [];
  for (const c of g.cartes) {
    if (vues.has(c.cardId)) continue;
    vues.add(c.cardId);
    liste.push({ cardId: c.cardId, points: points.get(c.cardId) ?? 0, resultat: c.resultat || null });
  }
  for (const [cardId, p] of points) if (!vues.has(cardId)) liste.push({ cardId, points: p, resultat: null });
  return liste;
}

/** La petite illustration d'une carte, pour une case. */
function Vignette({ cardId }: { cardId: string }) {
  const src = cardVignettes(cardId)?.petite ?? cardArt(cardId);
  if (!src) return <span className="case-vignette" data-vide="" aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element -- une vignette de 200 px, déjà dimensionnée
  return <img className="case-vignette" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
}

/* ================================ Les colonnes ================================ */

export function ColonnesSaison({
  chronologie,
  creneaux,
  palier,
  moyenne,
  moyenneLigue,
  choisie,
  onChoisit,
  garde,
}: {
  /** Les games, de la première à la dernière. */
  chronologie: GameDuJoueur[];
  /** Les créneaux de la saison : autant de colonnes. */
  creneaux: number;
  /** La game du Booster Finisseur. */
  palier: number;
  moyenne: number;
  /** La moyenne d'une game dans toute la ligue, à comparer. */
  moyenneLigue: number | null;
  choisie: string | null;
  onChoisit: (id: string) => void;
  /** Les games que le filtre garde ; les autres s'effacent. */
  garde: (g: GameDuJoueur) => boolean;
}) {
  const [survolee, setSurvolee] = useState<number | null>(null);
  const total = Math.max(creneaux, chronologie.length);
  const comptees = chronologie.filter((g) => !g.skipped);
  const echelle = graduations(Math.max(1, moyenneLigue ?? 0, ...chronologie.map((g) => g.score)));
  const haut = echelle[echelle.length - 1];
  const part = (score: number) => Math.max(0, Math.min(1, score / haut));

  // Les deux moyennes dans la marge : trop proches, leurs étiquettes s'écartent.
  const etiquettes = useMemo(() => {
    const perso = part(moyenne);
    const ligue = moyenneLigue !== null ? part(moyenneLigue) : null;
    if (ligue === null) return { perso, ligue };
    const ecart = 0.13;
    if (Math.abs(perso - ligue) >= ecart) return { perso, ligue };
    const milieu = (perso + ligue) / 2;
    const persoDessus = perso >= ligue;
    return {
      perso: milieu + (persoDessus ? ecart / 2 : -ecart / 2),
      ligue: milieu + (persoDessus ? -ecart / 2 : ecart / 2),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `part` ne dépend que de `haut`
  }, [moyenne, moyenneLigue, haut]);

  const forme = useMemo(() => {
    const cinq = comptees.slice(-5);
    const moyenneCinq = cinq.length ? cinq.reduce((s, g) => s + g.score, 0) / cinq.length : 0;
    const kills = comptees.length ? comptees.reduce((s, g) => s + g.kills, 0) / comptees.length : 0;
    const top10 = comptees.filter((g) => g.placement !== null && g.placement <= 10).length;
    const cartes = comptees.reduce((s, g) => s + g.applied.reduce((t, a) => t + a.points, 0), 0);
    const avecCarte = comptees.filter((g) => g.applied.length > 0).length;
    return { cinq: cinq.length, moyenneCinq, kills, top10, cartes, avecCarte };
  }, [comptees]);

  const g = survolee !== null ? (chronologie[survolee] ?? null) : null;
  const x = survolee !== null ? (survolee + 0.5) / total : 0;

  return (
    <div className="saison">
      <figure className="saison-graphe">
        <figcaption className="saison-titre">
          <span>Points par game</span>
          <span className="saison-legende" aria-hidden="true">
            <span>
              <CouronneGlace className="h-3.5 w-3.5" id="couronne-legende" /> Top 1
            </span>
            <span>
              <MedailleGlace rang={2} className="h-3.5 w-3.5" id="medaille-legende-2" />
              <MedailleGlace rang={3} className="h-3.5 w-3.5" id="medaille-legende-3" /> Top 2 · 3
            </span>
            <span>
              <i className="saison-cristal" /> carte jouée
            </span>
            <span>
              <i className="saison-creux" /> Joker
            </span>
          </span>
        </figcaption>

        <div className="saison-zone">
          <div className="saison-axe" aria-hidden="true">
            {echelle.map((v) => (
              <span key={v} style={{ ['--y' as string]: v / haut } as CSSProperties}>
                {v}
              </span>
            ))}
          </div>
          <div
            className="saison-colonnes"
            role="img"
            aria-label={`Ses ${chronologie.length} games sur ${total}, de la première à la dernière : ${chronologie
              .map((c) => (c.skipped ? 'Joker' : c.score))
              .join(', ')} points. Sa moyenne ${decimal(moyenne)}${
              moyenneLigue !== null ? `, celle de la ligue ${decimal(moyenneLigue)}` : ''
            }.`}
            onMouseLeave={() => setSurvolee(null)}
          >
            {echelle.map((v) => (
              <i key={v} className="saison-ligne" style={{ ['--y' as string]: v / haut } as CSSProperties} aria-hidden="true" />
            ))}
            {/* Le palier du Booster Finisseur : la suite se joue une game par session. */}
            {palier < total && (
              <i
                className="saison-palier"
                style={{ ['--x' as string]: palier / total } as CSSProperties}
                aria-hidden="true"
              >
                <span>Finisseur</span>
              </i>
            )}
            {Array.from({ length: total }, (_, i) => {
              const c = chronologie[i];
              if (!c) {
                return <span key={`vide-${i}`} className="saison-colonne" data-vide="" aria-hidden="true" />;
              }
              const place = podiumDe(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="saison-colonne"
                  data-survolee={survolee === i ? '' : undefined}
                  data-choisie={choisie === c.id ? '' : undefined}
                  data-joker={c.skipped ? '' : undefined}
                  data-eteinte={garde(c) ? undefined : ''}
                  data-podium={place ?? undefined}
                  onMouseEnter={() => setSurvolee(i)}
                  onFocus={() => setSurvolee(i)}
                  onBlur={() => setSurvolee(null)}
                  onClick={() => onChoisit(c.id)}
                  aria-label={`Game ${i + 1} : ${c.skipped ? 'Joker' : pts(c.score)}`}
                  style={{ ['--part' as string]: c.skipped ? 0 : part(c.score) } as CSSProperties}
                >
                  <span className="saison-bloc">
                    {place && (
                      <span className="saison-podium">
                        <Podium place={place} id={`saison-${c.id}`} className="h-full w-full" />
                      </span>
                    )}
                  </span>
                  {c.applied.length > 0 && <i className="saison-cristal" />}
                </button>
              );
            })}
            <i className="saison-moyenne" style={{ ['--y' as string]: part(moyenne) } as CSSProperties} aria-hidden="true" />
            {moyenneLigue !== null && (
              <i
                className="saison-moyenne"
                data-ligue=""
                style={{ ['--y' as string]: part(moyenneLigue) } as CSSProperties}
                aria-hidden="true"
              />
            )}
            {g && survolee !== null && (
              <div
                className="saison-bulle"
                style={
                  {
                    ['--x' as string]: x,
                    // Près d'un bord, la bulle se décale vers l'intérieur.
                    ['--decale' as string]: x < 0.2 ? '-12%' : x > 0.8 ? '-88%' : '-50%',
                  } as CSSProperties
                }
                role="status"
              >
                <b>
                  Game {survolee + 1} · {g.skipped ? 'Joker' : pts(g.score)}
                </b>
                <span>
                  {g.placement !== null ? `Top ${g.placement}` : 'Pas top'} · {g.kills} kill{g.kills > 1 ? 's' : ''} ·{' '}
                  {shortDateTime(g.playedAt)}
                </span>
                {g.applied.map((a, k) => (
                  <span key={k} className="saison-bulle-carte" data-malus={a.points < 0 ? '' : undefined}>
                    {getCard(a.cardId)?.name ?? a.cardId} <b>{effetCourt(a.cardId, a.points)}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Les moyennes, nommées dans la marge, à la hauteur de leur trait. */}
          <div className="saison-marge" aria-hidden="true">
            <span className="saison-etiquette" style={{ ['--y' as string]: etiquettes.perso } as CSSProperties}>
              <small>Sa moyenne</small>
              {decimal(moyenne)}
            </span>
            {moyenneLigue !== null && etiquettes.ligue !== null && (
              <span
                className="saison-etiquette"
                data-ligue=""
                style={{ ['--y' as string]: etiquettes.ligue } as CSSProperties}
              >
                <small>La ligue</small>
                {decimal(moyenneLigue)}
              </span>
            )}
          </div>
        </div>
        <div className="saison-abscisse" aria-hidden="true">
          <span>Game 1</span>
          <span>
            {chronologie.length} jouée{chronologie.length > 1 ? 's' : ''} sur {total}
          </span>
          <span>Game {total}</span>
        </div>
      </figure>

      <dl className="saison-forme">
        <div>
          <dt>Forme</dt>
          <dd className="num">{decimal(forme.moyenneCinq)}</dd>
          <p>
            pts sur ses {forme.cinq} dernières ·{' '}
            <b data-sens={forme.moyenneCinq >= moyenne ? 'haut' : 'bas'}>{signe(forme.moyenneCinq - moyenne)}</b>
          </p>
        </div>
        <div>
          <dt>Kills</dt>
          <dd className="num">{decimal(forme.kills)}</dd>
          <p>par game</p>
        </div>
        <div>
          <dt>Top 10</dt>
          <dd className="num">{comptees.length ? Math.round((forme.top10 / comptees.length) * 100) : 0} %</dd>
          <p>
            {forme.top10} game{forme.top10 > 1 ? 's' : ''} sur {comptees.length}
          </p>
        </div>
        <div>
          <dt>Cartes</dt>
          <dd className="num">{signe(forme.cartes)}</dd>
          <p>
            pts sur {forme.avecCarte} game{forme.avecCarte > 1 ? 's' : ''}
          </p>
        </div>
      </dl>
    </div>
  );
}

/* ================================= La grille ================================= */

export function GrilleGames({
  chronologie,
  creneaux,
  palier,
  uneParSessionApres,
  choisie,
  onChoisit,
  garde,
  meilleureId,
  pireId,
}: {
  chronologie: GameDuJoueur[];
  creneaux: number;
  palier: number;
  uneParSessionApres: number | null;
  choisie: string | null;
  onChoisit: (id: string) => void;
  garde: (g: GameDuJoueur) => boolean;
  meilleureId: string | null;
  pireId: string | null;
}) {
  const total = Math.max(creneaux, chronologie.length);
  return (
    <ol className="grille-games" aria-label={`Ses games : ${chronologie.length} jouées sur ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const numero = i + 1;
        const g = chronologie[i];
        const repere =
          numero === palier ? 'finisseur' : uneParSessionApres !== null && numero > uneParSessionApres ? 'session' : undefined;
        if (!g) {
          return (
            <li key={`vide-${numero}`}>
              <span className="case" data-vide="" data-repere={repere}>
                <span className="case-num">{numero}</span>
                {repere === 'finisseur' && <span className="case-repere">Finisseur</span>}
                {repere === 'session' && <span className="case-repere">1 / session</span>}
              </span>
            </li>
          );
        }
        const place = podiumDe(g);
        const cartes = g.skipped ? [] : cartesDe(g);
        const carte = cartes[0];
        const extreme = g.id === meilleureId ? 'meilleure' : g.id === pireId ? 'pire' : undefined;
        return (
          <li key={g.id}>
            <button
              type="button"
              className="case"
              data-joker={g.skipped ? '' : undefined}
              data-podium={place ?? undefined}
              data-extreme={extreme}
              data-repere={repere}
              data-eteinte={garde(g) ? undefined : ''}
              aria-pressed={choisie === g.id}
              onClick={() => onChoisit(g.id)}
              aria-label={`Game ${numero} : ${g.skipped ? 'Joker' : pts(g.score)}${
                g.placement !== null ? `, Top ${g.placement}` : ''
              }${carte ? `, ${getCard(carte.cardId)?.name ?? ''} ${effetCourt(carte.cardId, carte.points)}` : ''}`}
            >
              <span className="case-num">{numero}</span>
              {place && (
                <span className="case-podium">
                  <Podium place={place} id={`case-${g.id}`} className="h-full w-full" />
                </span>
              )}
              <b className="case-score num">{g.skipped ? '—' : g.score}</b>
              <span className="case-pied">
                {g.skipped ? (
                  <span className="case-joker">Joker</span>
                ) : carte ? (
                  <span className="case-carte" data-malus={carte.points < 0 ? '' : undefined}>
                    <Vignette cardId={carte.cardId} />
                    <b>{effetCourt(carte.cardId, carte.points)}</b>
                  </span>
                ) : (
                  <span className="case-place">{g.placement !== null ? `Top ${g.placement}` : `${g.kills} k`}</span>
                )}
              </span>
              {extreme && <span className="case-extreme">{extreme === 'meilleure' ? 'Meilleure' : 'Pire'}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ================================== Le détail ================================== */

export function DetailGame({
  game,
  numero,
  moyenne,
  moyenneLigue,
  extreme,
  moderation,
  onCorrige,
  ouvert,
  onFerme,
}: {
  game: GameDuJoueur | null;
  numero: number;
  moyenne: number;
  moyenneLigue: number | null;
  extreme: 'meilleure' | 'pire' | null;
  moderation: boolean;
  onCorrige: (g: GameDuJoueur) => void;
  /** Sur téléphone, le détail s'ouvre en feuille, par-dessus. */
  ouvert: boolean;
  onFerme: () => void;
}) {
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFerme();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert, onFerme]);

  if (!game) {
    return (
      <aside className="detail-game" data-vide="">
        <p className="detail-vide">Choisis une game dans les colonnes ou dans la grille.</p>
      </aside>
    );
  }
  const place = podiumDe(game);
  const cartes = cartesDe(game);
  return (
    <>
      {ouvert && <div className="detail-voile" onClick={onFerme} aria-hidden="true" />}
      <aside className="detail-game" data-ouvert={ouvert ? '' : undefined} aria-label={`La game ${numero}`}>
        <header className="detail-tete">
          <span>
            <b>Game {numero}</b>
            <small>{shortDateTime(game.playedAt)}</small>
          </span>
          {extreme && (
            <span className="detail-extreme" data-extreme={extreme}>
              {extreme === 'meilleure' ? 'Sa meilleure' : 'Sa pire'}
            </span>
          )}
          <button type="button" className="detail-fermer" onClick={onFerme} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="detail-score">
          <b className="num">{game.skipped ? '—' : game.score}</b>
          <span>
            <small>{game.skipped ? 'Joker joué' : 'points'}</small>
            <span className="detail-place">
              {place && <Podium place={place} id={`detail-${game.id}`} className="h-5 w-5" />}
              {game.placement !== null ? `Top ${game.placement}` : 'Pas top'} · {game.kills} kill{game.kills > 1 ? 's' : ''}
            </span>
          </span>
        </div>

        {game.skipped ? (
          <p className="detail-note">Le Joker a été servi : cette game ne compte pas.</p>
        ) : (
          <dl className="detail-ecarts">
            <div>
              <dt>Sa moyenne</dt>
              <dd data-sens={game.score >= moyenne ? 'haut' : 'bas'}>{signe(game.score - moyenne)}</dd>
            </div>
            {moyenneLigue !== null && (
              <div>
                <dt>La ligue</dt>
                <dd data-sens={game.score >= moyenneLigue ? 'haut' : 'bas'}>{signe(game.score - moyenneLigue)}</dd>
              </div>
            )}
          </dl>
        )}

        {cartes.length > 0 ? (
          <ul className="detail-cartes">
            {cartes.map((c) => {
              const carte = getCard(c.cardId);
              if (!carte) return null;
              return (
                <li key={c.cardId} className="detail-carte">
                  <span className="detail-carte-visuel">
                    <CardFrame
                      cardId={carte.id}
                      name={carte.name}
                      rarity={carte.rarity}
                      glyph={carte.glyph}
                      nature={carte.nature}
                      largeur="110px"
                    />
                  </span>
                  <span className="detail-carte-texte">
                    <small>{carte.subtitle}</small>
                    <b>{carte.name}</b>
                    <span className="detail-carte-points" data-malus={c.points < 0 ? '' : undefined}>
                      {effetCourt(c.cardId, c.points)}
                      {/^[+−]/.test(effetCourt(c.cardId, c.points)) && ' pts'}
                    </span>
                    {c.resultat && <span className="detail-carte-resultat">{c.resultat}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          !game.skipped && <p className="detail-note">Aucune carte jouée sur cette game.</p>
        )}

        {moderation && (
          <button type="button" className="btn btn-sm detail-corriger" onClick={() => onCorrige(game)}>
            <IconCrayon className="h-4 w-4" />
            Corriger ou supprimer
          </button>
        )}
      </aside>
    </>
  );
}
