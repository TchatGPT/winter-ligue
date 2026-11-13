'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CouronneGlace } from '@/components/CouronneGlace';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { CardFrame } from '@/components/CardFrame';
import { FicheCarte } from '@/components/FicheCarte';
import { LancerPacte } from '@/components/LancerPacte';
import { LancerVerglas } from '@/components/LancerVerglas';
import { IconActivision } from '@/components/icons';
import { flakes } from '@/components/ui';
import { multiplicateurChance, RARITY_ORDER } from '@/lib/domain/rules';
import { memeTexte, pourChercher } from '@/lib/domain/texte';
import type { CarteDuClassement, CarteGardee, RankingRow } from '@/lib/services/league';

/**
 * Le classement, dans le langage visuel du hero.
 *
 * Le conteneur est une plaque `.glass`, la même classe que les blocs du hero :
 * même dégradé de surface, même biseau conique, mêmes arêtes internes, même
 * rayon, même flou d'arrière-plan — et la même neige sur l'arête haute, avec
 * une autre graine. Rien de cela n'est redéfini ici : si la matière du site
 * change, le classement suit.
 *
 * Ce qui est propre au tableau vit dans `.tableau-verre` : les arêtes entre
 * les lignes, la bande d'en-tête, le survol, l'or des qualifiés.
 *
 * ## Trier et chercher
 *
 * Chaque en-tête de colonne trie ; un second clic inverse. Le rang affiché
 * reste le rang réel de la saison, quel que soit le tri — trier par kills ne
 * fait pas d'un cinquième un premier. La recherche filtre par pseudo, sans
 * accent ni casse. Le tableau défile dans sa plaque au-delà de 72 % de
 * l'écran, l'en-tête collé en haut : cent joueurs tiennent sans que la page
 * s'allonge. Sur un très grand écran, à droite du hero et des subs, il
 * descend aussi bas qu'eux, et ses lignes s'agrandissent avec la place.
 *
 * Le tableau se règle sur sa propre largeur, pas sur celle de la fenêtre :
 * sous 1 200 px, la moyenne et la meilleure game s'effacent et les cellules se
 * resserrent ; sous 896 px, chaque joueur devient une ligne de liste, dans la
 * plaque, séparée de la suivante par l'arête du tableau — rang, pseudo et
 * points visibles, le reste derrière un dépli. Pas de tuile par joueur : une
 * liste, pas une pile de cartes. Au-delà de 1 600 px, les lignes s'agrandissent.
 */

type Cle = 'rang' | 'pseudo' | 'carte' | 'points' | 'games' | 'moyenne' | 'kills' | 'top1' | 'meilleure' | 'flocons';

/**
 * `secondaire` : une colonne qui s'efface quand le tableau manque de place.
 * La moyenne se déduit des points et des games ; la meilleure game se lit sur
 * la fiche du joueur.
 */
const COLONNES: {
  cle: Cle;
  libelle: string;
  align: 'left' | 'right' | 'center';
  large?: string;
  secondaire?: boolean;
}[] = [
  { cle: 'rang', libelle: 'Rang', align: 'center', large: 'w-16' },
  { cle: 'pseudo', libelle: 'Joueur', align: 'left' },
  { cle: 'carte', libelle: 'Carte active', align: 'left' },
  { cle: 'points', libelle: 'Points', align: 'right' },
  { cle: 'games', libelle: 'Games', align: 'right' },
  { cle: 'moyenne', libelle: 'Moy.', align: 'right', secondaire: true },
  { cle: 'kills', libelle: 'Kills', align: 'right' },
  { cle: 'top1', libelle: 'Top 1 / 2 / 3', align: 'center' },
  { cle: 'meilleure', libelle: 'Meilleure', align: 'right', secondaire: true },
  { cle: 'flocons', libelle: 'Flocons', align: 'right' },
];

