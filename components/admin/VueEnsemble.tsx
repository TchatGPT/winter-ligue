'use client';

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { IconCadeau, IconPack } from '@/components/icons';
import { Notice, flakes } from '@/components/ui';
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

/* ------------------------------ Le tableau ------------------------------ */

const PAR_PAGE = 15;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Sans accents ni majuscules, pour chercher un pseudo. */
const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Colonne<T> {
  cle: string;
  titre: string;
  rendu: (x: T) => ReactNode;
  /** Trier par cette colonne : l'ordre croissant. */
  tri?: (a: T, b: T) => number;
  align?: 'droite';
  /** La colonne qui fait le titre d'une ligne, sur un téléphone. */
  principale?: boolean;
}

interface Filtre<T> {
  cle: string;
  nom: string;
  garde?: (x: T) => boolean;
}

/**
 * Un tableau qu'on cherche, filtre, trie et feuillette.
 *
 * Les en-têtes trient (un clic : décroissant, un second : croissant), les
 * filtres sont en segment, avec leur compte, la recherche porte sur le
 * pseudo, quinze lignes par page. Sur un téléphone, chaque ligne devient une
 * carte : la colonne principale en titre, les autres dessous avec leur nom.
 */
function Tableau<T>({
  lignes: items,
  colonnes,
  filtres,
  pseudo,
  cleDe,
  triDefaut,
  vide,
}: {
  lignes: T[];
  colonnes: Colonne<T>[];
  filtres: Filtre<T>[];
  pseudo: (x: T) => string;
  cleDe: (x: T) => string;
  triDefaut: { cle: string; desc: boolean };
  vide: string;
}) {
  const [filtre, setFiltre] = useState(filtres[0]?.cle ?? '');
  const [tri, setTri] = useState(triDefaut);
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(0);

  const lignes = useMemo(() => {
    const q = plat(recherche.trim());
    const garde = filtres.find((f) => f.cle === filtre)?.garde;
    const ordre = colonnes.find((c) => c.cle === tri.cle)?.tri;
    const gardees = items.filter((x) => (!garde || garde(x)) && (!q || plat(pseudo(x)).includes(q)));
    if (!ordre) return gardees;
    return [...gardees].sort((a, b) => (tri.desc ? -1 : 1) * ordre(a, b));
  }, [items, filtres, colonnes, filtre, tri, recherche, pseudo]);

  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const courante = Math.min(page, pages - 1);
  const visibles = lignes.slice(courante * PAR_PAGE, (courante + 1) * PAR_PAGE);
  const trie = (cle: string) => {
    setTri((t) => (t.cle === cle ? { cle, desc: !t.desc } : { cle, desc: true }));
    setPage(0);
  };

  return (
    <div className="mod-tableau">
      <div className="mod-outils">
        <input
          type="search"
          className="field mod-recherche"
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
                <span className="mod-filtre-compte">{f.garde ? items.filter(f.garde).length : items.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {lignes.length === 0 ? (
        <p className="mod-vide">{recherche.trim() ? 'Aucun pseudo ne correspond.' : vide}</p>
      ) : (
        <table className="mod-table">
          <thead>
            <tr>
              {colonnes.map((c) => (
                <th
                  key={c.cle}
                  className={c.align === 'droite' ? 'text-right' : undefined}
                  aria-sort={tri.cle === c.cle ? (tri.desc ? 'descending' : 'ascending') : undefined}
                >
                  {c.tri ? (
                    <button type="button" onClick={() => trie(c.cle)} data-actif={tri.cle === c.cle ? '' : undefined}>
                      {c.titre}
                      <span aria-hidden="true">{tri.cle === c.cle ? (tri.desc ? '▼' : '▲') : '△'}</span>
                    </button>
                  ) : (
                    c.titre
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((x) => (
              <tr key={cleDe(x)}>
                {colonnes.map((c) => (
                  <td
                    key={c.cle}
                    data-titre={c.titre}
                    data-principale={c.principale ? '' : undefined}
                    className={c.align === 'droite' ? 'text-right' : undefined}
                  >
                    {c.rendu(x)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {lignes.length > 0 && (
        <nav className="mod-pages" aria-label="Pages">
          <span>
            {lignes.length > PAR_PAGE
              ? `${courante * PAR_PAGE + 1}–${Math.min(lignes.length, (courante + 1) * PAR_PAGE)} sur ${lignes.length}`
              : pluriel(lignes.length, 'ligne')}
          </span>
          {lignes.length > PAR_PAGE && (
            <span className="mod-pages-boutons">
              <button
                type="button"
                className="mod-page"
                disabled={courante === 0}
                onClick={() => setPage(courante - 1)}
                aria-label="Page précédente"
              >
                ‹
              </button>
              <span className="mod-page-num">
                {courante + 1} / {pages}
              </span>
              <button
                type="button"
                className="mod-page"
                disabled={courante >= pages - 1}
                onClick={() => setPage(courante + 1)}
                aria-label="Page suivante"
              >
                ›
              </button>
            </span>
          )}
        </nav>
      )}
    </div>
  );
}

/** Une pastille de statut : pas inscrit, anonyme, modération, booster. */
function Statut({ ton, children }: { ton: 'or' | 'glace' | 'gris' | 'aurore'; children: ReactNode }) {
  return (
    <span className="mod-statut" data-ton={ton}>
      {children}
    </span>
  );
}

const parTexte =
  <T,>(f: (x: T) => string) =>
  (a: T, b: T) =>
    f(a).localeCompare(f(b), 'fr');
const parNombre =
  <T,>(f: (x: T) => number) =>
  (a: T, b: T) =>
    f(a) - f(b);

/* ------------------------------ L'écran ------------------------------ */

type Onglet = 'subs' | 'donateurs' | 'joueurs';

/**
 * La vue d'ensemble de la modération.
 *
 * En haut, ce qui se compte ; puis ce qui est à faire — les boosters cadeau à
 * redonner, avec de quoi le faire sur place, et les boosters à ouvrir — ; puis
 * un tableau à onglets : les subs, les non-inscrits qui ont payé des boosters,
 * les joueurs inscrits.
 *
 * Un booster cadeau, c'est un Booster Perso payé par quelqu'un qui n'est pas
 * inscrit : ses subs comptent pour la saison, et la modération redonne ses
 * boosters à des joueurs de la ligue. S'il s'inscrit, il reçoit ce qui reste
 * de sa part.
 */
export function VueEnsemble({
  subs,
  donateurs,
  dons,
  joueurs,
  totalSubs,
  prochainPalier,
  aOuvrir,
}: {
  subs: SubVue[];
  donateurs: DonateurVue[];
  dons: DonVue[];
  joueurs: JoueurVue[];
  totalSubs: number;
  prochainPalier: string;
  /** Les boosters en file, pas encore ouverts : Perso, et ceux de la ligue. */
  aOuvrir: { perso: number; ligue: number };
}) {
  const { busy, message, envoie } = useAction();
  const [onglet, setOnglet] = useState<Onglet>('subs');
  const [receveur, setReceveur] = useState('');
  const reserve = donateurs.reduce((n, d) => n + d.restants, 0);
  const avecReserve = donateurs.filter((d) => d.restants > 0).length;
  const receveurs = useMemo(
    () => joueurs.filter((j) => j.statut !== 'streameuse').sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
    [joueurs],
  );
  const dernier = [...joueurs].sort((a, b) => b.inscritLe.localeCompare(a.inscritLe))[0] ?? null;
  const total = aOuvrir.perso + aOuvrir.ligue;

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

  const ONGLETS: { cle: Onglet; nom: string; compte: number }[] = [
    { cle: 'subs', nom: 'Subs', compte: subs.length },
    { cle: 'donateurs', nom: 'Non inscrits', compte: donateurs.length },
    { cle: 'joueurs', nom: 'Joueurs', compte: joueurs.length },
  ];

  return (
    <div className="mod">
      {/* ------------------------------ Les chiffres ------------------------------ */}
      <dl className="glass mod-chiffres">
        <div>
          <dt>Subs de la saison</dt>
          <dd className="text-aurora">{flakes(totalSubs)}</dd>
          <p>{prochainPalier}</p>
        </div>
        <div>
          <dt>Joueurs inscrits</dt>
          <dd>{joueurs.length}</dd>
          <p>par Twitch</p>
        </div>
        <div>
          <dt>Dernier inscrit</dt>
          <dd className="mod-chiffre-texte">{dernier ? dernier.pseudo : '—'}</dd>
          <p>{dernier ? shortDateTime(dernier.inscritLe) : 'personne encore'}</p>
        </div>
        <div>
          <dt>Non inscrits</dt>
          <dd>{donateurs.length}</dd>
          <p>ont payé des boosters</p>
        </div>
      </dl>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {/* ------------------------------- À faire ------------------------------- */}
      <section className="mod-actions" aria-label="À faire">
        <div className="glass mod-action" data-ton="or">
          <div className="mod-action-tete">
            <span className="mod-action-icone" aria-hidden="true">
              <IconCadeau className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="mod-action-nombre">
                {reserve}
                <span> booster{reserve > 1 ? 's' : ''} cadeau</span>
              </p>
              <p className="mod-action-texte">
                {reserve > 0
                  ? `Payés par ${pluriel(avecReserve, 'non-inscrit')} : à redonner à des joueurs de la ligue.`
                  : 'Rien à redonner pour l’instant.'}
              </p>
            </div>
          </div>
          <div className="mod-action-form">
            <select
              className="field"
              value={receveur}
              onChange={(e) => setReceveur(e.target.value)}
              disabled={reserve === 0}
              aria-label="Le joueur qui reçoit le booster cadeau"
            >
              <option value="">Choisir un joueur…</option>
              {receveurs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.pseudo}
                  {j.boostersPerso > 0 ? ` · ${j.boostersPerso} en attente` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ice"
              disabled={reserve === 0 || !receveur || busy !== null}
              onClick={donne}
            >
              Donner
            </button>
          </div>
          {dons.length > 0 && (
            <p className="mod-action-pied">
              Dernier don : {dons[0].joueur}, payé par {dons[0].donateur} · {shortDateTime(dons[0].le)}
            </p>
          )}
        </div>

        <div className="glass mod-action" data-ton="glace">
          <div className="mod-action-tete">
            <span className="mod-action-icone" aria-hidden="true">
              <IconPack className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="mod-action-nombre">
                {total}
                <span> booster{total > 1 ? 's' : ''} à ouvrir</span>
              </p>
              <p className="mod-action-texte">
                {pluriel(aOuvrir.perso, 'Booster')} Perso · {aOuvrir.ligue} de la ligue. Ils s’ouvrent à l’antenne.
              </p>
            </div>
          </div>
          <Link href="/boosters" className="btn btn-ice no-underline">
            Ouvrir sur la page Boosters →
          </Link>
        </div>
      </section>

      {/* ------------------------------- Le registre ------------------------------- */}
      <section className="glass mod-registre" aria-label="Le registre">
        <div className="mod-onglets" role="tablist">
          {ONGLETS.map((o) => (
            <button
              key={o.cle}
              type="button"
              role="tab"
              aria-selected={onglet === o.cle}
              onClick={() => setOnglet(o.cle)}
            >
              {o.nom}
              <span className="mod-onglet-compte">{o.compte}</span>
            </button>
          ))}
        </div>

        {onglet === 'subs' && (
          <Tableau
            key="subs"
            lignes={subs}
            pseudo={(s) => s.pseudo}
            cleDe={(s) => s.id}
            triDefaut={{ cle: 'le', desc: true }}
            vide="Aucun sub encore : chaque sub, resub et cadeau arrivé par Twitch s’inscrit ici."
            filtres={[
              { cle: 'tous', nom: 'Tous' },
              { cle: 'inscrits', nom: 'Inscrits', garde: (s) => s.inscrit === true },
              { cle: 'non', nom: 'Pas inscrits', garde: (s) => s.inscrit !== true },
              { cle: 'cadeaux', nom: 'Offerts', garde: (s) => s.genre === 'cadeau' },
              { cle: 't3', nom: 'T3', garde: (s) => s.niveau === 3 },
            ]}
            colonnes={[
              {
                cle: 'pseudo',
                titre: 'Pseudo',
                principale: true,
                tri: parTexte((s) => s.pseudo),
                rendu: (s) => (
                  <span className="mod-pseudo">
                    {s.pseudo}
                    {s.inscrit === false && <Statut ton="or">pas inscrit</Statut>}
                    {s.inscrit === null && <Statut ton="gris">anonyme</Statut>}
                  </span>
                ),
              },
              {
                cle: 'nombre',
                titre: 'Sub',
                tri: parNombre((s) => s.nombre),
                rendu: (s) =>
                  s.genre === 'cadeau' ? (
                    <>
                      <b>{s.nombre}</b> offert{s.nombre > 1 ? 's' : ''}
                    </>
                  ) : s.genre === 'resub' ? (
                    'resub'
                  ) : (
                    'sub'
                  ),
              },
              {
                cle: 'niveau',
                titre: 'Niveau',
                tri: parNombre((s) => s.niveau),
                rendu: (s) => (
                  <span className="mod-niveau" data-t3={s.niveau === 3 ? '' : undefined}>
                    T{s.niveau}
                  </span>
                ),
              },
              {
                cle: 'booster',
                titre: 'Booster',
                tri: parNombre((s) => s.boosters),
                rendu: (s) =>
                  s.boosters === 0 ? (
                    <span className="text-faint">—</span>
                  ) : s.inscrit ? (
                    <Statut ton="aurore">{s.boosters} Perso</Statut>
                  ) : (
                    <Statut ton="or">{s.boosters} cadeau</Statut>
                  ),
              },
              {
                cle: 'le',
                titre: 'Date',
                align: 'droite',
                tri: parTexte((s) => s.le),
                rendu: (s) => <time className="mod-date">{shortDateTime(s.le)}</time>,
              },
            ]}
          />
        )}

        {onglet === 'donateurs' && (
          <Tableau
            key="donateurs"
            lignes={donateurs}
            pseudo={(d) => d.pseudo}
            cleDe={(d) => d.twitchId}
            triDefaut={{ cle: 'restants', desc: true }}
            vide="Personne : un sub T3 ou cinq subs offerts par quelqu’un qui n’est pas inscrit apparaîtront ici."
            filtres={[
              { cle: 'restants', nom: 'À redonner', garde: (d) => d.restants > 0 },
              { cle: 'tous', nom: 'Tous' },
            ]}
            colonnes={[
              {
                cle: 'pseudo',
                titre: 'Pseudo',
                principale: true,
                tri: parTexte((d) => d.pseudo),
                rendu: (d) => <span className="mod-pseudo">{d.pseudo}</span>,
              },
              {
                cle: 'paye',
                titre: 'A payé',
                tri: parNombre((d) => d.offerts + d.niveau3 * 5),
                rendu: (d) =>
                  [
                    d.offerts > 0 ? `${d.offerts} offert${d.offerts > 1 ? 's' : ''}` : null,
                    d.niveau3 > 0 ? `${d.niveau3} T3` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
              },
              {
                cle: 'donnes',
                titre: 'Donnés',
                align: 'droite',
                tri: parNombre((d) => d.donnes),
                rendu: (d) => (d.donnes > 0 ? `${d.donnes} / ${d.boosters}` : <span className="text-faint">—</span>),
              },
              {
                cle: 'restants',
                titre: 'À redonner',
                align: 'droite',
                tri: parNombre((d) => d.restants),
                rendu: (d) =>
                  d.restants > 0 ? <Statut ton="or">{d.restants}</Statut> : <span className="text-faint">0</span>,
              },
              {
                cle: 'dernier',
                titre: 'Dernier sub',
                align: 'droite',
                tri: parTexte((d) => d.dernier),
                rendu: (d) => <time className="mod-date">{shortDateTime(d.dernier)}</time>,
              },
            ]}
          />
        )}

        {onglet === 'joueurs' && (
          <Tableau
            key="joueurs"
            lignes={joueurs}
            pseudo={(j) => j.pseudo}
            cleDe={(j) => j.id}
            triDefaut={{ cle: 'inscritLe', desc: true }}
            vide="Personne encore : les joueurs s’inscrivent en se connectant avec Twitch."
            filtres={[
              { cle: 'tous', nom: 'Tous' },
              { cle: 'boosters', nom: 'Avec Booster Perso', garde: (j) => j.boostersPerso > 0 },
              { cle: 'modo', nom: 'Modération', garde: (j) => j.statut !== 'joueur' },
            ]}
            colonnes={[
              {
                cle: 'pseudo',
                titre: 'Pseudo',
                principale: true,
                tri: parTexte((j) => j.pseudo),
                rendu: (j) => (
                  <span className="mod-pseudo">
                    <Link href={`/joueurs/${j.slug}`} className="text-ink no-underline hover:text-ice">
                      {j.pseudo}
                    </Link>
                    {j.statut !== 'joueur' && <Statut ton="glace">{j.statut}</Statut>}
                  </span>
                ),
              },
              {
                cle: 'boosters',
                titre: 'Boosters Perso',
                align: 'droite',
                tri: parNombre((j) => j.boostersPerso),
                rendu: (j) =>
                  j.boostersPerso > 0 ? (
                    <Statut ton="aurore">{j.boostersPerso} en attente</Statut>
                  ) : (
                    <span className="text-faint">—</span>
                  ),
              },
              {
                cle: 'inscritLe',
                titre: 'Inscrit le',
                align: 'droite',
                tri: parTexte((j) => j.inscritLe),
                rendu: (j) => <time className="mod-date">{shortDateTime(j.inscritLe)}</time>,
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
