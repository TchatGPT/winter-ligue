'use client';

import { useState } from 'react';

/**
 * La saison d'un joueur, case par case.
 *
 * Une case par game de la saison, dans l'ordre. Une game jouée se remplit de
 * glace, jusqu'à une hauteur qui suit son score ; son score s'y lit en grand,
 * avec la médaille d'un podium et ses kills. Le record est cerclé. Les games
 * qui restent à jouer sont des cases vides, en pointillés.
 *
 * Il a d'abord été un histogramme, puis des colonnes de glace : deux barres
 * perdues au bord d'un grand cadre vide, tant que la saison commence. Un
 * plateau de cases, lui, est joli dès la première game, et se remplit avec
 * la saison.
 *
 * Au survol ou au clavier, la case donne la date de la game ; le reste du
 * détail — les cartes jouées — est dans la liste, juste dessous.
 */

export interface CaseGame {
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

export function SaisonEnCases({ games, creneaux }: { games: CaseGame[]; creneaux: number }) {
  const [survol, setSurvol] = useState<number | null>(null);

  const places = Math.max(creneaux, games.length);
  const comptees = games.filter((g) => !g.passee);
  const record = comptees.length > 0 ? Math.max(...comptees.map((g) => g.score)) : null;
  // La glace monte avec le score ; le record la remplit aux trois quarts, pour
  // que sa surface reste sous la ligne du numéro et de la médaille.
  const echelle = Math.max(10, record ?? 0) / 0.74;

  return (
    <div className="cases">
      <p className="cases-legende">
        Une case par game de la saison : la glace monte avec le score
        {record !== null ? ', et le record est cerclé' : ''}.
      </p>

      <ol className="cases-grille">
        {Array.from({ length: places }, (_, i) => {
          const g = games[i];
          if (!g) {
            return (
              <li key={i} className="case case-libre" aria-hidden="true">
                <span>{i + 1}</span>
              </li>
            );
          }
          const podium = g.placement !== null && g.placement <= 3 ? g.placement : null;
          const niveau = Math.max(16, Math.min(100, (Math.max(0, g.score) / echelle) * 100));
          return (
            <li
              key={i}
              className="case"
              tabIndex={0}
              aria-label={`Game ${g.numero}, ${g.date} : ${g.score} points, ${g.kills} kills${
                g.placement ? `, Top ${g.placement}` : ''
              }${g.passee ? ', passée' : ''}`}
              data-record={!g.passee && g.score === record ? '' : undefined}
              data-passee={g.passee ? '' : undefined}
              data-actif={survol === i ? '' : undefined}
              onPointerEnter={() => setSurvol(i)}
              onPointerLeave={() => setSurvol((s) => (s === i ? null : s))}
              onFocus={() => setSurvol(i)}
              onBlur={() => setSurvol((s) => (s === i ? null : s))}
            >
              <span className="case-glace" style={{ height: `${niveau}%` }} aria-hidden="true" />
              <span className="case-tete">
                <span className="case-numero">#{g.numero}</span>
                {podium && (
                  <span className="medaille case-medaille" data-rang={podium}>
                    {podium}
                  </span>
                )}
              </span>
              <strong className="case-score">{g.score}</strong>
              <span className="case-pied">{survol === i ? g.date.split(' ')[0] : `${g.kills} kills`}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
