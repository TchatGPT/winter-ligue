'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DUREE_TIRAGE_JOUEUR } from '@/components/RailJoueurs';
import { ATTR_FENETRE, ATTR_RUBAN, useSpinAnimation } from '@/components/useSpinAnimation';
import type { GameAuTirage, GamesAuTirage } from '@/lib/domain/tirage';
import { construitBandeJoueurs } from '@/lib/spin/bande';
import { COURBE_MESUREE, RANG_GAGNANT } from '@/lib/spin/courbe';

/**
 * Le troisième tirage d'une ouverture (12/11/2026) : la game, ou les games,
 * que la carte touche. Le serveur les a choisies à l'ouverture
 * (`choisitGamesRoue`) ; l'écran les déroule après les joueurs.
 *
 * - **Tirées au sort** : un rail de games par joueur, tous en même temps,
 *   empilés sous le même repère, comme les joueurs.
 * - **Désignées par la carte** (sa pire, sa meilleure) : pas de rail — il
 *   mentirait sur le hasard. Les games visées se posent, une à une, avec ce
 *   que la carte en fait ; entre deux joueurs, le lien (⇄ un échange, → une
 *   copie).
 */

/** La question posée au-dessus du tirage des games. */
export function questionDesGames(games: GamesAuTirage): string {
  const n = games.parJoueur.reduce((s, e) => s + (e?.visees.length ?? 0), 0);
  if (games.hasard) return n > 1 ? 'Quelles games ?' : 'Quelle game ?';
  if (games.lien === 'echange') return 'Les games échangées';
  if (games.lien === 'copie') return 'La game copiée';
  return n > 1 ? 'Les games touchées' : 'La game touchée';
}

/** Combien de temps les games désignées restent à l'écran avant la carte. */
const POSE_MS = 2600;

/** « Top 3 », ou rien. */
const top = (g: GameAuTirage) => (g.top === null ? null : `Top ${g.top}`);

/** Le détail d'une game, sous son score. */
function detail(g: GameAuTirage): string {
  return [`${g.kills} kill${g.kills > 1 ? 's' : ''}`, top(g)].filter(Boolean).join(' · ');
}

/** Une game, telle qu'une plaque la montre : à qui, laquelle, combien. */
function PlaqueGame({ pseudo, game }: { pseudo: string; game: GameAuTirage }) {
  return (
    <>
      <span className="plaque-game-qui">{pseudo}</span>
      <span className="plaque-game-quoi">
        Game {game.numero}
        <b className="num">
          {game.score} pt{Math.abs(game.score) > 1 ? 's' : ''}
        </b>
      </span>
      <span className="plaque-game-detail">{detail(game)}</span>
    </>
  );
}

export function TirageGames({
  games,
  sourdine = false,
  onFini,
}: {
  games: GamesAuTirage;
  sourdine?: boolean;
  onFini: () => void;
}) {
  const lignes = useMemo(() => games.parJoueur.filter((e) => e !== null), [games]);
  // Un rail n'a de sens que si le sort avait le choix : une seule game libre
  // se pose, comme une game désignée.
  const tournent = games.hasard && lignes.every((e) => e.visees.length === 1 && e.parmi.length > 1);
  return tournent ? (
    <RailGames lignes={lignes} lien={games.lien} sourdine={sourdine} onFini={onFini} />
  ) : (
    <GamesPosees lignes={lignes} lien={games.lien} onFini={onFini} />
  );
}

/** Combien de temps le verdict reste à l'écran, une fois les games posées. */
const VERDICT_MS = 2600;

