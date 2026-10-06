'use client';

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Bloc, Chiffre, Ecran } from '@/components/admin/Cadre';
import { EmptyState, flakes } from '@/components/ui';
import { shortDateTime } from '@/lib/format';

/* ------------------------------- Les données ------------------------------ */

/** Un sub du registre, tel que l'écran le montre. */
export interface SubVue {
  id: string;
  le: string;
  genre: 'sub' | 'resub' | 'cadeau';
  pseudo: string;
  nombre: number;
  niveau: number;
  /** Inscrit à la ligue ; nul pour un cadeau anonyme. */
  inscrit: boolean | null;
  /** Les Boosters Perso que ce sub vaut à qui l'a payé. */
  boosters: number;
}

/** Quelqu'un qui a payé des subs sans être inscrit : sa part de la réserve. */
export interface DonateurVue {
  twitchId: string;
  pseudo: string;
  offerts: number;
  niveau3: number;
  boosters: number;
  donnes: number;
  restants: number;
  premier: string;
  dernier: string;
}

export interface JoueurVue {
  id: string;
  slug: string;
  pseudo: string;
  inscritLe: string;
  statut: 'joueur' | 'modération' | 'streameuse';
  /** Ses Boosters Perso en attente. */
  boostersPerso: number;
}

/** Un booster cadeau déjà redonné. */
export interface DonVue {
  id: string;
  le: string;
  joueur: string;
  donateur: string;
}

/* ------------------------------ Les listes ------------------------------ */

const PAR_PAGE = 12;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Sans accents ni majuscules, pour chercher un pseudo. */
const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Option<T> {
  cle: string;
  nom: string;
  garde?: (x: T) => boolean;
  ordre?: (a: T, b: T) => number;
}

/**
 * Une liste qu'on cherche, filtre, trie et feuillette : les filtres et les tris
 * en segments, la recherche par pseudo, des pages de `PAR_PAGE`.
 */
