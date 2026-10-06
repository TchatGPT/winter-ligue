'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAction } from '@/components/admin/action';
import { EcranAdmin, Filtres, Mesure, Panneau, Pastille, Recherche, Vide, plat } from '@/components/admin/Kit';
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
  /** Joue sur le site ; nul pour un cadeau anonyme. */
  inscrit: boolean | null;
  /** Les Boosters Perso que ce sub vaut d'emblée (un par sub de niveau 3). */
  boosters: number;
}

/** Quelqu'un qui a payé des subs sans être sur le site : sa part de la réserve. */
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

/** Un booster cadeau déjà redonné. */
export interface DonVue {
  id: string;
  le: string;
  joueur: string;
  donateur: string;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

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

/** « Aujourd'hui », « Hier », « lundi 5 octobre ». */
function nomDuJour(iso: string, maintenant: string): string {
  const jour = jourDe(iso);
  if (jour === jourDe(maintenant)) return 'Aujourd’hui';
  if (jour === jourDe(new Date(Date.parse(maintenant) - 86_400_000).toISOString())) return 'Hier';
  const long = JOUR_LONG.format(new Date(iso));
  return long.charAt(0).toUpperCase() + long.slice(1);
}

/** Ce qu'a fait un sub, en une phrase. */
function phrase(s: SubVue): string {
  const niveau = s.niveau > 1 ? ` de niveau ${s.niveau}` : '';
  if (s.genre === 'cadeau') return `${s.pseudo} a offert ${pluriel(s.nombre, 'sub')}${niveau}`;
  if (s.genre === 'resub') return `${s.pseudo} a renouvelé son abonnement${niveau}`;
  return `${s.pseudo} s’est abonné${niveau}`;
}

/* ------------------------------- L'écran ------------------------------- */

type FiltreFil = 'tout' | 'site' | 'hors' | 'offerts';

/**
 * Le tableau de bord de la modération : ce qui attend un geste, et le fil des
 * subs.
 *
 *  - Les subs payés comptent pour la saison. Un sub de niveau 3, ou cinq subs
 *    offerts, valent en plus un Booster Perso : à qui les paie s'il joue sur
 *    le site, sinon un **booster cadeau**, que la modération redonne à un
 *    joueur. S'il arrive sur le site, il reçoit ce qui n'a pas été redonné.
 *  - Le fil raconte chaque sub en une phrase, jour par jour, et dit si son
 *    auteur joue sur le site.
 */
export function TableauDeBord({
  subs,
  donateurs,
  dons,
  receveurs,
  totalSubs,
  prochainPalier,
  inscrits,
  aOuvrir,
  twitchBranche,
  maintenant,
}: {
  subs: SubVue[];
  donateurs: DonateurVue[];
  dons: DonVue[];
  receveurs: ReceveurVue[];
  totalSubs: number;
  prochainPalier: string;
  inscrits: number;
  aOuvrir: { perso: number; ligue: number };
  /** Les subs de Twitch sont-ils branchés ? Nul : Twitch n'a pas répondu. */
  twitchBranche: boolean | null;
  maintenant: string;
}) {
  const { busy, message, envoie, setMessage } = useAction();
  const [receveur, setReceveur] = useState('');
  const [filtre, setFiltre] = useState<FiltreFil>('tout');
  const [recherche, setRecherche] = useState('');

  const reserve = donateurs.reduce((n, d) => n + d.restants, 0);
  const aRedonner = donateurs.filter((d) => d.restants > 0).sort((a, b) => b.restants - a.restants);
  const totalOuvrir = aOuvrir.perso + aOuvrir.ligue;

  const fil = useMemo(() => {
    const q = plat(recherche.trim());
    const gardes = subs.filter((s) => {
      if (filtre === 'site' && s.inscrit !== true) return false;
      if (filtre === 'hors' && s.inscrit === true) return false;
      if (filtre === 'offerts' && s.genre !== 'cadeau') return false;
      return !q || plat(s.pseudo).includes(q);
    });
    const groupes: { jour: string; nom: string; lignes: SubVue[] }[] = [];
    for (const s of [...gardes].sort((a, b) => b.le.localeCompare(a.le))) {
      const jour = jourDe(s.le);
      const dernier = groupes.at(-1);
      if (dernier?.jour === jour) dernier.lignes.push(s);
      else groupes.push({ jour, nom: nomDuJour(s.le, maintenant), lignes: [s] });
    }
    return groupes;
  }, [subs, filtre, recherche, maintenant]);

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

  return (
    <EcranAdmin
      intro="Ce qui attend un geste, et chaque sub de la saison."
      grille={twitchBranche === false ? 'tableau-alerte' : 'tableau'}
      message={message}
      onFermeMessage={() => setMessage(null)}
    >
      {twitchBranche === false && (
        <div className="adm-alerte" style={{ gridArea: 'alerte' }} role="status">
          <span className="adm-alerte-icone" aria-hidden="true">
            !
          </span>
          <p>
            <b>Twitch n’est pas branché :</b> les subs Prime comptent encore comme des subs payés. Lriaa doit rebrancher
            les subs.
          </p>
          <Link href="/admin/saison" className="btn btn-sm btn-ice no-underline">
            Voir comment →
          </Link>
        </div>
      )}

      {/* ------------------------------ Les chiffres ------------------------------ */}
      <section className="glass adm-mesures" style={{ gridArea: 'mesures' }} aria-label="La saison en chiffres">
        <Mesure valeur={flakes(totalSubs)} libelle={<>subs cette saison · {prochainPalier}</>} ton="aurore" />
        <Mesure valeur={inscrits} libelle="joueurs sur le site" />
        <Mesure
          valeur={reserve}
          libelle={reserve > 1 ? 'boosters cadeau à redonner' : 'booster cadeau à redonner'}
          ton="or"
        />
        {/* Les boosters à ouvrir : un lien vers la page où ils s'ouvrent. */}
        <Link href="/boosters" className="adm-mesure adm-mesure-lien no-underline" data-ton="glace">
          <strong>{totalOuvrir}</strong>
          <span>
            à ouvrir en live : {aOuvrir.perso} Perso, {aOuvrir.ligue} de la ligue →
          </span>
        </Link>
      </section>

      {/* ---------------------------- Les boosters cadeau ---------------------------- */}
      <Panneau
        zone="cadeau"
        ton="or"
        icone="cadeau"
        titre="Boosters cadeau"
        sousTitre="Payés par des gens qui ne jouent pas sur le site : à redonner à des joueurs de la ligue."
        defile
      >
        <div className="adm-don">
          <p className="adm-don-reserve">
            <strong>{reserve}</strong>
            <span>à redonner</span>
          </p>
          <div className="adm-don-form">
            <select
              className="field"
              value={receveur}
              onChange={(e) => setReceveur(e.target.value)}
              disabled={reserve === 0}
              aria-label="Le joueur qui reçoit un booster cadeau"
            >
              <option value="">{reserve === 0 ? 'Rien à redonner' : 'À quel joueur ?'}</option>
              {receveurs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.pseudo}
                  {j.boostersPerso > 0
                    ? ` (a déjà ${j.boostersPerso} Booster${j.boostersPerso > 1 ? 's' : ''} Perso)`
                    : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ice"
              disabled={reserve === 0 || !receveur || busy !== null}
              onClick={donne}
            >
              Donner 1 booster
            </button>
          </div>
        </div>

        {aRedonner.length === 0 ? (
          <Vide>
            Personne à qui reprendre un booster. Dès qu’une personne absente du site offre 5 subs ou prend un sub de
            niveau 3, son booster arrive ici.
          </Vide>
        ) : (
          <>
            <p className="adm-sous-titre">D’où ils viennent</p>
            <ul className="adm-donateurs">
              {aRedonner.map((d) => (
                <li key={d.twitchId}>
                  <div className="min-w-0">
                    <b>{d.pseudo}</b>
                    <span>
                      {[
                        d.offerts > 0 ? `a offert ${pluriel(d.offerts, 'sub')}` : null,
                        d.niveau3 > 0 ? `${pluriel(d.niveau3, 'sub')} de niveau 3` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {d.donnes > 0 ? ` · ${d.donnes} déjà redonné${d.donnes > 1 ? 's' : ''}` : ''}
                    </span>
                  </div>
                  <Pastille ton="or">{d.restants}</Pastille>
                </li>
              ))}
            </ul>
          </>
        )}
        {dons.length > 0 && (
          <p className="adm-note">
            Dernier don : à <b>{dons[0].joueur}</b>, payé par {dons[0].donateur}.
          </p>
        )}
      </Panneau>

      {/* -------------------------------- Le fil des subs -------------------------------- */}
      <Panneau
        zone="fil"
        icone="antenne"
        titre="Les subs, un par un"
        sousTitre={
          <>
            Chaque sub payé compte pour la saison. <b>1 sub de niveau 3</b> ou <b>5 subs offerts</b> = 1 Booster Perso
            pour la personne si elle joue sur le site, sinon 1 booster cadeau.
          </>
        }
        defile
      >
        <div className="adm-outils">
          <Recherche valeur={recherche} onChange={setRecherche} />
          <Filtres
            valeur={filtre}
            onChange={setFiltre}
            options={[
              { cle: 'tout', nom: 'Tout', compte: subs.length },
              { cle: 'site', nom: 'Joueurs du site', compte: subs.filter((s) => s.inscrit === true).length },
              { cle: 'hors', nom: 'Pas sur le site', compte: subs.filter((s) => s.inscrit !== true).length },
              { cle: 'offerts', nom: 'Subs offerts', compte: subs.filter((s) => s.genre === 'cadeau').length },
            ]}
          />
        </div>
        {fil.length === 0 ? (
          <Vide>{recherche.trim() ? 'Aucun pseudo ne correspond.' : 'Aucun sub pour l’instant.'}</Vide>
        ) : (
          <div className="adm-fil">
            {fil.map((g) => (
              <section key={g.jour}>
                <h3 className="adm-fil-jour">
                  {g.nom}
                  <span>
                    {pluriel(
                      g.lignes.reduce((n, s) => n + s.nombre, 0),
                      'sub',
                    )}
                  </span>
                </h3>
                <ul>
                  {g.lignes.map((s) => (
                    <li key={s.id} className="adm-fil-ligne" data-genre={s.genre}>
                      <span className="adm-fil-pastille" aria-hidden="true">
                        {s.genre === 'cadeau' ? `×${s.nombre}` : s.genre === 'resub' ? '↻' : '+1'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="adm-fil-phrase">{phrase(s)}</p>
                        <p className="adm-fil-detail">
                          <time>{HEURE.format(new Date(s.le))}</time>
                          {s.inscrit === true && <Pastille ton="aurore">joue sur le site</Pastille>}
                          {s.inscrit === false && <Pastille ton="or">pas sur le site</Pastille>}
                          {s.inscrit === null && <Pastille>anonyme</Pastille>}
                          {s.boosters > 0 && (
                            <Pastille ton={s.inscrit ? 'aurore' : 'or'}>
                              {s.inscrit
                                ? `+${pluriel(s.boosters, 'Booster')} Perso`
                                : `+${s.boosters} booster${s.boosters > 1 ? 's' : ''} cadeau`}
                            </Pastille>
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panneau>
    </EcranAdmin>
  );
}
