'use client';

import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Filtres, Panneau, Pastille, Recherche, Vide, plat } from '@/components/admin/Kit';
import { EmblemePalier, Medaille, type GlyphePalier } from '@/components/EmblemePalier';
import { NAV_ICONS } from '@/components/icons';
import { flakes } from '@/components/ui';
import { LEAGUE_TIMEZONE } from '@/lib/format';

/* ------------------------------- Les données ------------------------------ */

/** Un sub du registre, tel que l'écran le raconte. */
export interface SubVue {
  id: string;
  le: string;
  genre: 'sub' | 'resub' | 'cadeau';
  pseudo: string;
  nombre: number;
  niveau: number;
  /** Joue dans la ligue ; nul pour un cadeau anonyme. */
  inscrit: boolean | null;
  /**
   * Les Boosters Perso que ce sub a fait gagner à qui l'a payé
   * (`boostersParLigne`) : les siens s'il joue, des boosters cadeau sinon.
   */
  boosters: number;
}

/** Un viewer qui a payé des subs sans jouer dans la ligue : sa part de la réserve. */
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

export interface ReceveurVue {
  id: string;
  pseudo: string;
  boostersPerso: number;
}

/** Un booster cadeau déjà donné. */
export interface DonVue {
  id: string;
  le: string;
  joueur: string;
  donateur: string;
}

/** Le prochain palier du compteur de subs, et sa médaille. */
export interface ProchainPalier {
  label: string;
  remaining: number;
  progress: number;
  glyphe: GlyphePalier;
  teinte: string;
}

const pluriel = (n: number, mot: string) => `${flakes(n)} ${mot}${n > 1 ? 's' : ''}`;

/** Le fil s'affiche par tranches : une saison peut compter des milliers de subs. */
const PAS = 60;

/* ------------------------------- Les jours ------------------------------- */

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: LEAGUE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const JOUR_LONG = new Intl.DateTimeFormat('fr-FR', {
  timeZone: LEAGUE_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: LEAGUE_TIMEZONE, hour: '2-digit', minute: '2-digit' });

/** Le jour d'une date, dans le fuseau de la ligue : la clé d'un groupe. */
const jourDe = (iso: string) => JOUR.format(new Date(iso));

/** « Aujourd'hui », « Hier », « Lundi 5 octobre ». */
function nomDuJour(iso: string, maintenant: string): string {
  const jour = jourDe(iso);
  if (jour === jourDe(maintenant)) return 'Aujourd’hui';
  if (jour === jourDe(new Date(Date.parse(maintenant) - 86_400_000).toISOString())) return 'Hier';
  const long = JOUR_LONG.format(new Date(iso));
  return long.charAt(0).toUpperCase() + long.slice(1);
}

/** « aujourd'hui à 21:00 », « hier à 21:00 », « lundi 5 octobre à 21:00 ». */
const quand = (iso: string, maintenant: string) =>
  `${nomDuJour(iso, maintenant).toLowerCase()} à ${HEURE.format(new Date(iso))}`;

/* ------------------------------- Les pièces ------------------------------- */

type Statut = 'joueur' | 'viewer' | 'anonyme';

const statutDe = (inscrit: boolean | null): Statut => (inscrit === null ? 'anonyme' : inscrit ? 'joueur' : 'viewer');

/** L'initiale d'un pseudo, dans une pastille : neige pour un joueur, verre pour un viewer. */
function Avatar({ pseudo, statut }: { pseudo: string; statut: Statut }) {
  const initiale = statut === 'anonyme' ? '?' : (pseudo.match(/[\p{L}\p{N}]/u)?.[0] ?? '?');
  return (
    <span className="adm-avatar" data-statut={statut} aria-hidden="true">
      {initiale}
    </span>
  );
}