/** La valeur d'une ligne pour une colonne, telle qu'on la compare. */
function valeur(row: RankingRow, cle: Cle): number | string {
  switch (cle) {
    case 'rang':
      return row.rank;
    case 'pseudo':
      return row.pseudo.toLowerCase();
    case 'carte':
      // les cartes se classent par rareté ; sans carte, tout en bas
      return row.carte ? RARITY_ORDER[row.carte.rarity] + 1 : row.gardees[0] ? RARITY_ORDER[row.gardees[0].rarity] + 1 : 0;
    case 'points':
      return row.totals.totalScore;
    case 'games':
      return row.totals.countedGames;
    case 'moyenne':
      return row.totals.averageScore;
    case 'kills':
      return row.totals.totalKills;
    case 'top1':
      // le podium se compare Top 1 d'abord, puis Top 2, puis Top 3
      return row.totals.top1 * 1_000_000 + row.totals.top2 * 1_000 + row.totals.top3;
    case 'meilleure':
      return row.totals.bestScore;
    case 'flocons':
      return row.snowflakes;
  }
}

/** Sans accent ni casse, pour que « Boreal » trouve « Boréal ». */
const plat = pourChercher;

/**
 * `outils` : ce que la modération pose dans l'entête, à côté de la recherche
 * — la saisie par capture. Pour tout le monde d'autre, rien.
 */
/** Les Boosters Perso en attente de chaque joueur — pour la modération seulement. */
export interface BoostersPersoModeration {
  parJoueur: Record<string, number>;
}

