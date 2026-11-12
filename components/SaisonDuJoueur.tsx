'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { CouronneGlace } from '@/components/CouronneGlace';
import { IconCrayon } from '@/components/icons';
import { MedailleGlace } from '@/components/MedailleGlace';
import { getCard } from '@/lib/domain/catalog';
import { decimal, shortDateTime } from '@/lib/format';
import type { FicheJoueur } from '@/lib/services/profile';

/**
 * La saison d'un joueur, game par game (refaite le 12/11/2026, dans le thème) :
 *
 *  - **les colonnes** : une par game, toutes de la même glace. Le podium se lit
 *    à sa couronne et à ses médailles posées dessus, plus à des couleurs ; une
 *    carte jouée, à un petit cristal sous la game ; un Joker, à une colonne en
 *    creux. La moyenne est une ligne, nommée. Au survol, le détail de la game ;
 *  - **la forme** : quatre chiffres de plus à côté — les cinq dernières games,
 *    les kills par game, le taux de Top 10, ce que les cartes ont rapporté ;
 *  - **le tableau** : une ligne par game, toutes de la même hauteur, les
 *    colonnes alignées — numéro, score, place, kills, carte, date.
 */

export type GameDuJoueur = FicheJoueur['profil']['games'][number];

/** Le podium d'une game : la couronne, une médaille, ou rien. */
function Podium({ place, id, className = 'h-4 w-4' }: { place: number | null; id: string; className?: string }) {
  if (place === 1) return <CouronneGlace className={className} id={`couronne-${id}`} />;
  if (place === 2 || place === 3) return <MedailleGlace rang={place} className={className} id={`medaille-${id}`} />;
  return null;
}

/** Des graduations rondes : 0, 10, 20… jusqu'au-dessus de la meilleure game. */
function graduations(max: number): number[] {
  const pas = [5, 10, 20, 25, 50, 100].find((p) => max / p <= 4) ?? 100;
  const haut = Math.max(pas, Math.ceil(max / pas) * pas);
  return Array.from({ length: haut / pas + 1 }, (_, i) => i * pas);
}

const pts = (n: number) => `${n} pt${Math.abs(n) > 1 ? 's' : ''}`;
const signe = (n: number) => (n > 0 ? `+${decimal(n)}` : n < 0 ? `−${decimal(-n)}` : '±0');

/** Ce qu'une carte a fait sur la game, en court. */
function effetCourt(effet: { cardId: string; points: number }): string {
  const carte = getCard(effet.cardId);
  if (carte?.effect.kind === 'fige_meilleure') return 'figée';
  if (carte?.effect.kind === 'supprime_pire') return 'supprimée';
  if (carte?.effect.kind === 'clone_kills' && effet.points === 0) return 'kills clonés';
  return `${effet.points > 0 ? '+' : ''}${effet.points}`;
}

/* ================================ Les colonnes ================================ */