/** Une tuile de chiffre : sa médaille, le nombre en grand, ce qu'il compte, et où aller. */
function Tuile({
  medaille,
  nombre,
  nom,
  detail,
  href,
  ton,
  teinte,
  children,
}: {
  medaille: ReactNode;
  nombre: ReactNode;
  nom: string;
  detail: ReactNode;
  href?: string;
  ton?: 'or' | 'glace' | 'aurore';
  /** Une teinte à soi, celle du prochain palier. */
  teinte?: string;
  children?: ReactNode;
}) {
  const corps = (
    <>
      {medaille}
      <span className="adm-tuile-corps">
        <span className="adm-tuile-nombre num">{nombre}</span>
        <span className="adm-tuile-nom">{nom}</span>
        <span className="adm-tuile-detail">{detail}</span>
        {children}
      </span>
      {href && (
        <span className="adm-tuile-fleche" aria-hidden="true">
          ›
        </span>
      )}
    </>
  );
  const props = {
    className: 'glass glass-soft adm-tuile no-underline',
    'data-ton': ton,
    style: teinte ? { ['--teinte' as string]: teinte } : undefined,
  };
  if (!href) return <div {...props}>{corps}</div>;
  return href.startsWith('#') ? (
    <a href={href} {...props}>
      {corps}
    </a>
  ) : (
    <Link href={href} {...props}>
      {corps}
    </Link>
  );
}

/** Ce qu'a fait un sub, après le pseudo. */
function action(s: SubVue): ReactNode {
  const niveau = s.niveau > 1 ? ` de niveau ${s.niveau}` : '';
  if (s.genre === 'cadeau')
    return (
      <>
        a offert <b>{pluriel(s.nombre, 'sub')}</b>
        {niveau}
      </>
    );
  return `${s.genre === 'resub' ? 's’est réabonné' : 's’est abonné'}${niveau}`;
}

/** Une ligne du fil : qui, quoi, joueur ou viewer, ce que ça a rapporté, et l'heure. */
function LigneSub({ s }: { s: SubVue }) {
  const statut = statutDe(s.inscrit);
  return (
    <li className="adm-sub" data-statut={statut} data-genre={s.genre}>
      <Avatar pseudo={s.pseudo} statut={statut} />
      <div className="adm-sub-corps">
        <p className="adm-sub-phrase">
          <b>{s.pseudo}</b> {action(s)}
        </p>
        <p className="adm-sub-etiquettes">
          <Pastille ton={statut === 'joueur' ? 'glace' : 'gris'}>
            {statut === 'joueur' ? 'joueur de la ligue' : statut}
          </Pastille>
          {s.boosters > 0 && (
            <Pastille ton={s.inscrit ? 'aurore' : 'or'}>
              {s.inscrit
                ? `+${s.boosters} Booster${s.boosters > 1 ? 's' : ''} Perso`
                : `+${s.boosters} booster${s.boosters > 1 ? 's' : ''} cadeau`}
            </Pastille>
          )}
        </p>
      </div>
      <time className="adm-sub-heure" dateTime={s.le}>
        {HEURE.format(new Date(s.le))}
      </time>
    </li>
  );
}

/** Twitch n'est pas branché : un bandeau, comme ceux des évènements. */
function AlerteTwitch() {
  const Antenne = NAV_ICONS.antenne;
  return (
    <div className="glass glass-soft adm-alerte" style={{ gridArea: 'alerte' }} role="status">
      <Medaille teinte="var(--danger)" id="tdb-twitch" className="adm-alerte-medaille">
        <Antenne className="medaille-icone" />
      </Medaille>
      <div className="adm-alerte-corps">
        <p className="adm-alerte-titre">
          <span>À faire</span> Twitch n’est pas branché
        </p>
        <p className="adm-alerte-texte">
          Les subs Prime comptent encore comme des subs payés, tant que Lriaa n’a pas rebranché les subs.
        </p>
      </div>
      <Link href="/admin/saison" className="btn btn-sm btn-ice no-underline">
        Voir comment
      </Link>
    </div>
  );
}

/* ------------------------------- L'écran ------------------------------- */

type FiltreFil = 'tout' | 'joueurs' | 'viewers' | 'offerts';

/**
 * Le tableau de bord de la modération.
 *
 *  1. ce qui ne va pas : Twitch débranché, en bandeau ;
 *  2. quatre tuiles : les subs de la saison et le prochain palier, les
 *     boosters à ouvrir en live, les boosters cadeau à donner, les joueurs
 *     (et ceux à qui il manque un pseudo Activision) ;
 *  3. les boosters cadeau : payés par des viewers qui ne jouent pas, que la
 *     modération donne à des joueurs — à qui, et d'où ils viennent ;
 *  4. le fil des subs, jour par jour : qui, quoi, joueur de la ligue ou
 *     viewer, et le booster que ça a rapporté ;
 *  5. sur un très grand écran, les paliers du compteur.
 *
 * Un sub de niveau 3, ou cinq subs offerts, valent un Booster Perso : à qui
 * les paie s'il joue dans la ligue, sinon c'est un booster cadeau. S'il
 * s'inscrit, il reçoit ce qui n'a pas été donné.
 */
