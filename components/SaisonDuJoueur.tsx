'use client';

import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CardFrame } from '@/components/CardFrame';
import { CouronneGlace } from '@/components/CouronneGlace';
import { CraneGlace } from '@/components/CraneGlace';
import { IconCarte, IconChute, IconCrayon, IconEtoile, IconJoker } from '@/components/icons';
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

/**
 * Le numéro de chaque game (13/11/2026) : une game passée au Joker ne compte
 * pas, elle n'a pas de numéro, et la suivante prend le numéro suivant — le
 * joueur doit toujours jouer toutes ses games.
 */
export function numerotation(chronologie: readonly GameDuJoueur[]): Map<string, number | null> {
  let n = 0;
  return new Map(chronologie.map((g) => [g.id, g.skipped ? null : (n += 1)]));
}

/**
 * Les créneaux de la saison, dans l'ordre : chaque game jouée — un Joker
 * compris, à sa place, sans numéro —, puis les créneaux encore libres
 * jusqu'au dernier de la saison.
 */
export function creneauxDe(
  chronologie: readonly GameDuJoueur[],
  creneaux: number,
): { game: GameDuJoueur | null; numero: number | null }[] {
  const numeros = numerotation(chronologie);
  const comptees = chronologie.filter((g) => !g.skipped).length;
  return [
    ...chronologie.map((g) => ({ game: g, numero: numeros.get(g.id) ?? null })),
    ...Array.from({ length: Math.max(0, creneaux - comptees) }, (_, k) => ({ game: null, numero: comptees + k + 1 })),
  ];
}

/**
 * Le haut du glaçon qui fond, sur le bloc survolé ou choisi (sur ordinateur,
 * 12/11/2026). La barre garde son aspect : seule son arête du dessus se
 * ramollit — un sommet arrondi, dans la même glace — et deux ou trois coulées
 * de longueurs inégales pendent sur la face avant ; une perle d'eau se forme
 * au bout de la plus longue. Tiré de la game : chaque bloc fond à sa façon.
 */
function Fonte({ graine }: { graine: number }) {
  const { d, perle } = useMemo(() => {
    let a = (graine * 2654435761) >>> 0;
    const rnd = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Le sommet : arrondi à gauche, le dessus qui monte vers l'arrière, arrondi à droite.
    let chemin = 'M0 30 C0 17 4 13 14 12 C38 10 58 8 74 5 C88 2 97 3 100 9 L100 30';
    // Le bas, de droite à gauche : une ligne d'eau, et les coulées.
    const coulees = [0, 1, 2]
      .map((k) => ({ x: 12 + k * 22 + rnd() * 12, l: 6 + rnd() * (k === 1 ? 22 : 14), w: 4 + rnd() * 3 }))
      .sort((p, q) => q.x - p.x);
    let x0 = 100;
    for (const c of coulees) {
      const milieu = (x0 + c.x + c.w) / 2;
      chemin += ` Q${milieu.toFixed(1)} ${(27 + rnd() * 3).toFixed(1)} ${(c.x + c.w).toFixed(1)} 30 C${(c.x + c.w).toFixed(1)} ${(30 + c.l).toFixed(1)} ${(c.x - c.w).toFixed(1)} ${(30 + c.l).toFixed(1)} ${(c.x - c.w).toFixed(1)} 30`;
      x0 = c.x - c.w;
    }
    chemin += ` L${Math.min(x0, 6).toFixed(1)} 30 L0 30 Z`;
    const longue = coulees.reduce((m, c) => (c.l > m.l ? c : m));
    return { d: chemin, perle: { x: longue.x, y: 30 + longue.l } };
  }, [graine]);
  const id = `fonte-${graine}`;
  return (
    <svg className="saison-fonte" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--neige-1)' }} />
          <stop offset="0.3" style={{ stopColor: 'var(--frost)' }} />
          <stop offset="1" style={{ stopColor: 'var(--ice)' }} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
      {/* Le côté du sommet, à l'ombre, comme le côté du bloc. */}
      <path d="M80 4 C90 2 97 3 100 9 L100 30 L80 30 Z" className="fonte-cote" />
      {/* L'arête mouillée, qui prend la lumière. */}
      <path d="M2 18 C4 13 8 12 14 12 C38 10 58 8 74 5" className="fonte-arete" />
      <ellipse className="fonte-perle" cx={perle.x} cy={perle.y + 3} rx="3.2" ry="3" />
    </svg>
  );
}

