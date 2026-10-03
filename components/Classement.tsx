'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CouronneGlace } from '@/components/CouronneGlace';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { CardFrame } from '@/components/CardFrame';
import { FicheCarte } from '@/components/FicheCarte';
import { flakesShort } from '@/components/ui';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { RankingRow } from '@/lib/services/league';

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

type Cle =
  | 'rang'
  | 'pseudo'
  | 'carte'
  | 'points'
  | 'games'
  | 'moyenne'
  | 'kills'
  | 'top1'
  | 'meilleure'
  | 'flocons';

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
      return row.carte ? RARITY_ORDER[row.carte.rarity] + 1 : 0;
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
const plat = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * `outils` : ce que la modération pose dans l'entête, à côté de la recherche
 * — la saisie par capture. Pour tout le monde d'autre, rien.
 */
/** Les Boosters Perso en attente de chaque joueur — pour la modération seulement. */
export interface BoostersPersoModeration {
  parJoueur: Record<string, number>;
  /** Le joueur derrière la session : personne ne règle les siens. */
  moiId: string | null;
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
  /** La ligne dont on regarde la carte en grand, s'il y en a une. */
  const [fiche, setFiche] = useState<RankingRow | null>(null);

  const visibles = useMemo(() => {
    const q = plat(recherche.trim());
    const filtrees = q ? rows.filter((r) => plat(r.pseudo).includes(q)) : rows;
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
    setTri((t) =>
      t.cle === cle ? { cle, desc: !t.desc } : { cle, desc: cle !== 'rang' && cle !== 'pseudo' },
    );

  return (
    <section className="glass tableau-verre @container relative" aria-label="Classement général">
      <SnowCap radius="var(--r-lg)" seed="classement" />

      {fiche?.carte && (
        <FicheCarte
          carte={fiche.carte}
          legende={
            <>
              Carte active de <strong className="text-ink">{fiche.pseudo}</strong> : elle tombera
              sur sa prochaine game.
            </>
          }
          onClose={() => setFiche(null)}
        />
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
                  <CarteActive row={row} onOuvrir={() => setFiche(row)} />
                </td>
                <td className="num text-right text-ink">
                  {/* La taille sur le chiffre, pas sur la cellule : la règle des
                      cellules du tableau l'emporterait. */}
                  <span className="font-display text-[26px] leading-none font-black @min-[100rem]:text-[34px]">
                    {row.totals.totalScore}
                  </span>
                </td>
                <td className="num text-right text-ink-2">{row.totals.countedGames}</td>
                <td className="tableau-verre-secondaire num text-right text-ink-2">{row.totals.averageScore}</td>
                <td className="num text-right text-ink-2">{row.totals.totalKills}</td>
                <td className="num text-center text-ink-2">
                  <Podiums totals={row.totals} />
                </td>
                <td className="tableau-verre-secondaire num text-right text-ink-2">{row.totals.bestScore}</td>
                <td className="num text-right text-ink-2">{flakesShort(row.snowflakes)}</td>
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
                  {row.carte && (
                    <span className="mt-1.5 block">
                      <CarteActive row={row} onOuvrir={() => setFiche(row)} />
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="num block font-display text-[26px] leading-none font-black text-ink">
                    {row.totals.totalScore}
                  </span>
                  <span className="block text-[13px] tracking-[0.12em] text-faint uppercase">points</span>
                </span>
              </summary>
              <dl className="tableau-verre-detail grid grid-cols-3 gap-x-3 gap-y-2 px-4 pt-2.5 pb-3.5 text-[13px]">
                <Detail label="Games" valeur={row.totals.countedGames} />
                <Detail label="Kills" valeur={row.totals.totalKills} />
                <Detail label="Moyenne" valeur={row.totals.averageScore} />
                <Detail label="Top 1/2/3" valeur={<Podiums totals={row.totals} />} />
                <Detail label="Meilleure" valeur={row.totals.bestScore} />
                <Detail label="Flocons" valeur={flakesShort(row.snowflakes)} />
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
  if (rang === 2 || rang === 3) return <MedailleGlace rang={rang} className={`mx-auto ${taille}`} id={`medaille-${rang}-${ou}`} />;
  return <span className="num font-display text-[20px] font-black text-muted @min-[100rem]:text-[24px]">{rang}</span>;
}

function Pseudo({ row }: { row: RankingRow }) {
  return (
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
  );
}

/**
 * Le compteur de Boosters Perso d'un joueur, sous son pseudo — pour la
 * modération seulement : − en retire un, + en ajoute un.
 *
 * Les subs payés y mettent d'office ce qu'ils valent, à qui les a payés. Quand
 * celui-là veut offrir le sien à un autre, la modération fait − chez lui et +
 * chez l'autre. Personne ne règle les siens : la route le refuse, et les
 * boutons sont grisés. Le compteur est dans une ligne qu'on déplie sur un
 * téléphone : un appui ne doit pas la plier, d'où l'arrêt de l'évènement.
 */
function CompteurPerso({ row, moderation }: { row: RankingRow; moderation: BoostersPersoModeration }) {
  const router = useRouter();
  const [n, setN] = useState(moderation.parJoueur[row.id] ?? 0);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const soi = row.id === moderation.moiId;

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
      <span
        className="compteur-perso compteur-perso-classement"
        data-vide={n === 0 ? '' : undefined}
        title={soi ? 'Tes propres Boosters Perso se règlent par un autre membre de la modération.' : undefined}
      >
        <span className="compteur-perso-libelle">
          <span className="num">{n}</span> Booster{n > 1 ? 's' : ''} Perso
        </span>
        <button
          type="button"
          aria-label={`Retirer un Booster Perso à ${row.pseudo}`}
          disabled={occupe || soi || n === 0}
          onClick={(e) => regle('moins', e)}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Ajouter un Booster Perso à ${row.pseudo}`}
          disabled={occupe || soi}
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
function CarteActive({ row, onOuvrir }: { row: RankingRow; onOuvrir: () => void }) {
  if (!row.carte) return <span className="text-[13px] text-faint">—</span>;
  const c = row.carte;
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="tableau-verre-carte-active flex min-w-0 items-center gap-3 text-left"
      title={`${c.nom} — ${c.description}`}
      aria-label={`Voir la carte ${c.nom}`}
    >
      <span className="w-[46px] shrink-0 @min-[100rem]:w-[56px]">
        <CardFrame
          cardId={c.cardId}
          name={c.nom}
          description={c.description}
          rarity={c.rarity}
          glyph={c.glyph}
          nature={c.nature}
        />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[14px] font-bold text-ink @min-[100rem]:text-[16px]">{c.nom}</span>
        <span className="block truncate text-[13px] text-ink-2 @min-[100rem]:text-[15px]">{c.action}</span>
        <span className="block text-[13px] text-muted @min-[100rem]:text-[14px]">{c.resume}</span>
      </span>
    </button>
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

function Detail({ label, valeur }: { label: string; valeur: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">{label}</dt>
      <dd className="num mt-0.5 text-[14px] text-ink-2">{valeur}</dd>
    </div>
  );
}
