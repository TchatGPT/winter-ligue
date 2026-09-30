'use client';

import { useId, useState } from 'react';

/**
 * La saison d'un joueur, en colonnes de glace.
 *
 * Une colonne par game jouée, dans l'ordre : de la glace translucide coiffée
 * de neige, plantée dans une congère, son score au sommet. Les games qui
 * restent à jouer sont des places en pointillés : on voit d'un coup d'œil
 * où en est la saison, et le graphique n'est jamais vide.
 *
 * Il a d'abord été un histogramme de manuel — un cadre sombre, des barres
 * fines, un axe gradué. Juste, mais étranger au site : ici, tout est glace et
 * neige, jusqu'aux barres de défilement.
 *
 * Le score se lit au sommet de chaque colonne tant qu'elles tiennent ; au-delà
 * d'une douzaine de games, seuls la meilleure et la dernière gardent le leur.
 * Le détail vit dans l'infobulle — au survol comme au clavier — et dans la
 * liste des games, juste dessous, qui tient lieu de tableau. Un podium se
 * marque d'une médaille numérotée sous sa colonne : jamais par la couleur
 * seule.
 */

export interface PointScore {
  /** Le numéro de la game dans la saison du joueur, à partir de 1. */
  numero: number;
  date: string;
  kills: number;
  placement: number | null;
  /** Ce que les cartes ont ajouté ou retiré. */
  cartes: number;
  score: number;
  /** Game passée : visible, mais hors du total. */
  passee: boolean;
}

/** La congère : une vague douce, dessinée une fois pour toutes. */
const CONGERE =
  'M0 20 L0 11 C 60 7, 120 13, 190 9 S 330 6, 400 10 S 540 14, 610 9 S 760 6, 830 10 S 950 13, 1000 9 L1000 20 Z';
const CRETE = 'M0 11 C 60 7, 120 13, 190 9 S 330 6, 400 10 S 540 14, 610 9 S 760 6, 830 10 S 950 13, 1000 9';

export function GraphiqueScores({
  points,
  moyenne,
  creneaux,
}: {
  points: PointScore[];
  moyenne: number;
  /** Les games de sa saison : les places libres complètent la rangée jusque-là. */
  creneaux: number;
}) {
  const [survol, setSurvol] = useState<number | null>(null);
  const id = useId().replace(/:/g, '');

  const places = Math.max(creneaux, points.length);
  const libres = places - points.length;
  // Un peu d'air au-dessus de la plus haute : sa neige et son score doivent tenir.
  const haut = Math.max(10, ...points.map((p) => p.score)) * 1.06;
  const hauteur = (v: number) => `${(Math.max(0, v) / haut) * 100}%`;

  const comptees = points.filter((p) => !p.passee);
  const meilleure = comptees.length > 0 ? comptees.reduce((m, p) => (p.score > m.score ? p : m)) : null;
  const tousLesScores = points.length <= 12;
  const bulle = survol !== null ? points[survol] : null;

  return (
    <figure className="graphe">
      <figcaption className="sr-only">Le score de chaque game, dans l’ordre où elles ont été jouées.</figcaption>
      {moyenne > 0 && (
        <p className="graphe-cle">
          <i aria-hidden="true" /> moyenne {moyenne} pts
        </p>
      )}

      <div className="graphe-scene">
        <div className="graphe-trace">
          {moyenne > 0 && <i className="graphe-moyenne" style={{ bottom: hauteur(moyenne) }} aria-hidden="true" />}

          <ol className="graphe-colonnes">
            {points.map((p, i) => (
              <li
                key={p.numero}
                className="graphe-colonne"
                tabIndex={0}
                aria-label={`Game ${p.numero}, ${p.date} : ${p.score} points, ${p.kills} kills${
                  p.placement ? `, Top ${p.placement}` : ''
                }${p.passee ? ', passée' : ''}`}
                data-actif={survol === i ? '' : undefined}
                data-passee={p.passee ? '' : undefined}
                onPointerEnter={() => setSurvol(i)}
                onPointerLeave={() => setSurvol((s) => (s === i ? null : s))}
                onFocus={() => setSurvol(i)}
                onBlur={() => setSurvol((s) => (s === i ? null : s))}
              >
                <span className="graphe-glace" style={{ height: hauteur(p.score) }}>
                  {(tousLesScores || p === meilleure || i === points.length - 1) && (
                    <b className="graphe-valeur">{p.score}</b>
                  )}
                </span>
              </li>
            ))}
            {Array.from({ length: libres }, (_, i) => (
              <li key={`libre-${i}`} className="graphe-colonne" aria-hidden="true">
                <span className="graphe-place" />
              </li>
            ))}
          </ol>

          {bulle && survol !== null && (
            <div
              className="graphe-bulle"
              style={{
                // Bornée pour que la bulle ne déborde pas de la plaque aux deux bouts.
                left: `clamp(5rem, ${((survol + 0.5) / places) * 100}%, calc(100% - 5rem))`,
                bottom: `calc(${hauteur(bulle.score)} + 2.2rem)`,
              }}
              role="status"
            >
              <strong>
                {bulle.score} <small>pts</small>
              </strong>
              <span>
                Game {bulle.numero} · {bulle.date}
              </span>
              <span>
                {bulle.kills} kills{bulle.placement ? ` · Top ${bulle.placement}` : ''}
                {bulle.cartes !== 0 ? ` · cartes ${bulle.cartes > 0 ? '+' : ''}${bulle.cartes}` : ''}
              </span>
              {bulle.passee && <span>passée, hors du total</span>}
            </div>
          )}
        </div>

        {/* La congère, par-dessus le pied des colonnes : elles y sont plantées. */}
        <svg className="graphe-congere" viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-neige`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--neige-1)' }} />
              <stop offset="0.6" style={{ stopColor: 'var(--neige-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--neige-3)' }} />
            </linearGradient>
          </defs>
          <path d={CONGERE} fill={`url(#${id}-neige)`} />
          <path
            d={CRETE}
            fill="none"
            stroke="white"
            strokeOpacity="0.9"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Sous chaque colonne : la médaille d'un podium, ou le numéro de la game. */}
      <ol className="graphe-axe-x" aria-hidden="true">
        {Array.from({ length: places }, (_, i) => {
          const p = points[i];
          const numero = i + 1;
          if (p && p.placement !== null && p.placement <= 3) {
            return (
              <li key={numero}>
                <span className="medaille graphe-medaille" data-rang={p.placement}>
                  {p.placement}
                </span>
              </li>
            );
          }
          return <li key={numero}>{numero === 1 || numero % 5 === 0 || numero === places ? numero : null}</li>;
        })}
      </ol>
    </figure>
  );
}