export function Classement({
  rows,
  outils,
  boostersPerso,
}: {
  rows: RankingRow[];
  outils?: React.ReactNode;
  boostersPerso?: BoostersPersoModeration;
}) {
  const [tri, setTri] = useState<{ cle: Cle; desc: boolean }>({ cle: 'rang', desc: false });
  const [recherche, setRecherche] = useState('');
  /** La carte qu'on regarde en grand, s'il y en a une : la carte active, ou une carte gardée. */
  const [fiche, setFiche] = useState<{ row: RankingRow; carte: CarteDuClassement | CarteGardee } | null>(null);
  const ouvre = (row: RankingRow, carte: CarteDuClassement | CarteGardee) => {
    setFige({ busy: false, texte: null, erreur: false });
    setFiche({ row, carte });
  };
  /** Le Verglas que la modération lance, s'il y en a un : sa fenêtre remplace la fiche. */
  const [verglas, setVerglas] = useState<{ carte: CarteGardee; porteur: RankingRow } | null>(null);
  const [pacte, setPacte] = useState<{ carteId: string; porteur: RankingRow } | null>(null);
  const router = useRouter();
  /** La Cryogénisation en cours d'envoi, et ce que le serveur en a dit. */
  const [fige, setFige] = useState<{ busy: boolean; texte: string | null; erreur: boolean }>({
    busy: false,
    texte: null,
    erreur: false,
  });

  async function joueCryogenisation(carteId: string) {
    setFige({ busy: true, texte: null, erreur: false });
    try {
      const reponse = await fetch('/api/admin/cartes/figer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carteId }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setFige({ busy: false, texte: charge.error?.message ?? 'Refusé.', erreur: true });
        return;
      }
      setFige({ busy: false, texte: charge.data?.resultat ?? 'Game figée.', erreur: false });
      router.refresh();
    } catch {
      setFige({ busy: false, texte: 'Le serveur n’a pas répondu.', erreur: true });
    }
  }

  const visibles = useMemo(() => {
    const q = plat(recherche.trim());
    // Le pseudo Twitch ou le pseudo en jeu : on cherche un joueur par l'un ou l'autre.
    const filtrees = q
      ? rows.filter((r) => plat(r.pseudo).includes(q) || plat(r.activisionId ?? '').includes(q))
      : rows;
    const sens = tri.desc ? -1 : 1;
    return [...filtrees].sort((a, b) => {
      const va = valeur(a, tri.cle);
      const vb = valeur(b, tri.cle);
      if (va < vb) return -1 * sens;
      if (va > vb) return 1 * sens;
      return a.rank - b.rank;
    });
  }, [rows, tri, recherche]);

  /** Un clic trie ; sur la même colonne, il inverse. Les nombres descendent d'abord. */
  const trier = (cle: Cle) =>
    setTri((t) => (t.cle === cle ? { cle, desc: !t.desc } : { cle, desc: cle !== 'rang' && cle !== 'pseudo' }));

  return (
    <section
      className="glass tableau-verre @container relative"
      aria-label="Classement général"
      data-moderation={boostersPerso ? '' : undefined}
    >
      <SnowCap radius="var(--r-lg)" seed="classement" />

      {fiche && (
        <FicheCarte
          carte={fiche.carte}
          legende={
            fiche.carte.genre === 'joker' ? (
              <>
                {nombreDeJokers(fiche.row) > 1 ? `${nombreDeJokers(fiche.row)} Jokers` : 'Joker'} de{' '}
                <strong className="text-ink">{fiche.row.pseudo}</strong> : à la saisie d’une de ses games, la
                modération pourra la faire ne pas compter.
              </>
            ) : fiche.carte.genre === 'malus_choisi' ? (
              <>
                {fiche.carte.nom} de <strong className="text-ink">{fiche.row.pseudo}</strong> : il choisit sa victime,
                la modération le joue pour lui.
              </>
            ) : fiche.carte.genre === 'fige_garde' ? (
              <>
                {fiche.carte.nom} de <strong className="text-ink">{fiche.row.pseudo}</strong> : il dit quand, la
                modération fige sa meilleure game pour lui.
              </>
            ) : fiche.carte.genre === 'echange_cible' ? (
              <>
                {fiche.carte.nom} de <strong className="text-ink">{fiche.row.pseudo}</strong> : il choisit sa cible, la
                modération fait l’échange pour lui.
              </>
            ) : fiche.carte.genre === 'echange_choisi' ? (
              <>
                Pacte du Givre de <strong className="text-ink">{fiche.row.pseudo}</strong> : il choisit une de ses
                games et une game d’un autre joueur, la modération fait l’échange pour lui.
              </>
            ) : (
              <>
                Carte active de <strong className="text-ink">{fiche.row.pseudo}</strong> : elle tombera sur sa
                prochaine game.
              </>
            )
          }
          action={
            boostersPerso &&
            (fiche.carte.genre === 'malus_choisi' || fiche.carte.genre === 'echange_cible') &&
            'id' in fiche.carte ? (
              <button
                type="button"
                className="btn btn-ice w-full"
                onClick={() => {
                  if (!('id' in fiche.carte)) return;
                  setVerglas({ carte: fiche.carte, porteur: fiche.row });
                  setFiche(null);
                }}
              >
                Jouer {fiche.carte.nom}…
              </button>
            ) : boostersPerso && fiche.carte.genre === 'fige_garde' && 'id' in fiche.carte ? (
              <div className="grid w-full gap-2">
                {fige.texte && (
                  <p className={`text-[14px] ${fige.erreur ? 'text-danger' : 'text-aurora'}`} role="status">
                    {fige.texte}
                  </p>
                )}
                {!fige.texte || fige.erreur ? (
                  <button
                    type="button"
                    className="btn btn-ice w-full"
                    disabled={fige.busy}
                    onClick={() => 'id' in fiche.carte && joueCryogenisation(fiche.carte.id)}
                  >
                    {fige.busy ? 'Envoi…' : `Jouer ${fiche.carte.nom}`}
                  </button>
                ) : null}
              </div>
            ) : boostersPerso && fiche.carte.genre === 'echange_choisi' && 'id' in fiche.carte ? (
              <button
                type="button"
                className="btn btn-ice w-full"
                onClick={() => {
                  if (!('id' in fiche.carte)) return;
                  setPacte({ carteId: fiche.carte.id, porteur: fiche.row });
                  setFiche(null);
                }}
              >
                Jouer le Pacte…
              </button>
            ) : undefined
          }
          onClose={() => setFiche(null)}
        />
      )}

      {verglas && (
        <LancerVerglas
          carte={verglas.carte}
          porteur={verglas.porteur}
          joueurs={rows}
          onClose={() => setVerglas(null)}
        />
      )}

      {pacte && (
        <LancerPacte carteId={pacte.carteId} porteur={pacte.porteur} joueurs={rows} onClose={() => setPacte(null)} />
      )}

      <header className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pt-7 pb-4 sm:px-7">
        <h2 className="font-display text-[30px] leading-none font-black tracking-wide text-ink uppercase sm:text-[34px] @min-[100rem]:text-[40px]">
          Classement
        </h2>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {outils}
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Chercher un joueur</span>
            <input
              type="search"
              className="field tableau-verre-recherche"
              placeholder="Chercher un joueur…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              autoComplete="off"
            />
          </label>
          {/* Avec les tuiles, le tri passe par un menu : il n'y a pas d'en-têtes à cliquer. */}
          <label className="block w-full @min-[56rem]:hidden">
            <span className="sr-only">Trier par</span>
            <select
              className="field"
              value={`${tri.cle}:${tri.desc ? 'd' : 'a'}`}
              onChange={(e) => {
                const [cle, sens] = e.target.value.split(':') as [Cle, 'a' | 'd'];
                setTri({ cle, desc: sens === 'd' });
              }}
            >
              <option value="rang:a">Rang</option>
              <option value="points:d">Points, du plus haut</option>
              <option value="kills:d">Kills, du plus haut</option>
              <option value="moyenne:d">Moyenne, de la plus haute</option>
              <option value="games:d">Games, du plus grand nombre</option>
              <option value="top1:d">Top 1, du plus grand nombre</option>
              <option value="meilleure:d">Meilleure game</option>
              <option value="flocons:d">Flocons, du plus riche</option>
              <option value="pseudo:a">Pseudo, de A à Z</option>
            </select>
          </label>
        </div>
      </header>

      {/* ---------------- Large : la grille ---------------- */}
      <div className="tableau-verre-defile relative hidden @min-[56rem]:block">
        <table className="tableau-verre-table">
          <thead>
            <tr>
              {COLONNES.map((c) => {
                const actif = tri.cle === c.cle;
                return (
                  <th
                    key={c.cle}
                    className={`${c.large ?? ''} text-${c.align} ${c.secondaire ? 'tableau-verre-secondaire' : ''}`}
                    aria-sort={actif ? (tri.desc ? 'descending' : 'ascending') : 'none'}
                  >
                    <button
                      type="button"
                      className={`tableau-verre-tri whitespace-nowrap ${actif ? 'est-actif' : ''}`}
                      onClick={() => trier(c.cle)}
                      title={`Trier par ${c.libelle.toLowerCase()}`}
                    >
                      {c.libelle}
                      <span className="tableau-verre-fleche" aria-hidden="true">
                        {actif ? (tri.desc ? '▼' : '▲') : '△'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((row) => (
              <tr key={row.id} className="tableau-verre-ligne">
                <td className="text-center">
                  <Rang rang={row.rank} />
                </td>
                <td>
                  <Pseudo row={row} />
                  {boostersPerso && <CompteurPerso row={row} moderation={boostersPerso} />}
                </td>
                <td>
                  <CarteActive row={row} onOuvrir={(c) => ouvre(row, c)} />
                </td>
                <td className="num text-right text-ink">
                  {/* La taille sur le chiffre, pas sur la cellule : la règle des
                      cellules du tableau l'emporterait. */}
                  <span className="font-display text-[26px] leading-none font-black @min-[100rem]:text-[34px]">
                    {row.totals.totalScore}
                  </span>
                  {row.totals.horsGame !== 0 && (
                    <span className="mt-1 block text-[12px] whitespace-nowrap text-muted @min-[100rem]:text-[13px]">
                      dont <Bonus points={row.totals.horsGame} /> bonus
                    </span>
                  )}
                </td>
                <td className="num text-right text-ink-2">
                  <SurObjectif row={row} />
                </td>
                <td className="tableau-verre-secondaire num text-right text-ink-2">{row.totals.averageScore}</td>
                <td className="num text-right text-ink-2">{row.totals.totalKills}</td>
                <td className="num text-center text-ink-2">
                  <Podiums totals={row.totals} />
                </td>
                <td className="tableau-verre-secondaire num text-right text-ink-2">{row.totals.bestScore}</td>
                <td className="num text-right text-ink-2">
                  <Flocons solde={row.snowflakes} />
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLONNES.length} className="py-16 text-center text-[15px] text-muted">
                  {rows.length === 0
                    ? 'Aucun joueur au classement pour l’instant : il se remplit à la première game saisie.'
                    : `Aucun joueur ne s’appelle « ${recherche.trim()} ».`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- Étroit : une tuile par joueur ---------------- */}
      <ol className="tableau-verre-liste relative px-1 pb-3 @min-[56rem]:hidden">
        {visibles.map((row) => (
          <li key={row.id} className="tableau-verre-carte">
            <details>
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 select-none">
                <span className="rang-socle" data-podium={row.rank <= 3 ? row.rank : undefined}>
                  <Rang rang={row.rank} taille="h-8 w-8" ou="liste" />
                </span>
                <span className="min-w-0 flex-1">
                  <Pseudo row={row} />
                  {boostersPerso && <CompteurPerso row={row} moderation={boostersPerso} />}
                  {(row.carte || row.gardees.length > 0) && (
                    <span className="mt-1.5 block">
                      <CarteActive row={row} onOuvrir={(c) => ouvre(row, c)} />
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="num block font-display text-[26px] leading-none font-black text-ink">
                    {row.totals.totalScore}
                  </span>
                  <span className="block text-[13px] tracking-[0.12em] text-faint uppercase">points</span>
                  {row.totals.horsGame !== 0 && (
                    <span className="block text-[12px] whitespace-nowrap text-muted">
                      <Bonus points={row.totals.horsGame} /> bonus
                    </span>
                  )}
                </span>
              </summary>
              <dl className="tableau-verre-detail grid grid-cols-3 gap-x-3 gap-y-2 px-4 pt-2.5 pb-3.5 text-[13px]">
                <Detail label="Games" valeur={<SurObjectif row={row} />} />
                <Detail label="Kills" valeur={row.totals.totalKills} />
                <Detail label="Moyenne" valeur={row.totals.averageScore} />
                <Detail label="Top 1/2/3" valeur={<Podiums totals={row.totals} />} />
                <Detail label="Meilleure" valeur={row.totals.bestScore} />
                <Detail label="Flocons" valeur={<Flocons solde={row.snowflakes} />} />
              </dl>
            </details>
          </li>
        ))}
        {visibles.length === 0 && (
          <li className="px-4 py-10 text-center text-[14px] text-muted">
            {rows.length === 0
              ? 'Aucun joueur au classement pour l’instant : il se remplit à la première game saisie.'
              : `Aucun joueur ne s’appelle « ${recherche.trim()} ».`}
          </li>
        )}
      </ol>

      <div className="pb-3" />
    </section>
  );
}

/**
 * Le rang : la couronne gelée du leader pour le premier — la même que dans le
 * hero —, une médaille gelée pour le deuxième et le troisième, un chiffre
 * pour les autres. Le podium se lit avant même qu'on lise les points.
 *
 * Sur mobile, le rang est serti dans un disque gravé (`.rang-socle`), teinté
 * or, argent ou cuivre pour le podium : la glace, transparente, se perdait
 * dans le bleu de la plaque.
 */
function Rang({
  rang,
  taille = 'h-8 w-8 @min-[100rem]:h-10 @min-[100rem]:w-10',
  ou = 'table',
}: {
  rang: number;
  taille?: string;
  /** Le tableau et la liste coexistent dans la page : un `id` de dégradés chacun. */
  ou?: 'table' | 'liste';
}) {
  if (rang === 1) return <CouronneGlace className={`mx-auto ${taille}`} id={`couronne-classement-${ou}`} />;
  if (rang === 2 || rang === 3)
    return <MedailleGlace rang={rang} className={`mx-auto ${taille}`} id={`medaille-${rang}-${ou}`} />;
  return <span className="num font-display text-[20px] font-black text-muted @min-[100rem]:text-[24px]">{rang}</span>;
}

/**
 * Les points bonus : ceux du total qui ne viennent d'aucune game — les cartes
 * « +N pts bonus », moins un Verglas reçu. Déjà comptés dans les points : le
 * tableau et la liste étroite les écrivent sous eux.
 */
function Bonus({ points }: { points: number }) {
  if (points === 0) return <span className="text-faint">—</span>;
  return (
    <b className={points > 0 ? 'text-ice' : 'text-danger'} title="Points bonus, déjà comptés dans les points">
      {points > 0 ? `+${points}` : `−${-points}`}
    </b>
  );
}

/** Le pseudo Twitch, et dessous le pseudo en jeu (Warzone), derrière le logo d'Activision. */
function Pseudo({ row }: { row: RankingRow }) {
  return (
    <span className="block min-w-0">
      <span className="flex min-w-0 items-center gap-2">
        <Link
          href={`/joueurs/${row.slug}`}
          className="truncate font-display text-[18px] font-bold tracking-wide text-ink no-underline hover:text-ice @min-[100rem]:text-[22px]"
        >
          {row.pseudo}
        </Link>
        {row.immunise && (
          <span className="pastille-immunite" title="Immunisé : aucun malus ne touche ses games">
            Immunisé
          </span>
        )}

      </span>
      {row.activisionId && (
        <span className="pseudo-jeu" title="Pseudo Warzone (identifiant Activision)">
          <IconActivision className="pseudo-jeu-logo" />
          <span className="sr-only">Pseudo Warzone : </span>
          <span className="truncate" translate="no">
            {row.activisionId}
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * Le compteur de Boosters Perso d'un joueur, sous son pseudo — pour la
 * modération seulement : − en retire un, + en ajoute un.
 *
 * Les subs payés y mettent d'office ce qu'ils valent, à qui les a payés. Quand
 * celui-là veut offrir le sien à un autre, la modération fait − chez lui et +
 * chez l'autre — y compris sur son propre compte. Le compteur est dans une
 * ligne qu'on déplie sur un
 * téléphone : un appui ne doit pas la plier, d'où l'arrêt de l'évènement.
 */
function CompteurPerso({ row, moderation }: { row: RankingRow; moderation: BoostersPersoModeration }) {
  const router = useRouter();
  const [n, setN] = useState(moderation.parJoueur[row.id] ?? 0);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function regle(sens: 'plus' | 'moins', e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOccupe(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/admin/boosters-perso', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: row.id, sens }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.message ?? 'Action refusée.');
        return;
      }
      setN(charge.data.boostersPerso);
      router.refresh();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <span className="compteur-perso-ligne">
      <span className="compteur-perso compteur-perso-classement" data-vide={n === 0 ? '' : undefined}>
        <span className="compteur-perso-libelle">
          <span className="num">{n}</span> Booster{n > 1 ? 's' : ''} Perso
        </span>
        <button
          type="button"
          aria-label={`Retirer un Booster Perso à ${row.pseudo}`}
          disabled={occupe || n === 0}
          onClick={(e) => regle('moins', e)}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Ajouter un Booster Perso à ${row.pseudo}`}
          disabled={occupe}
          onClick={(e) => regle('plus', e)}
        >
          +
        </button>
      </span>
      {erreur && (
        <span className="compteur-perso-erreur" role="alert">
          {erreur}
        </span>
      )}
    </span>
  );
}

/**
 * La carte active : celle qui tombera sur la prochaine game du joueur.
 *
 * La carte elle-même, en vignette, dans son cadre peint — on la reconnaît à
 * sa silhouette et à sa couleur avant de lire quoi que ce soit. À côté, le nom
 * et l'effet en clair. Un clic l'ouvre en grand.
 */
function CarteActive({
  row,
  onOuvrir,
}: {
  row: RankingRow;
  onOuvrir: (carte: CarteDuClassement | CarteGardee) => void;
}) {
  // La carte active, puis les cartes gardées : plusieurs, l'une sur l'autre.
  // Deux cartes identiques n'en font qu'une, leur nombre en pastille (le
  // 12/11/2026 ; les Jokers, déjà le 02/11). Le Joker est posé en dernier :
  // rien ne couvre sa pastille.
  const uniques = row.gardees.filter((c, i) => row.gardees.findIndex((d) => d.cardId === c.cardId) === i);
  const cartes: (CarteDuClassement | CarteGardee)[] = [
    ...(row.carte ? [row.carte] : []),
    ...uniques.filter((c) => c.genre !== 'joker'),
    ...uniques.filter((c) => c.genre === 'joker'),
  ];
  const nombres = combienDeChaque(row);
  if (cartes.length >= 2)
    return <PileDeCartes pseudo={row.pseudo} cartes={cartes} nombres={nombres} onOuvrir={onOuvrir} />;
  const c = cartes[0];
  if (!c) return <span className="text-[13px] text-faint">—</span>;
  return (
    <button
      type="button"
      onClick={() => onOuvrir(c)}
      className="tableau-verre-carte-active flex min-w-0 items-center gap-3 text-left"
      title={`${c.nom} — ${c.description}`}
      aria-label={`Voir la carte ${c.nom}`}
    >
      <span className="relative w-[46px] shrink-0 @min-[100rem]:w-[56px]">
        <CardFrame
          cardId={c.cardId}
          name={c.nom}
          description={c.description}
          rarity={c.rarity}
          glyph={c.glyph}
          nature={c.nature}
          largeur="56px"
        />
        <PastilleCarte carte={c} nombres={nombres} />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px] font-bold text-ink @min-[100rem]:text-[16px]">{c.nom}</span>
        <span className="block truncate text-[13px] text-ink-2 @min-[100rem]:text-[15px]">{c.action}</span>
        {/* Le résumé, s'il dit plus que l'intitulé : « Game ×1,2 » deux fois ne disait rien de plus. */}
        {!memeTexte(c.resume, c.action) && (
          <span className="block text-[13px] text-muted @min-[100rem]:text-[14px]">{c.resume}</span>
        )}
      </span>
    </button>
  );
}

/** La teinte d'une rareté, pour un texte : celle d'une carte gardée suit la sienne. */
const TEINTE: Record<CarteDuClassement['rarity'], string> = {
  C: 'text-r-c',
  R: 'text-r-r',
  UR: 'text-r-ur',
  L: 'text-r-l',
};

/** Les cartes montrées dans la pile ; au-delà, « +N » ouvre toute sa main. */
const CARTES_VISIBLES = 3;

/**
 * Plusieurs cartes, l'une sur l'autre, un peu décalées : on voit d'un coup
 * d'œil qu'il en a plusieurs, et chacune s'ouvre d'un clic. Trois au plus
 * (13/11/2026) : au-delà, « +N » ouvre toute sa main.
 */
function PileDeCartes({
  pseudo,
  cartes,
  nombres,
  onOuvrir,
}: {
  pseudo: string;
  cartes: (CarteDuClassement | CarteGardee)[];
  /** Combien il en garde de chaque : une carte en double porte son nombre en pastille. */
  nombres: Map<string, number>;
  onOuvrir: (carte: CarteDuClassement | CarteGardee) => void;
}) {
  const [main, setMain] = useState(false);
  const visibles = cartes.slice(0, CARTES_VISIBLES);
  const cachees = cartes.length - visibles.length;
  const [premiere, ...autres] = visibles;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="pile-cartes shrink-0">
        {visibles.map((c, i) => (
          <button
            key={'id' in c ? c.id : `active-${c.cardId}`}
            type="button"
            onClick={() => onOuvrir(c)}
            className="pile-carte w-[46px] @min-[100rem]:w-[56px]"
            data-quoi={i === 0 ? 'carte' : 'joker'}
            title={`${c.nom} — ${c.description}`}
            aria-label={`Voir la carte ${c.nom}`}
          >
            <CardFrame
              cardId={c.cardId}
              name={c.nom}
              description={c.description}
              rarity={c.rarity}
              glyph={c.glyph}
              nature={c.nature}
              largeur="56px"
            />
            <PastilleCarte carte={c} nombres={nombres} />
          </button>
        ))}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px] font-bold text-ink @min-[100rem]:text-[16px]">{premiere.nom}</span>
        <span className="block truncate text-[13px] text-ink-2 @min-[100rem]:text-[15px]">{premiere.action}</span>
        {autres.map((c) => (
          <span
            key={'id' in c ? c.id : c.cardId}
            className={`block truncate text-[13px] font-semibold @min-[100rem]:text-[14px] ${TEINTE[c.rarity]}`}
          >
            + {(nombres.get(c.cardId) ?? 1) > 1 && 'id' in c ? `${nombres.get(c.cardId)} × ${c.nom}` : c.nom}
          </span>
        ))}
        {cachees > 0 && (
          <button type="button" className="pile-plus" onClick={() => setMain(true)}>
            +{cachees} carte{cachees > 1 ? 's' : ''} · tout voir
          </button>
        )}
      </span>
      {main && (
        <MainDuJoueur
          pseudo={pseudo}
          cartes={cartes}
          nombres={nombres}
          onClose={() => setMain(false)}
          onOuvrir={(c) => {
            setMain(false);
            onOuvrir(c);
          }}
        />
      )}
    </span>
  );
}

/**
 * Toute la main d'un joueur (13/11/2026) : ses cartes défilent et se posent
 * l'une après l'autre, comme à l'ouverture d'un booster. Une carte touchée
 * s'ouvre en grand — et la modération peut l'y jouer pour lui.
 */
function MainDuJoueur({
  pseudo,
  cartes,
  nombres,
  onClose,
  onOuvrir,
}: {
  pseudo: string;
  cartes: (CarteDuClassement | CarteGardee)[];
  nombres: Map<string, number>;
  onClose: () => void;
  onOuvrir: (carte: CarteDuClassement | CarteGardee) => void;
}) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [onClose]);
  const total = cartes.reduce((s, c) => s + ('id' in c ? (nombres.get(c.cardId) ?? 1) : 1), 0);
  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-labelledby="main-titre" onClick={onClose}>
      <div className="fenetre-carte main-joueur glass glass-reflet" onClick={(e) => e.stopPropagation()}>
        <header className="main-tete">
          <span className="min-w-0 flex-1">
            <p className="main-sur">Les cartes en main de</p>
            <h2 id="main-titre">{pseudo}</h2>
            <p className="main-compte">
              {total} carte{total > 1 ? 's' : ''} · touche une carte pour la voir en grand
            </p>
          </span>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Fermer" autoFocus>
            ✕
          </button>
        </header>
        <ul className="main-cartes">
          {cartes.map((c, i) => (
            <li key={'id' in c ? c.id : `active-${c.cardId}`} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <button type="button" className="main-carte" onClick={() => onOuvrir(c)} aria-label={`Voir la carte ${c.nom}`}>
                <span className="main-carte-visuel">
                  <CardFrame
                    cardId={c.cardId}
                    name={c.nom}
                    description={c.description}
                    rarity={c.rarity}
                    glyph={c.glyph}
                    nature={c.nature}
                    largeur="160px"
                  />
                  <PastilleCarte carte={c} nombres={nombres} />
                </span>
                <b>{c.nom}</b>
                <small>{'id' in c ? 'gardée' : 'sur sa prochaine game'}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Le solde de flocons, en entier — « 7 680 », pas « 7,68k » —, et dessous la
 * chance qu'il donne aux boosters : son multiplicateur (`PALIERS_CHANCE`).
 * Dans la même colonne : la chance suit le solde, une colonne de plus élargissait
 * le tableau sans rien dire de neuf au tri.
 */
function Flocons({ solde }: { solde: number }) {
  const chance = multiplicateurChance(solde);
  return (
    <>
      <span className="block">{flakes(solde)}</span>
      <span
        className={`block text-[12px] whitespace-nowrap ${chance > 1 ? 'text-aurora' : 'text-muted'}`}
        title="La chance aux boosters, d'après le solde de flocons"
      >
        chance ×{chance.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
      </span>
    </>
  );
}

/** Combien de Jokers garde ce joueur : trois à l'inscription, cinq au plus. */
function nombreDeJokers(row: RankingRow): number {
  return row.gardees.filter((c) => c.genre === 'joker').length;
}

/** Combien il garde de chaque carte. */
function combienDeChaque(row: RankingRow): Map<string, number> {
  const n = new Map<string, number>();
  for (const c of row.gardees) n.set(c.cardId, (n.get(c.cardId) ?? 0) + 1);
  return n;
}

/**
 * Le nombre, sur le coin d'une carte gardée : toujours sur le Joker, et sur
 * toute carte qu'il garde en plusieurs exemplaires (deux Verglas). La carte
 * active, elle, est seule.
 */
function PastilleCarte({
  carte,
  nombres,
}: {
  carte: CarteDuClassement | CarteGardee;
  nombres: Map<string, number>;
}) {
  if (!('id' in carte)) return null;
  const nombre = nombres.get(carte.cardId) ?? 1;
  if (carte.genre !== 'joker' && nombre < 2) return null;
  return (
    <span className="pastille-nombre num" data-taille="petite" aria-label={`${nombre} ${carte.nom}`}>
      <span className="pastille-x">×</span>
      {nombre}
    </span>
  );
}

function Podiums({ totals }: { totals: RankingRow['totals'] }) {
  return (
    <>
      <span className={totals.top1 > 0 ? 'font-bold text-aurora' : 'text-faint'}>{totals.top1}</span>
      <span className="text-faint"> / </span>
      <span className={totals.top2 > 0 ? 'text-ink' : 'text-faint'}>{totals.top2}</span>
      <span className="text-faint"> / </span>
      <span className={totals.top3 > 0 ? 'text-ink-2' : 'text-faint'}>{totals.top3}</span>
    </>
  );
}

/** « 12/35 » : les games jouées, sur le palier du Finisseur, puis sur la fin de la saison. */
function SurObjectif({ row }: { row: RankingRow }) {
  return (
    <span className="whitespace-nowrap" aria-label={`${row.totals.countedGames} games sur ${row.objectifGames}`}>
      {row.totals.countedGames}
      <span className="text-faint">/{row.objectifGames}</span>
    </span>
  );
}

function Detail({ label, valeur }: { label: string; valeur: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">{label}</dt>
      <dd className="num mt-0.5 text-[14px] text-ink-2">{valeur}</dd>
    </div>
  );
}