/** Le podium d'une game : la couronne, une médaille, ou rien. */
function Podium({ place, id, className = 'h-4 w-4' }: { place: number | null; id: string; className?: string }) {
  if (place === 1) return <CouronneGlace className={className} id={`couronne-${id}`} />;
  if (place === 2 || place === 3)
    return <MedailleGlace rang={place} className={className} id={`medaille-${id}`} pleine />;
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

/** L'illustration d'une carte, en fond de sa case : la vignette de 200 px suffit. */
const illustration = (cardId: string) => cardVignettes(cardId)?.petite ?? cardArt(cardId);

/** Le Joker du catalogue : son illustration habille une game passée au Joker. */
const JOKER = 'joker-givre';

/* ================================ Les colonnes ================================ */

/**
 * Un bloc-témoin, dans la marge du graphique : une moyenne en glace, à sa
 * hauteur sur la même échelle que les games (12/11/2026). On compare des blocs
 * à des blocs ; rien ne traverse les colonnes. Une game survolée y lit son
 * écart, en direct.
 */
function Temoin({
  nom,
  valeur,
  part,
  ecart,
  ligue = false,
}: {
  nom: string;
  valeur: number;
  part: number;
  /** L'écart de la game survolée à cette moyenne ; null sans survol. */
  ecart: number | null;
  ligue?: boolean;
}) {
  return (
    <span
      className="saison-temoin"
      data-ligue={ligue ? '' : undefined}
      style={{ ['--part' as string]: part } as CSSProperties}
    >
      <span className="saison-bloc saison-fantome">
        <b className="saison-temoin-valeur num" data-sens={ecart === null ? undefined : ecart >= 0 ? 'haut' : 'bas'}>
          {ecart === null ? decimal(valeur) : signe(ecart)}
        </b>
      </span>
      <small className="saison-temoin-nom">
        {nom === 'Sa moy.' ? (
          <>
            <span className="saison-temoin-long">Sa moy.</span>
            <span className="saison-temoin-court">Moy.</span>
          </>
        ) : (
          nom
        )}
      </small>
    </span>
  );
}

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
  const cases = useMemo(() => creneauxDe(chronologie, creneaux), [chronologie, creneaux]);
  const total = cases.length;
  const comptees = chronologie.filter((g) => !g.skipped);
  const fin = Math.max(creneaux, comptees.length);
  const xPalier = cases.findIndex((c) => c.numero === palier);
  // De la marge au-dessus de la meilleure game : sa couronne tient dans le graphique.
  const echelle = graduations(Math.max(1, moyenneLigue ?? 0, ...chronologie.map((g) => g.score)) * 1.18);
  /**
   * Chaque game garde une largeur lisible : sur un écran trop étroit pour toute
   * la saison, les colonnes défilent, ouvertes sur les dernières games.
   */
  const defile = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = defile.current;
    if (!d) return;
    // Ouvert sur la dernière game jouée — pas sur les créneaux vides de la fin.
    const colonne = d.scrollWidth / Math.max(1, total);
    d.scrollLeft = Math.max(0, (chronologie.length + 2) * colonne - d.clientWidth);
  }, [chronologie.length, total]);
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

  const g = survolee !== null ? (chronologie[survolee] ?? null) : null;
  /**
   * La bulle vit hors du défilement des colonnes — qui la couperait sur la
   * première et la dernière game —, posée sur la zone du graphique au-dessus
   * de la colonne survolée, et rabattue à l'intérieur près d'un bord.
   */
  const zone = useRef<HTMLDivElement>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const [ancre, setAncre] = useState(0);
  const survole = (i: number, el: HTMLElement) => {
    const z = zone.current?.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    if (z) setAncre(c.left + c.width / 2 - z.left);
    setSurvolee(i);
  };
  useLayoutEffect(() => {
    const b = bulle.current;
    const z = zone.current;
    if (!b || !z) return;
    const marge = 4;
    const gauche = Math.min(Math.max(ancre - b.offsetWidth / 2, marge), z.clientWidth - b.offsetWidth - marge);
    b.style.left = `${Math.max(marge, gauche)}px`;
    b.style.visibility = 'visible';
  }, [ancre, survolee]);

  return (
    <div className="saison">
      <figure className="saison-graphe">
        <figcaption className="saison-titre">
          <span>Points par game</span>
          <span className="saison-legende" aria-hidden="true">
            <span>
              <IconCarte className="h-4 w-4 text-aurora" /> carte jouée
            </span>
            <span>
              <i className="saison-creux" /> Joker
            </span>
          </span>
        </figcaption>

        <div className="saison-zone" ref={zone}>
          <div className="saison-axe" aria-hidden="true">
            {echelle.map((v) => (
              <span key={v} style={{ ['--y' as string]: v / haut } as CSSProperties}>
                {v}
              </span>
            ))}
          </div>
          <div className="saison-defile" ref={defile}>
          <div
            className="saison-colonnes"
            style={{ ['--total' as string]: total } as CSSProperties}
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
            {palier < fin && xPalier >= 0 && (
              <i
                className="saison-palier"
                style={{ ['--x' as string]: (xPalier + 1) / total } as CSSProperties}
                aria-hidden="true"
              >
                <span>Finisseur</span>
              </i>
            )}
            {cases.map(({ game: c, numero }, i) => {
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
                  // La bulle : au survol d'une souris, ou au clavier — jamais au
                  // toucher, où le détail s'ouvre en bas de l'écran.
                  onPointerEnter={(e) => e.pointerType === 'mouse' && survole(i, e.currentTarget)}
                  onFocus={(e) => e.currentTarget.matches(':focus-visible') && survole(i, e.currentTarget)}
                  onBlur={() => setSurvolee(null)}
                  onClick={() => onChoisit(c.id)}
                  aria-label={c.skipped ? 'Game passée au Joker' : `Game ${numero} : ${pts(c.score)}`}
                  style={{ ['--part' as string]: c.skipped ? 0 : part(c.score) } as CSSProperties}
                >
                  <span className="saison-bloc" />
                  {(survolee === i || choisie === c.id) && !c.skipped && <Fonte graine={i + 1} />}
                  {c.applied.length > 0 && (
                    <span
                      className="saison-carte"
                      data-malus={c.applied.reduce((s, a) => s + a.points, 0) < 0 ? '' : undefined}
                    >
                      <IconCarte className="h-full w-full" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>
          {g && survolee !== null && (
            <div
              ref={bulle}
              className="saison-bulle"
              style={{ visibility: 'hidden' }}
              role="status"
            >
              <b>
                {g.skipped ? 'Joker · ne compte pas' : `Game ${cases[survolee]?.numero} · ${pts(g.score)}`}
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
              {!g.skipped && (
                <span className="saison-bulle-ecarts">
                  <span data-sens={g.score >= moyenne ? 'haut' : 'bas'}>{signe(g.score - moyenne)}</span> vs sa
                  moyenne
                  {moyenneLigue !== null && (
                    <>
                      {' · '}
                      <span data-sens={g.score >= moyenneLigue ? 'haut' : 'bas'}>{signe(g.score - moyenneLigue)}</span>{' '}
                      vs la ligue
                    </>
                  )}
                </span>
              )}
            </div>
          )}
          {/* Les deux moyennes, en blocs-témoins sur la même échelle que les games. */}
          <div className="saison-marge" aria-hidden="true">
            <Temoin
              nom="Sa moy."
              valeur={moyenne}
              part={part(moyenne)}
              ecart={g && !g.skipped ? g.score - moyenne : null}
            />
            {moyenneLigue !== null && (
              <Temoin
                nom="Ligue"
                valeur={moyenneLigue}
                part={part(moyenneLigue)}
                ecart={g && !g.skipped ? g.score - moyenneLigue : null}
                ligue
              />
            )}
          </div>
        </div>
        <div className="saison-abscisse" aria-hidden="true">
          <span className="saison-abscisse-bord">Game 1</span>
          <span>
            {comptees.length} jouée{comptees.length > 1 ? 's' : ''} sur {fin}
          </span>
          <span className="saison-abscisse-glisse">← glisse pour remonter</span>
          <span className="saison-abscisse-bord">Game {fin}</span>
        </div>
      </figure>

      <dl className="saison-forme">
        <div>
          <dt>Forme</dt>
          <dd className="num">{decimal(forme.moyenneCinq)}</dd>
          <p>
            pts sur ses {forme.cinq} dernières
            <br />
            <b data-sens={forme.moyenneCinq >= moyenne ? 'haut' : 'bas'}>{signe(forme.moyenneCinq - moyenne)}</b> vs sa
            moyenne
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
  const cases = creneauxDe(chronologie, creneaux);
  const comptees = chronologie.filter((g) => !g.skipped).length;
  return (
    <ol className="grille-games" aria-label={`Ses games : ${comptees} jouées sur ${Math.max(creneaux, comptees)}`}>
      {cases.map(({ game: g, numero }, i) => {
        const repere =
          numero === null
            ? undefined
            : numero === palier
              ? 'finisseur'
              : uneParSessionApres !== null && numero > uneParSessionApres
                ? 'session'
                : undefined;
        if (!g) {
          return (
            <li key={`vide-${numero ?? i}`}>
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
        const fond = g.skipped ? illustration(JOKER) : carte ? illustration(carte.cardId) : null;
        return (
          <li key={g.id}>
            <button
              type="button"
              className="case"
              data-carte={fond ? '' : undefined}
              data-joker={g.skipped ? '' : undefined}
              data-podium={place ?? undefined}
              data-extreme={extreme}
              data-repere={repere}
              data-eteinte={garde(g) ? undefined : ''}
              aria-pressed={choisie === g.id}
              onClick={() => onChoisit(g.id)}
              aria-label={`${g.skipped ? 'Game passée au Joker' : `Game ${numero} : ${pts(g.score)}`}${
                g.placement !== null ? `, Top ${g.placement}` : ''
              }${carte ? `, ${getCard(carte.cardId)?.name ?? ''} ${effetCourt(carte.cardId, carte.points)}` : ''}`}
            >
              {fond && <span className="case-fond" style={{ backgroundImage: `url("${fond}")` }} aria-hidden="true" />}
              <span className="case-tete">
                {extreme ? (
                  <span className="case-extreme">
                    {extreme === 'meilleure' ? (
                      <IconEtoile className="case-extreme-icone" />
                    ) : (
                      <IconChute className="case-extreme-icone" />
                    )}
                    {extreme === 'meilleure' ? 'Meilleure' : 'Pire'}
                  </span>
                ) : (
                  <span className="case-num">{numero}</span>
                )}
                {place && !extreme && (
                  <span className="case-podium">
                    <Podium place={place} id={`case-${g.id}`} className="h-full w-full" />
                  </span>
                )}
              </span>
              <span className="case-milieu">
                <b className="case-score num">{g.skipped ? '—' : g.score}</b>
                {/* Sous un bandeau, le podium descend à côté du score, sur le fond sombre. */}
                {place && extreme && (
                  <span className="case-podium">
                    <Podium place={place} id={`case-${g.id}`} className="h-full w-full" />
                  </span>
                )}
              </span>
              <span className="case-pied">
                {g.skipped ? (
                  <span className="case-joker">
                    <IconJoker className="h-3.5 w-3.5" />
                    Joker
                  </span>
                ) : carte ? (
                  <span className="case-carte">
                    <IconCarte className="h-3.5 w-3.5" />
                    <span className="case-carte-nom">{getCard(carte.cardId)?.name}</span>
                    {/* Ce que la carte a fait : rien, si elle n'a rien fait. */}
                    {effetCourt(carte.cardId, carte.points) !== '±0' && (
                      <b
                        className="case-gain"
                        data-malus={carte.points < 0 ? '' : undefined}
                        data-mot={/^[+−]/.test(effetCourt(carte.cardId, carte.points)) ? undefined : ''}
                      >
                        {effetCourt(carte.cardId, carte.points)}
                        {/^[+−]/.test(effetCourt(carte.cardId, carte.points)) && (
                          <span className="case-gain-unite"> pts</span>
                        )}
                      </b>
                    )}
                  </span>
                ) : (
                  <span className="case-place">
                    {g.placement !== null ? `Top ${g.placement}` : 'Pas top'}
                    <span className="case-kills">
                      {' · '}
                      {g.kills}
                      <CraneGlace className="case-crane" />
                    </span>
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ================================== Le détail ================================== */

/**
 * Sous 1 500 px, le détail s'ouvre en feuille, posée sur l'écran. Elle passe
 * par un portail : le verre du panneau (son flou) la retiendrait sinon au bas
 * du panneau, hors de vue.
 */
function useEcranEtroit(): boolean {
  const [etroit, setEtroit] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 1499px)');
    const suit = () => setEtroit(m.matches);
    suit();
    m.addEventListener('change', suit);
    return () => m.removeEventListener('change', suit);
  }, []);
  return etroit;
}

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
  const etroit = useEcranEtroit();
  const [historique, setHistorique] = useState(false);
  useEffect(() => setHistorique(false), [game?.id]);
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFerme();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert, onFerme]);

  // En feuille : seulement ouverte, et posée sur l'écran.
  const pose = (contenu: ReactNode) => (etroit ? (ouvert ? createPortal(contenu, document.body) : null) : contenu);

  if (!game) {
    return pose(
      <aside className="detail-game" data-vide="">
        <p className="detail-vide">Choisis une game dans les colonnes ou dans la grille.</p>
      </aside>,
    );
  }
  const place = podiumDe(game);
  // Sur une game passée au Joker, le Joker est déjà montré : pas deux fois.
  const cartes = game.skipped ? cartesDe(game).filter((c) => c.cardId !== JOKER) : cartesDe(game);
  return pose(
    <>
      {ouvert && <div className="detail-voile" onClick={onFerme} aria-hidden="true" />}
      <aside className="detail-game" data-ouvert={ouvert ? '' : undefined} aria-label={`La game ${numero}`}>
        <header className="detail-tete">
          <span>
            <b>{game.skipped ? 'Joker' : `Game ${numero}`}</b>
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
          <div className="detail-carte">
            <span className="detail-carte-visuel">
              {getCard(JOKER) && (
                <CardFrame
                  cardId={JOKER}
                  name={getCard(JOKER)!.name}
                  rarity={getCard(JOKER)!.rarity}
                  glyph={getCard(JOKER)!.glyph}
                  largeur="110px"
                />
              )}
            </span>
            <span className="detail-carte-texte">
              <small>Joker</small>
              <b>{getCard(JOKER)?.name ?? 'Joker'}</b>
              <span className="detail-carte-resultat">Servi à la saisie : cette game ne compte pas.</span>
            </span>
          </div>
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

        <div className="detail-boutons">
          <button type="button" className="btn btn-sm" onClick={() => setHistorique(true)}>
            Historique{game.historique.length > 0 ? ` · ${game.historique.length}` : ''}
          </button>
          {moderation && (
            <button type="button" className="btn btn-sm detail-corriger" onClick={() => onCorrige(game)}>
              <IconCrayon className="h-4 w-4" />
              Corriger ou supprimer
            </button>
          )}
        </div>
      </aside>
      {historique && (
        <HistoriqueGame
          game={game}
          titre={game.skipped ? 'Game passée au Joker' : `Game ${numero}`}
          onClose={() => setHistorique(false)}
        />
      )}
    </>,
  );
}

/* ================================= L'historique ================================= */

/**
 * Tout ce qui est arrivé à une game (13/11/2026) : sa saisie, puis chaque carte
 * passée dessus — du Perso, d'un Commu, d'un Folie, d'un Finisseur, un
 * échange, un clone, un Pacte —, d'où elle vient, quand, et ce qu'elle a fait.
 */
function HistoriqueGame({ game, titre, onClose }: { game: GameDuJoueur; titre: string; onClose: () => void }) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose]);
  const parCartes = game.historique.reduce((s, e) => s + e.points, 0);
  const base = game.score - parCartes;
  return createPortal(
    <div className="fenetre-voile historique-voile" role="dialog" aria-modal="true" aria-labelledby="histo-titre" onClick={onClose}>
      <div className="fenetre-carte histo-game glass" onClick={(e) => e.stopPropagation()}>
        <header className="histo-tete">
          <span className="min-w-0 flex-1">
            <p className="histo-sur">Historique</p>
            <h2 id="histo-titre">{titre}</h2>
          </span>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Fermer" autoFocus>
            ✕
          </button>
        </header>
        <ol className="histo-liste">
          <li className="histo-ligne" data-saisie="">
            <span className="histo-pastille">
              <CraneGlace className="h-5 w-5" />
            </span>
            <span className="histo-texte">
              <b>Game saisie</b>
              <span>
                {game.placement !== null ? `Top ${game.placement}` : 'Pas top'} · {game.kills} kill
                {game.kills > 1 ? 's' : ''}
              </span>
              <small>{shortDateTime(game.playedAt)}</small>
            </span>
            <span className="histo-points num">{game.skipped ? '—' : pts(base)}</span>
          </li>
          {game.historique.map((e, i) => (
            <li key={i} className="histo-ligne">
              <span className="histo-visuel">
                <CardFrame cardId={e.cardId} name={e.nom} rarity={e.rarity} glyph={e.glyph} nature={e.nature} largeur="44px" />
              </span>
              <span className="histo-texte">
                <b>
                  {e.nom}
                  {e.booster && <em className="histo-booster">{e.booster.replace(/^Booster\s+/, '')}</em>}
                </b>
                {e.texte && <span>{e.texte}</span>}
                <small>{shortDateTime(e.le)}</small>
              </span>
              <span className="histo-points num" data-sens={e.points > 0 ? 'haut' : e.points < 0 ? 'bas' : undefined}>
                {e.points === 0 ? '±0' : `${e.points > 0 ? '+' : '−'}${Math.abs(e.points)}`}
              </span>
            </li>
          ))}
        </ol>
        <p className="histo-total">
          {game.skipped ? (
            'Joker servi : cette game ne compte pas.'
          ) : (
            <>
              Score de la game : <b className="num">{pts(game.score)}</b>
            </>
          )}
        </p>
      </div>
    </div>,
    document.body,
  );
}