function useListe<T>(
  items: T[],
  { pseudo, filtres, tris }: { pseudo: (x: T) => string; filtres: Option<T>[]; tris: Option<T>[] },
) {
  const [filtre, setFiltre] = useState(filtres[0].cle);
  const [tri, setTri] = useState(tris[0].cle);
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);

  const lignes = useMemo(() => {
    const q = plat(recherche.trim());
    const garde = filtres.find((f) => f.cle === filtre)?.garde;
    const ordre = tris.find((t) => t.cle === tri)?.ordre;
    const gardees = items.filter((x) => (!garde || garde(x)) && (!q || plat(pseudo(x)).includes(q)));
    return ordre ? [...gardees].sort(ordre) : gardees;
  }, [items, filtres, tris, filtre, tri, recherche, pseudo]);

  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const courante = Math.min(page, pages - 1);
  const visibles = lignes.slice(courante * PAR_PAGE, (courante + 1) * PAR_PAGE);

  const outils = (
    <div className="admin-outils">
      <input
        type="search"
        className="field admin-outils-recherche"
        placeholder="Chercher un pseudo…"
        value={recherche}
        onChange={(e) => {
          setRecherche(e.target.value);
          setPage(0);
        }}
        aria-label="Chercher un pseudo"
      />
      {filtres.length > 1 && (
        <div className="segment" role="group" aria-label="Filtrer">
          {filtres.map((f) => (
            <button
              key={f.cle}
              type="button"
              aria-pressed={filtre === f.cle}
              onClick={() => {
                setFiltre(f.cle);
                setPage(0);
              }}
            >
              {f.nom}
            </button>
          ))}
        </div>
      )}
      <label className="admin-outils-tri">
        <span>Trier</span>
        <select
          className="field"
          value={tri}
          onChange={(e) => {
            setTri(e.target.value);
            setPage(0);
          }}
        >
          {tris.map((t) => (
            <option key={t.cle} value={t.cle}>
              {t.nom}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const pied =
    lignes.length > PAR_PAGE ? (
      <nav className="admin-pages" aria-label="Pages">
        <button type="button" className="btn btn-sm" disabled={courante === 0} onClick={() => setPage(courante - 1)}>
          ← Précédent
        </button>
        <span>
          {courante * PAR_PAGE + 1}–{Math.min(lignes.length, (courante + 1) * PAR_PAGE)} sur {lignes.length}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={courante >= pages - 1}
          onClick={() => setPage(courante + 1)}
        >
          Suivant →
        </button>
      </nav>
    ) : lignes.length > 0 ? (
      <p className="admin-pages-total">{pluriel(lignes.length, 'ligne')}</p>
    ) : null;

  return { lignes, visibles, outils, pied, vide: lignes.length === 0, filtre: recherche.trim() !== '' };
}

/** Le corps d'une liste : ses lignes, ou ce qu'on dit quand il n'y en a pas. */
function Corps({
  vide,
  filtre,
  titreVide,
  aideVide,
  children,
}: {
  vide: boolean;
  filtre: boolean;
  titreVide: string;
  aideVide: string;
  children: ReactNode;
}) {
  if (vide) {
    return filtre ? (
      <p className="admin-pages-total">Aucun pseudo ne correspond.</p>
    ) : (
      <EmptyState title={titreVide} hint={aideVide} />
    );
  }
  return <ul className="admin-liste">{children}</ul>;
}

/** Un tri par date (ISO), du plus récent (-1) ou du plus ancien (1). */
function parDate<T>(cle: keyof T, sens: 1 | -1) {
  return (a: T, b: T) => sens * String(a[cle]).localeCompare(String(b[cle]));
}

/* ------------------------------ L'écran ------------------------------ */

/**
 * La vue d'ensemble de la modération.
 *
 *  - **Les boosters cadeau** : ce que des non-inscrits ont payé de Booster
 *    Perso — leurs subs comptent pour la saison, et leurs boosters vont à la
 *    réserve. La modération les redonne à des joueurs de la ligue ; un
 *    donateur qui s'inscrit reçoit ce qui reste de sa part.
 *  - **Les subs** : le registre, filtrable par inscrit, cadeau, T3.
 *  - **Les joueurs inscrits**.
 *
 * Chaque liste se cherche, se filtre, se trie et se feuillette.
 */
export function VueEnsemble({
  subs,
  donateurs,
  dons,
  joueurs,
  totalSubs,
  prochainPalier,
}: {
  subs: SubVue[];
  donateurs: DonateurVue[];
  dons: DonVue[];
  joueurs: JoueurVue[];
  totalSubs: number;
  prochainPalier: string;
}) {
  const { busy, message, envoie } = useAction();
  const reserve = donateurs.reduce((n, d) => n + d.restants, 0);
  const receveurs = useMemo(
    () => joueurs.filter((j) => j.statut !== 'streameuse').sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
    [joueurs],
  );
  const [receveur, setReceveur] = useState('');
  const dernier = [...joueurs].sort((a, b) => b.inscritLe.localeCompare(a.inscritLe))[0] ?? null;

  /* ---- Les listes ---- */
  const listeDonateurs = useListe(donateurs, {
    pseudo: (d) => d.pseudo,
    filtres: [
      { cle: 'restants', nom: 'À redonner', garde: (d) => d.restants > 0 },
      { cle: 'tous', nom: 'Tous' },
    ],
    tris: [
      { cle: 'recents', nom: 'Plus récents', ordre: parDate<DonateurVue>('dernier', -1) },
      { cle: 'anciens', nom: 'Plus anciens', ordre: parDate<DonateurVue>('dernier', 1) },
      { cle: 'boosters', nom: 'Plus de boosters', ordre: (a, b) => b.restants - a.restants || b.boosters - a.boosters },
    ],
  });
  const listeSubs = useListe(subs, {
    pseudo: (s) => s.pseudo,
    filtres: [
      { cle: 'tous', nom: 'Tous' },
      { cle: 'inscrits', nom: 'Inscrits', garde: (s) => s.inscrit === true },
      { cle: 'non', nom: 'Pas inscrits', garde: (s) => s.inscrit !== true },
      { cle: 'cadeaux', nom: 'Subs offerts', garde: (s) => s.genre === 'cadeau' },
      { cle: 't3', nom: 'T3', garde: (s) => s.niveau === 3 },
    ],
    tris: [
      { cle: 'recents', nom: 'Plus récents', ordre: parDate<SubVue>('le', -1) },
      { cle: 'anciens', nom: 'Plus anciens', ordre: parDate<SubVue>('le', 1) },
      { cle: 'nombre', nom: 'Plus de subs', ordre: (a, b) => b.nombre - a.nombre || b.le.localeCompare(a.le) },
    ],
  });
  const listeJoueurs = useListe(joueurs, {
    pseudo: (j) => j.pseudo,
    filtres: [
      { cle: 'tous', nom: 'Tous' },
      { cle: 'boosters', nom: 'Avec Booster Perso', garde: (j) => j.boostersPerso > 0 },
      { cle: 'modo', nom: 'Modération', garde: (j) => j.statut !== 'joueur' },
    ],
    tris: [
      { cle: 'recents', nom: 'Plus récents', ordre: parDate<JoueurVue>('inscritLe', -1) },
      { cle: 'anciens', nom: 'Plus anciens', ordre: parDate<JoueurVue>('inscritLe', 1) },
      { cle: 'az', nom: 'De A à Z', ordre: (a, b) => a.pseudo.localeCompare(b.pseudo, 'fr') },
      { cle: 'boosters', nom: 'Plus de boosters', ordre: (a, b) => b.boostersPerso - a.boostersPerso },
    ],
  });

  async function donne() {
    const j = receveurs.find((x) => x.id === receveur);
    if (!j) return;
    const fait = await envoie(
      '/api/admin/boosters-cadeau',
      { playerId: j.id },
      { cle: 'cadeau', succes: `Booster cadeau donné à ${j.pseudo}.` },
    );
    if (fait) setReceveur('');
  }

  return (
    <Ecran
      titre="Vue d’ensemble"
      lead="Les subs de la saison, les boosters cadeau à redonner, et les joueurs inscrits."
      message={message}
    >
      <section className="admin-chiffres">
        <Chiffre label="Subs de la saison" valeur={flakes(totalSubs)} note={prochainPalier} accent="aurora" />
        <Chiffre
          label="Boosters cadeau"
          valeur={reserve}
          note={reserve > 0 ? 'à redonner à des joueurs' : 'réserve vide'}
          accent="gold"
        />
        <Chiffre label="Joueurs inscrits" valeur={joueurs.length} note="par Twitch" />
        <Chiffre
          label="Dernier inscrit"
          valeur={dernier ? dernier.pseudo : '—'}
          note={dernier ? shortDateTime(dernier.inscritLe) : 'personne encore'}
          accent="ice"
        />
      </section>

      <div className="admin-vue">
        {/* ---------------------------- Les boosters cadeau ---------------------------- */}
        <Bloc
          titre="Boosters cadeau"
          icone="snowflake"
          neige="admin-cadeau"
          className="admin-vue-cadeau"
          aide="Des subs payés par quelqu’un qui n’est pas inscrit : ils comptent pour la saison, et leurs Boosters Perso (un par sub T3, un tous les 5 subs offerts) vont à la réserve, à redonner à des joueurs de la ligue. Si le donateur s’inscrit, il reçoit ce qui reste de sa part."
        >
          <div className="admin-cadeau-don">
            <p className="admin-cadeau-reserve">
              <strong>{reserve}</strong>
              <span>
                booster{reserve > 1 ? 's' : ''} cadeau
                <br />à redonner
              </span>
            </p>
            <div className="admin-cadeau-form">
              <label className="admin-outils-tri">
                <span>Donner à</span>
                <select
                  className="field"
                  value={receveur}
                  onChange={(e) => setReceveur(e.target.value)}
                  disabled={reserve === 0}
                >
                  <option value="">Choisir un joueur…</option>
                  {receveurs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.pseudo}
                      {j.boostersPerso > 0 ? ` (${j.boostersPerso} en attente)` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-ice"
                disabled={reserve === 0 || !receveur || busy !== null}
                onClick={donne}
              >
                Donner un booster
              </button>
            </div>
          </div>

          {listeDonateurs.outils}
          <Corps
            vide={listeDonateurs.vide}
            filtre={listeDonateurs.filtre}
            titreVide="Rien à redonner"
            aideVide="Un sub T3 ou cinq subs offerts par quelqu’un qui n’est pas inscrit apparaîtront ici."
          >
            {listeDonateurs.visibles.map((d) => (
              <li key={d.twitchId} data-eteint={d.restants === 0 ? '' : undefined}>
                <span className="admin-liste-titre">
                  {d.pseudo}
                  <span className="admin-pastille" data-ton="or">
                    pas inscrit
                  </span>
                </span>
                <span className="admin-liste-detail">
                  {[
                    d.offerts > 0 ? `${pluriel(d.offerts, 'sub')} offert${d.offerts > 1 ? 's' : ''}` : null,
                    d.niveau3 > 0 ? `${pluriel(d.niveau3, 'sub')} T3` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {' · '}
                  <strong className="text-aurora">{pluriel(d.restants, 'booster')} à redonner</strong>
                  {d.donnes > 0 && (
                    <>
                      {' '}
                      · {d.donnes} déjà donné{d.donnes > 1 ? 's' : ''}
                    </>
                  )}
                </span>
                <time className="admin-liste-date">{shortDateTime(d.dernier)}</time>
              </li>
            ))}
          </Corps>
          {listeDonateurs.pied}

          {dons.length > 0 && (
            <details className="admin-dons">
              <summary>Derniers boosters cadeau donnés · {dons.length}</summary>
              <ul className="admin-liste">
                {dons.slice(0, 20).map((d) => (
                  <li key={d.id}>
                    <span className="admin-liste-titre">{d.joueur}</span>
                    <span className="admin-liste-detail">payé par {d.donateur}</span>
                    <time className="admin-liste-date">{shortDateTime(d.le)}</time>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Bloc>

        {/* ---------------------------------- Les subs ---------------------------------- */}
        <Bloc
          titre="Les subs"
          icone="antenne"
          className="admin-vue-subs"
          aide="Chaque sub compté depuis Twitch. Un sub T3, et cinq subs offerts, valent un Booster Perso : à qui les a payés s’il est inscrit, sinon à la réserve des boosters cadeau."
        >
          {listeSubs.outils}
          <Corps
            vide={listeSubs.vide}
            filtre={listeSubs.filtre}
            titreVide="Aucun sub"
            aideVide="Chaque sub, resub et cadeau arrivé par Twitch s’inscrit ici."
          >
            {listeSubs.visibles.map((s) => (
              <li key={s.id}>
                <span className="admin-liste-titre">
                  {s.pseudo}
                  {s.inscrit === false && (
                    <span className="admin-pastille" data-ton="or">
                      pas inscrit
                    </span>
                  )}
                  {s.inscrit === null && <span className="admin-pastille">anonyme</span>}
                </span>
                <span className="admin-liste-detail">
                  {s.genre === 'cadeau'
                    ? `${pluriel(s.nombre, 'sub')} offert${s.nombre > 1 ? 's' : ''}`
                    : s.genre === 'resub'
                      ? 'resub'
                      : 'sub'}{' '}
                  · T{s.niveau}
                  {s.boosters > 0 && (
                    <>
                      {' · '}
                      <strong className="text-aurora">
                        {s.inscrit
                          ? pluriel(s.boosters, 'Booster') + ' Perso'
                          : `${pluriel(s.boosters, 'booster')} cadeau`}
                      </strong>
                    </>
                  )}
                </span>
                <time className="admin-liste-date">{shortDateTime(s.le)}</time>
              </li>
            ))}
          </Corps>
          {listeSubs.pied}
        </Bloc>

        {/* ------------------------------ Les joueurs inscrits ------------------------------ */}
        <Bloc
          titre="Joueurs inscrits"
          icone="user"
          className="admin-vue-joueurs"
          actions={
            <Link href="/admin/joueurs" className="btn btn-sm no-underline">
              Gérer →
            </Link>
          }
        >
          {listeJoueurs.outils}
          <Corps
            vide={listeJoueurs.vide}
            filtre={listeJoueurs.filtre}
            titreVide="Personne encore"
            aideVide="Les joueurs s’inscrivent en se connectant avec Twitch."
          >
            {listeJoueurs.visibles.map((j) => (
              <li key={j.id}>
                <span className="admin-liste-titre">
                  <Link href={`/joueurs/${j.slug}`} className="text-ink no-underline hover:text-ice">
                    {j.pseudo}
                  </Link>
                  {j.statut !== 'joueur' && <span className="admin-pastille">{j.statut}</span>}
                </span>
                <span className="admin-liste-detail">
                  {j.boostersPerso > 0 ? (
                    <strong className="text-aurora">{pluriel(j.boostersPerso, 'Booster')} Perso en attente</strong>
                  ) : (
                    'aucun Booster Perso en attente'
                  )}
                </span>
                <time className="admin-liste-date">{shortDateTime(j.inscritLe)}</time>
              </li>
            ))}
          </Corps>
          {listeJoueurs.pied}
        </Bloc>
      </div>
    </Ecran>
  );
}
