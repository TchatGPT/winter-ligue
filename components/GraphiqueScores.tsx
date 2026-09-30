'use client';

import { useState } from 'react';

/**
 * Le score de chaque game, en colonnes, dans l'ordre où elles ont été jouées.
 *
 * Une seule série, donc une seule couleur et pas de légende : le titre de la
 * plaque dit ce qu'on regarde. Le bleu glacier profond (`--ice-3`) est celui
 * qui passe les contrôles de couleur sur la plaque sombre ; le bleu clair des
 * titres, lui, se lisait comme du gris.
 *
 * On ne pose qu'un seul nombre sur les colonnes, celui de la meilleure game.
 * Les autres vivent dans l'infobulle — au survol comme au clavier — et dans la
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

/** Un pas de graduation rond, pour quatre graduations au plus. */
function graduation(max: number): { pas: number; haut: number } {
  for (const pas of [5, 10, 20, 25, 50, 100, 200]) {
    if (Math.ceil(max / pas) <= 4) return { pas, haut: Math.max(pas, Math.ceil(max / pas) * pas) };
  }
  return { pas: 500, haut: Math.ceil(max / 500) * 500 };
}

export function GraphiqueScores({ points, moyenne }: { points: PointScore[]; moyenne: number }) {
  const [survol, setSurvol] = useState<number | null>(null);

  const { pas, haut } = graduation(Math.max(10, ...points.map((p) => p.score)));
  const graduations = Array.from({ length: haut / pas + 1 }, (_, i) => i * pas);
  const comptees = points.filter((p) => !p.passee);
  const meilleure = comptees.length > 0 ? comptees.reduce((m, p) => (p.score > m.score ? p : m)) : null;
  // Au-delà d'une douzaine de games, un numéro sur cinq : ils se chevaucheraient.
  const tousLesNumeros = points.length <= 12;
  const hauteur = (v: number) => `${(Math.max(0, v) / haut) * 100}%`;
  const bulle = survol !== null ? points[survol] : null;

  return (
    <figure className="graphe">
      <figcaption className="sr-only">Le score de chaque game, dans l’ordre où elles ont été jouées.</figcaption>
      {/* La clé de la ligne de moyenne, au-dessus : posée sur la ligne, elle
          se heurtait au score de la meilleure game. */}
      {moyenne > 0 && (
        <p className="graphe-cle">
          <i aria-hidden="true" /> moyenne {moyenne} pts
        </p>
      )}

      <div className="graphe-cadre">
        {/* L'axe des scores : des filets, et leurs valeurs à gauche. */}
        <div className="graphe-axe-y" aria-hidden="true">
          {graduations.map((g) => (
            <span key={g} style={{ bottom: hauteur(g) }}>
              {g}
            </span>
          ))}
        </div>

        <div className="graphe-zone">
          {graduations.map((g) => (
            <i key={g} className="graphe-filet" style={{ bottom: hauteur(g) }} aria-hidden="true" />
          ))}
          {moyenne > 0 && (
            <i className="graphe-moyenne" style={{ bottom: hauteur(moyenne) }} aria-hidden="true" />
          )}

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
                <span className="graphe-barre" style={{ height: hauteur(p.score) }}>
                  {p === meilleure && <b className="graphe-valeur">{p.score}</b>}
                </span>
              </li>
            ))}
          </ol>

          {bulle && survol !== null && (
            <div
              className="graphe-bulle"
              style={{
                // Bornée pour que la bulle ne déborde pas de la plaque aux deux bouts.
                left: `clamp(5rem, ${((survol + 0.5) / points.length) * 100}%, calc(100% - 5rem))`,
                bottom: `calc(${hauteur(bulle.score)} + 0.6rem)`,
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
      </div>

      {/* L'axe des games : le numéro, ou la médaille d'un podium. */}
      <ol className="graphe-axe-x" aria-hidden="true">
        {points.map((p, i) => (
          <li key={p.numero}>
            {p.placement !== null && p.placement <= 3 ? (
              <span className="medaille graphe-medaille" data-rang={p.placement}>
                {p.placement}
              </span>
            ) : tousLesNumeros || p.numero % 5 === 0 || i === 0 || i === points.length - 1 ? (
              <span>{p.numero}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </figure>
  );
}