export function ColonnesSaison({
  chronologie,
  moyenne,
}: {
  /** Les games, de la première à la dernière. */
  chronologie: GameDuJoueur[];
  moyenne: number;
}) {
  const [survolee, setSurvolee] = useState<number | null>(null);
  const comptees = chronologie.filter((g) => !g.skipped);
  const echelle = graduations(Math.max(1, ...chronologie.map((g) => g.score)));
  const haut = echelle[echelle.length - 1];
  const part = (score: number) => Math.max(0, Math.min(1, score / haut));

  const forme = useMemo(() => {
    const cinq = comptees.slice(-5);
    const moyenneCinq = cinq.length ? cinq.reduce((s, g) => s + g.score, 0) / cinq.length : 0;
    const kills = comptees.length ? comptees.reduce((s, g) => s + g.kills, 0) / comptees.length : 0;
    const top10 = comptees.filter((g) => g.placement !== null && g.placement <= 10).length;
    const cartes = comptees.reduce((s, g) => s + g.applied.reduce((t, a) => t + a.points, 0), 0);
    const avecCarte = comptees.filter((g) => g.applied.length > 0).length;
    return { cinq: cinq.length, moyenneCinq, kills, top10, cartes, avecCarte };
  }, [comptees]);

  const g = survolee !== null ? chronologie[survolee] : null;

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
            {echelle
              .slice()
              .reverse()
              .map((v) => (
                <span key={v} style={{ ['--y' as string]: v / haut } as CSSProperties}>
                  {v}
                </span>
              ))}
          </div>
          <div
            className="saison-colonnes"
            role="img"
            aria-label={`Ses ${chronologie.length} games, de la première à la dernière : ${chronologie
              .map((x) => (x.skipped ? 'Joker' : x.score))
              .join(', ')} points. Moyenne ${decimal(moyenne)}.`}
            onMouseLeave={() => setSurvolee(null)}
          >
            {echelle.map((v) => (
              <i key={v} className="saison-ligne" style={{ ['--y' as string]: v / haut } as CSSProperties} aria-hidden="true" />
            ))}
            <i className="saison-moyenne" style={{ ['--y' as string]: part(moyenne) } as CSSProperties} aria-hidden="true">
              <span>moy. {decimal(moyenne)}</span>
            </i>
            {chronologie.map((x, i) => {
              const place = x.placement !== null && x.placement <= 3 ? x.placement : null;
              return (
                <span
                  key={x.id}
                  className="saison-colonne"
                  data-survolee={survolee === i ? '' : undefined}
                  data-joker={x.skipped ? '' : undefined}
                  onMouseEnter={() => setSurvolee(i)}
                  style={{ ['--part' as string]: x.skipped ? 0 : part(x.score) } as CSSProperties}
                >
                  <span className="saison-barre">
                    {place && (
                      <span className="saison-podium">
                        <Podium place={place} id={`saison-${x.id}`} className="h-full w-full" />
                      </span>
                    )}
                  </span>
                  {x.applied.length > 0 && <i className="saison-cristal" />}
                </span>
              );
            })}
            {g && survolee !== null && (
              <div
                className="saison-bulle"
                style={
                  {
                    ['--x' as string]: (survolee + 0.5) / chronologie.length,
                    // Près d'un bord, la bulle se décale vers l'intérieur.
                    ['--decale' as string]:
                      (survolee + 0.5) / chronologie.length < 0.2
                        ? '-12%'
                        : (survolee + 0.5) / chronologie.length > 0.8
                          ? '-88%'
                          : '-50%',
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
                    {getCard(a.cardId)?.name ?? a.cardId} <b>{effetCourt(a)}</b>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="saison-abscisse" aria-hidden="true">
          <span>Game 1</span>
          <span>Game {chronologie.length}</span>
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

/* ================================= Le tableau ================================= */

export function TableauGames({
  games,
  numeroDe,
  meilleure,
  moderation,
  onCorrige,
}: {
  games: GameDuJoueur[];
  numeroDe: Map<string, number>;
  meilleure: number;
  moderation: boolean;
  onCorrige: (g: GameDuJoueur) => void;
}) {
  return (
    <div className="tab-games" data-moderation={moderation ? '' : undefined} role="table" aria-label="Ses games">
      <div className="tab-games-tete" role="row">
        <span role="columnheader">N°</span>
        <span role="columnheader">Score</span>
        <span role="columnheader">Place</span>
        <span role="columnheader">Kills</span>
        <span role="columnheader">Carte</span>
        <span role="columnheader">Date</span>
        {moderation && <span role="columnheader" aria-label="Corriger" />}
      </div>
      {games.map((g) => {
        const numero = numeroDe.get(g.id) ?? 0;
        const place = g.placement !== null && g.placement <= 3 ? g.placement : null;
        return (
          <div
            key={g.id}
            className="tab-game"
            role="row"
            data-joker={g.skipped ? '' : undefined}
            data-podium={place ?? undefined}
          >
            <span className="tab-game-numero num" role="cell">
              {numero}
            </span>
            <span className="tab-game-score" role="cell">
              <b className="num">{g.skipped ? '—' : g.score}</b>
              <i style={{ ['--part' as string]: g.skipped ? 0 : Math.max(0, g.score) / Math.max(1, meilleure) } as CSSProperties} />
            </span>
            <span className="tab-game-place" role="cell">
              {place ? <Podium place={place} id={`tab-${g.id}`} className="h-5 w-5" /> : <i aria-hidden="true" />}
              {g.placement !== null ? (
                `Top ${g.placement}`
              ) : (
                <span className="tab-vide" title="Pas dans le Top 10">
                  —
                </span>
              )}
            </span>
            <span className="tab-game-kills num" role="cell">
              {g.kills}
              <small> kill{g.kills > 1 ? 's' : ''}</small>
            </span>
            <span className="tab-game-carte" role="cell">
              {g.skipped ? (
                <span className="tab-carte" data-joker="">
                  Joker <b>ne compte pas</b>
                </span>
              ) : g.applied.length > 0 ? (
                g.applied.map((a, k) => (
                  <span key={k} className="tab-carte" data-malus={a.points < 0 ? '' : undefined}>
                    <span className="truncate">{getCard(a.cardId)?.name ?? a.cardId}</span>
                    <b>{effetCourt(a)}</b>
                  </span>
                ))
              ) : (
                <span className="tab-vide">—</span>
              )}
            </span>
            <span className="tab-game-date" role="cell">
              {shortDateTime(g.playedAt)}
            </span>
            {moderation && (
              <span className="tab-game-action" role="cell">
                <button
                  type="button"
                  className="profil-game-corriger"
                  onClick={() => onCorrige(g)}
                  aria-label={`Corriger la game ${numero}`}
                  title="Corriger ou supprimer cette game"
                >
                  <IconCrayon className="h-[18px] w-[18px]" />
                </button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