export function TableauDeBord({
  subs,
  donateurs,
  dons,
  receveurs,
  totalSubs,
  prochain,
  paliers,
  joueurs,
  aOuvrir,
  twitchBranche,
  maintenant,
}: {
  subs: SubVue[];
  donateurs: DonateurVue[];
  dons: DonVue[];
  receveurs: ReceveurVue[];
  totalSubs: number;
  prochain: ProchainPalier | null;
  /** Les paliers du compteur, rendus par le serveur (`PaliersSubs`). */
  paliers: ReactNode;
  joueurs: { inscrits: number; sansPseudo: number };
  aOuvrir: { perso: number; ligue: number };
  /** Les subs de Twitch sont-ils branchés ? Nul : Twitch n'a pas répondu. */
  twitchBranche: boolean | null;
  maintenant: string;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [receveur, setReceveur] = useState('');
  const [filtre, setFiltre] = useState<FiltreFil>('tout');
  const [recherche, setRecherche] = useState('');
  const [ordre, setOrdre] = useState<'recent' | 'ancien'>('recent');
  const [montres, setMontres] = useState(PAS);

  const reserve = donateurs.reduce((n, d) => n + d.restants, 0);
  const aRedonner = donateurs.filter((d) => d.restants > 0).sort((a, b) => b.restants - a.restants);
  const totalOuvrir = aOuvrir.perso + aOuvrir.ligue;

  const comptes = useMemo(
    () => ({
      tout: subs.length,
      joueurs: subs.filter((s) => s.inscrit === true).length,
      viewers: subs.filter((s) => s.inscrit !== true).length,
      offerts: subs.filter((s) => s.genre === 'cadeau').length,
    }),
    [subs],
  );

  const { groupes, reste } = useMemo(() => {
    const q = plat(recherche.trim());
    const gardes = subs
      .filter((s) => {
        if (filtre === 'joueurs' && s.inscrit !== true) return false;
        if (filtre === 'viewers' && s.inscrit === true) return false;
        if (filtre === 'offerts' && s.genre !== 'cadeau') return false;
        return !q || plat(s.pseudo).includes(q);
      })
      .sort((a, b) => (ordre === 'recent' ? b.le.localeCompare(a.le) : a.le.localeCompare(b.le)));
    // Le total d'un jour compte tout le jour, même la part pas encore affichée.
    const parJour = new Map<string, number>();
    for (const s of gardes) parJour.set(jourDe(s.le), (parJour.get(jourDe(s.le)) ?? 0) + s.nombre);
    const groupes: { jour: string; nom: string; total: number; lignes: SubVue[] }[] = [];
    for (const s of gardes.slice(0, montres)) {
      const jour = jourDe(s.le);
      const dernier = groupes.at(-1);
      if (dernier?.jour === jour) dernier.lignes.push(s);
      else groupes.push({ jour, nom: nomDuJour(s.le, maintenant), total: parJour.get(jour) ?? 0, lignes: [s] });
    }
    return { groupes, reste: Math.max(0, gardes.length - montres) };
  }, [subs, filtre, recherche, ordre, montres, maintenant]);

  async function donne() {
    const j = receveurs.find((x) => x.id === receveur);
    if (!j) return;
    const fait = await envoie(
      '/api/admin/boosters-cadeau',
      { playerId: j.id },
      { cle: 'cadeau', succes: `Booster cadeau donné à ${j.pseudo} : il l’attend dans ses Boosters Perso.` },
    );
    if (fait) setReceveur('');
  }

  const Pack = NAV_ICONS.pack;
  const Cadeau = NAV_ICONS.cadeau;
  const Joueur = NAV_ICONS.user;

  return (
    <EcranAdmin
      grille={twitchBranche === false ? 'tableau-alerte' : 'tableau'}
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      {twitchBranche === false && <AlerteTwitch />}

      {/* ------------------------------ Les tuiles ------------------------------ */}
      <section className="adm-tuiles" style={{ gridArea: 'tuiles' }} aria-label="La saison en chiffres">
        <Tuile
          medaille={
            prochain ? (
              <EmblemePalier
                glyphe={prochain.glyphe}
                teinte={prochain.teinte}
                id="tdb-subs"
                className="adm-tuile-medaille"
              />
            ) : (
              <Medaille teinte="var(--aurora)" id="tdb-subs" className="adm-tuile-medaille">
                <Pack className="medaille-icone" />
              </Medaille>
            )
          }
          teinte={prochain?.teinte}
          nombre={flakes(totalSubs)}
          nom="Subs de la saison"
          detail={
            prochain ? (
              <>
                {prochain.label} dans <b>{prochain.remaining}</b>
              </>
            ) : (
              'Tous les paliers sont franchis'
            )
          }
        >
          {prochain && (
            <span className="palier-jauge adm-tuile-jauge" aria-hidden="true">
              <span style={{ width: `${Math.round(prochain.progress * 100)}%` }} />
            </span>
          )}
        </Tuile>

        <Tuile
          medaille={
            <Medaille teinte="var(--ice)" id="tdb-ouvrir" className="adm-tuile-medaille">
              <Pack className="medaille-icone" />
            </Medaille>
          }
          ton="glace"
          nombre={flakes(totalOuvrir)}
          nom={totalOuvrir > 1 ? 'Boosters à ouvrir' : 'Booster à ouvrir'}
          detail={
            totalOuvrir === 0 ? (
              'Rien à ouvrir pour l’instant'
            ) : (
              <>
                {flakes(aOuvrir.ligue)} de la ligue · {flakes(aOuvrir.perso)} Perso
              </>
            )
          }
          href="/boosters"
        />

        <Tuile
          medaille={
            <Medaille teinte="var(--gold)" id="tdb-cadeau" className="adm-tuile-medaille">
              <Cadeau className="medaille-icone" />
            </Medaille>
          }
          ton="or"
          nombre={flakes(reserve)}
          nom={reserve > 1 ? 'Boosters cadeau' : 'Booster cadeau'}
          detail={reserve === 0 ? 'Rien à donner pour l’instant' : 'À donner à des joueurs'}
          href="#panneau-cadeau"
        />

        <Tuile
          medaille={
            <Medaille teinte="var(--aurora)" id="tdb-joueurs" className="adm-tuile-medaille">
              <Joueur className="medaille-icone" />
            </Medaille>
          }
          ton="aurore"
          nombre={flakes(joueurs.inscrits)}
          nom={joueurs.inscrits > 1 ? 'Joueurs inscrits' : 'Joueur inscrit'}
          detail={
            joueurs.sansPseudo === 0 ? (
              'Tous ont leur pseudo Activision'
            ) : (
              <>
                <b>{flakes(joueurs.sansPseudo)}</b> sans pseudo Activision
              </>
            )
          }
          href={joueurs.sansPseudo > 0 ? '/admin/joueurs?filtre=sans-pseudo' : '/admin/joueurs'}
        />
      </section>

      {/* ---------------------------- Les boosters cadeau ---------------------------- */}
      <Panneau
        zone="cadeau"
        ton="or"
        surtitre="Payés par des viewers"
        titre="Boosters cadeau"
        sousTitre={
          <>
            Un viewer qui ne joue pas dans la ligue a pris un <b>sub de niveau 3</b> ou offert <b>5 subs</b> : son
            booster revient à la ligue. Donne-le à un joueur.
          </>
        }
        actions={
          <p className="adm-reserve" data-vide={reserve === 0 ? '' : undefined}>
            <strong className="num">{flakes(reserve)}</strong>
            <span>à donner</span>
          </p>
        }
        defile
      >
        <form
          className="adm-don"
          onSubmit={(e) => {
            e.preventDefault();
            void donne();
          }}
        >
          <select
            className="field"
            value={receveur}
            onChange={(e) => setReceveur(e.target.value)}
            disabled={reserve === 0}
            aria-label="Le joueur qui reçoit un booster cadeau"
          >
            <option value="">{reserve === 0 ? 'Rien à donner' : 'À quel joueur ?'}</option>
            {receveurs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.pseudo}
                {j.boostersPerso > 0
                  ? ` (a déjà ${j.boostersPerso} Booster${j.boostersPerso > 1 ? 's' : ''} Perso)`
                  : ''}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-gold" disabled={reserve === 0 || !receveur || busy !== null}>
            Donner 1 booster
          </button>
        </form>

        {aRedonner.length === 0 ? (
          <Vide>
            Aucun booster à donner. Dès qu’un viewer qui ne joue pas prend un sub de niveau 3 ou offre 5 subs, son
            booster arrive ici.
          </Vide>
        ) : (
          <section className="adm-bloc">
            <h3 className="adm-intertitre">Qui les a payés</h3>
            <ul className="adm-personnes">
              {aRedonner.map((d) => (
                <li key={d.twitchId}>
                  <Avatar pseudo={d.pseudo} statut="viewer" />
                  <div className="min-w-0 flex-1">
                    <p className="adm-personne-nom">{d.pseudo}</p>
                    <p className="adm-personne-detail">
                      {[
                        d.offerts > 0 ? `${pluriel(d.offerts, 'sub')} offert${d.offerts > 1 ? 's' : ''}` : null,
                        d.niveau3 > 0 ? `${pluriel(d.niveau3, 'sub')} de niveau 3` : null,
                        d.donnes > 0 ? `${flakes(d.donnes)} déjà donné${d.donnes > 1 ? 's' : ''}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span
                    className="adm-compte"
                    title={`${d.restants} booster${d.restants > 1 ? 's' : ''} cadeau à donner`}
                  >
                    {flakes(d.restants)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {dons.length > 0 && (
          <section className="adm-bloc">
            <h3 className="adm-intertitre">Déjà donnés</h3>
            <ul className="adm-dons">
              {dons.slice(0, 8).map((d) => (
                <li key={d.id}>
                  <p>
                    <b>{d.joueur}</b> a reçu un booster payé par {d.donateur}
                  </p>
                  <time dateTime={d.le}>{quand(d.le, maintenant)}</time>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Panneau>

      {/* -------------------------------- Le fil des subs -------------------------------- */}
      <Panneau
        zone="fil"
        ton="glace"
        surtitre="En direct de la chaîne"
        titre="Les subs"
        sousTitre="Chaque sub payé fait avancer le compteur ; les subs Prime ne comptent pas."
        actions={
          <Recherche
            valeur={recherche}
            onChange={(v) => {
              setRecherche(v);
              setMontres(PAS);
            }}
          />
        }
        defile
      >
        <div className="adm-outils">
          <Filtres
            valeur={filtre}
            onChange={(f) => {
              setFiltre(f);
              setMontres(PAS);
            }}
            options={[
              { cle: 'tout', nom: 'Tout', compte: comptes.tout },
              { cle: 'joueurs', nom: 'Joueurs', compte: comptes.joueurs },
              { cle: 'viewers', nom: 'Viewers', compte: comptes.viewers },
              { cle: 'offerts', nom: 'Offerts', compte: comptes.offerts },
            ]}
          />
          <button
            type="button"
            className="adm-ordre"
            onClick={() => {
              setOrdre((o) => (o === 'recent' ? 'ancien' : 'recent'));
              setMontres(PAS);
            }}
            title={ordre === 'recent' ? 'Les plus récents d’abord' : 'Les plus anciens d’abord'}
            aria-label={ordre === 'recent' ? 'Les plus récents d’abord' : 'Les plus anciens d’abord'}
          >
            <span aria-hidden="true">{ordre === 'recent' ? '↓' : '↑'}</span>
            {ordre === 'recent' ? 'Récents' : 'Anciens'}
          </button>
        </div>

        {groupes.length === 0 ? (
          <Vide>{recherche.trim() ? 'Aucun pseudo ne correspond.' : 'Aucun sub pour l’instant.'}</Vide>
        ) : (
          groupes.map((g) => (
            <section key={g.jour} className="adm-jour">
              <h3 className="adm-jour-tete">
                <span>{g.nom}</span>
                <span>{pluriel(g.total, 'sub')}</span>
              </h3>
              <ol className="adm-subs">
                {g.lignes.map((s) => (
                  <LigneSub key={s.id} s={s} />
                ))}
              </ol>
            </section>
          ))
        )}
        {reste > 0 && (
          <button type="button" className="btn btn-sm btn-ghost adm-plus" onClick={() => setMontres((n) => n + PAS)}>
            Voir {Math.min(PAS, reste)} de plus
          </button>
        )}
      </Panneau>

      {/* ------------------------------- Les paliers ------------------------------- */}
      <Panneau
        zone="paliers"
        ton="aurore"
        surtitre="Ce que les subs font tomber"
        titre="Les paliers"
        sousTitre="Pour tous les joueurs à la fois."
        defile
      >
        <div className="adm-paliers">{paliers}</div>
      </Panneau>
    </EcranAdmin>
  );
}