/** « +13 pts », « −13 pts », « 1 pt ». */
function enPoints(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} pt${Math.abs(n) > 1 ? 's' : ''}`;
}

/**
 * Ce que l'échange — ou la copie — fera à chacun des deux, dit dès que les
 * games sont connues (12/11/2026) : qui y gagne, qui y perd, de combien. Le
 * compte rendu de la carte révélée le confirme.
 */
function Verdict({ lignes, lien }: { lignes: Ligne[]; lien: GamesAuTirage['lien'] }) {
  if ((lien !== 'echange' && lien !== 'copie') || lignes.length !== 2) return null;
  const [a, b] = lignes;
  const sa = a.visees[0]?.score;
  const sb = b.visees[0]?.score;
  if (sa === undefined || sb === undefined) return null;
  const rangs =
    lien === 'echange'
      ? [
          { l: a, avant: sa, apres: sb },
          { l: b, avant: sb, apres: sa },
        ]
      : [
          { l: a, avant: sa, apres: sb },
          { l: b, avant: sb, apres: sb },
        ];
  return (
    <div className="verdict-echange" role="status">
      {rangs.map(({ l, avant, apres }) => {
        const d = apres - avant;
        const sens = d > 0 ? 'gain' : d < 0 ? 'perte' : 'neutre';
        return (
          <p key={l.pseudo} className="verdict-ligne" data-sens={sens}>
            <b>{l.pseudo}</b>
            <span className="num">
              {avant} → {apres} pts
            </span>
            <span className="verdict-badge num">
              {d === 0 ? (lien === 'copie' ? 'garde sa game' : '=') : enPoints(d)}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/** Après le rail : le verdict, le temps de le lire, puis la suite. */
function useVerdict(actif: boolean, onFini: () => void): [boolean, () => void] {
  const [montre, setMontre] = useState(false);
  const rappel = useRef(onFini);
  useEffect(() => {
    rappel.current = onFini;
  }, [onFini]);
  useEffect(() => {
    if (!montre) return;
    const t = window.setTimeout(() => rappel.current(), VERDICT_MS);
    return () => window.clearTimeout(t);
  }, [montre]);
  const fin = useCallback(() => (actif ? setMontre(true) : rappel.current()), [actif]);
  return [montre, fin];
}

type Ligne = Exclude<GamesAuTirage['parJoueur'][number], null>;

/** Le rail des games tirées au sort : une bande par joueur, ensemble. */
function RailGames({
  lignes,
  lien,
  sourdine,
  onFini,
}: {
  lignes: Ligne[];
  lien: GamesAuTirage['lien'];
  sourdine: boolean;
  onFini: () => void;
}) {
  const [verdict, fin] = useVerdict(lien === 'echange' || lien === 'copie', onFini);
  // La bande défile des numéros de game : ceux du joueur, parmi lesquels le
  // serveur a tiré ; elle s'arrête sur la sienne.
  const [bandes] = useState(() =>
    lignes.map((l) =>
      construitBandeJoueurs(
        l.parmi.map((g) => String(g.numero)),
        String(l.visees[0].numero),
        Math.random,
      ).map((n) => l.parmi.find((g) => String(g.numero) === n) ?? l.visees[0]),
    ),
  );
  const cadre = useRef<HTMLDivElement>(null);
  const metaTuiles = useMemo(
    () => bandes.map((bande) => bande.map(() => ({ rang: 0, couleur: 'var(--aurora)' }))),
    [bandes],
  );

  useSpinAnimation({
    cadre,
    bandes: bandes.length,
    tuiles: metaTuiles,
    duree: DUREE_TIRAGE_JOUEUR,
    courbe: COURBE_MESUREE,
    axe: 'x',
    sourdine,
    onFini: fin,
  });

  return (
    <div className="rail-scene rail-scene-x">
      <div
        className="rail rail-x rail-joueurs rail-games"
        ref={cadre}
        data-rangs={bandes.length}
        style={{ ['--bandes' as string]: 1, ['--rangs' as string]: bandes.length }}
        role="img"
        aria-label={bandes.length > 1 ? 'Tirage des games en cours' : 'Tirage d’une game en cours'}
      >
        {bandes.map((bande, b) => (
          <div
            key={b}
            className="rail-fenetre"
            {...{ [ATTR_FENETRE]: '' }}
            data-arrete="false"
            data-rang={0}
            style={{ ['--gagne' as string]: 'var(--aurora)' }}
          >
            <div className="rail-ruban" {...{ [ATTR_RUBAN]: '' }}>
              {bande.map((game, k) => (
                <div
                  key={k}
                  className={`rail-carte plaque-game${k === RANG_GAGNANT ? ' rail-carte-gagnante' : ''}`}
                  data-rang={0}
                  style={{ ['--r' as string]: 'var(--aurora)', ['--k' as string]: String(k) }}
                  aria-hidden="true"
                >
                  <PlaqueGame pseudo={lignes[b].pseudo} game={game} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <span className="rail-repere" aria-hidden="true" />
        <span className="rail-voile rail-voile-avant" aria-hidden="true" />
        <span className="rail-voile rail-voile-apres" aria-hidden="true" />
      </div>
      {verdict && <Verdict lignes={lignes} lien={lien} />}
    </div>
  );
}

/** Les games désignées par la carte : elles se posent, l'une après l'autre. */
function GamesPosees({
  lignes,
  lien,
  onFini,
}: {
  lignes: Ligne[];
  lien: GamesAuTirage['lien'];
  onFini: () => void;
}) {
  const rappel = useRef(onFini);
  useEffect(() => {
    rappel.current = onFini;
  }, [onFini]);
  const nbPlaques = lignes.reduce((n, l) => n + l.visees.length, 0);
  useEffect(() => {
    const t = window.setTimeout(() => rappel.current(), POSE_MS + nbPlaques * 260);
    return () => window.clearTimeout(t);
  }, [nbPlaques]);

  let rang = 0;
  const entre = lien === 'echange' ? '⇄' : lien === 'copie' ? '→' : null;
  return (
    <div className="games-posees" role="list" aria-label="Les games que la carte touche">
      {lignes.map((l, i) => (
        <div key={`${l.pseudo}-${i}`} className="games-posees-groupe" role="listitem">
          {i > 0 && entre && (
            <span className="games-posees-lien" aria-hidden="true">
              {entre}
            </span>
          )}
          <p className="games-posees-libelle">
            <b>{l.pseudo}</b> · {l.libelle}
          </p>
          <div className="games-posees-plaques">
            {l.visees.map((g, k) => (
              <Fragment key={g.numero}>
                {k > 0 && lien === 'fusion' && (
                  <span className="games-posees-plus" aria-hidden="true">
                    +
                  </span>
                )}
                <div className="plaque-game plaque-game-posee" style={{ ['--i' as string]: rang++ }}>
                  <PlaqueGame pseudo={l.pseudo} game={g} />
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      ))}
      <div className="games-posees-verdict" style={{ ['--i' as string]: rang }}>
        <Verdict lignes={lignes} lien={lien} />
      </div>
    </div>
  );
}
