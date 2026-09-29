'use client';

/**
 * Le salon des duels.
 *
 * En tête, sur toute la largeur, les duels à rejoindre : c'est ce qu'on vient
 * voir d'abord. Dessous, à gauche le ring, où l'on règle sa mise et où deux
 * boutons engagent — le bot, tout de suite, ou les joueurs ; à droite les
 * résultats, à revoir d'un clic.
 *
 * L'arène s'ouvre par-dessus, au centre de l'écran, dès le clic : les deux
 * pères Noël se mettent en place pendant que le serveur tire le duel, puis la
 * course se joue. Il n'y a rien à faire défiler pour la regarder.
 *
 * ## Le sondage plutôt que le temps réel
 *
 * Le projet n'a pas de canal permanent, et n'en a pas besoin ici. Un duel se
 * rejoint en un clic ; deux secondes de retard sur l'affichage n'ont jamais
 * fait rater personne. Le sondage s'arrête pendant qu'un duel se joue, où il
 * ne servirait à rien.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  ArenePreparation,
  BatailleArene,
  initiale,
  type BatailleVueClient,
  type CampApercu,
} from '@/components/BatailleArene';
import { IconSwords } from '@/components/icons';
import { reveilleSonsDuel } from '@/components/sonsDuel';
import { Notice, flakes } from '@/components/ui';
import { shortDateTime } from '@/lib/format';

/** Le rythme du sondage, quand personne ne joue. */
const SONDAGE = 2000;

interface Charge {
  batailles: BatailleVueClient[];
  top: BatailleVueClient[];
  balance: number | null;
  bornes: { manches: { min: number; max: number }; mise: { min: number; max: number } };
  moiId: string | null;
}

/** Les mises proposées d'un clic. Le curseur et le champ font le reste. */
const MISES = [100, 250, 500, 1000, 2500, 5000];

const BOT: CampApercu = { pseudo: 'Le Bot', bot: true };

/** Le pot : les deux mises réunies. C'est ce qui change de mains. */
const pot = (b: BatailleVueClient) => b.mise * 2;

/* ------------------------------------------------------------------------ */
/* Le curseur de mise                                                        */
/* ------------------------------------------------------------------------ */

/*
 * Le curseur n'est pas linéaire : de 50 à 20 000, un pixel vaudrait trente
 * flocons, et les petites mises — les plus jouées — tiendraient dans le
 * premier centimètre. La position suit la racine carrée de la mise : la
 * moitié de la course couvre le premier quart des montants.
 */
const COURSE = 1000;
const PAS_MISE = 50;

function versCurseur(mise: number, min: number, max: number): number {
  if (max <= min) return COURSE;
  const t = Math.min(1, Math.max(0, (mise - min) / (max - min)));
  return Math.round(Math.sqrt(t) * COURSE);
}

function depuisCurseur(position: number, min: number, max: number): number {
  const t = (position / COURSE) ** 2;
  const brute = Math.round((min + t * (max - min)) / PAS_MISE) * PAS_MISE;
  return Math.min(max, Math.max(min, brute));
}

/* ------------------------------------------------------------------------ */
/* La fenêtre de l'arène                                                     */
/* ------------------------------------------------------------------------ */

const rienAEcouter = () => () => {};

/**
 * Vrai une fois la page montée dans le navigateur. Le portail vise
 * `document.body`, qui n'existe pas au rendu serveur.
 */
function useNavigateur(): boolean {
  return useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
}

function FenetreDuel({
  titre,
  ferme,
  pied,
  children,
}: {
  titre: string;
  ferme: () => void;
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigateur = useNavigateur();
  const boutonFermer = useRef<HTMLButtonElement>(null);

  // Le rappel change à chaque rendu du salon ; l'écoute du clavier, elle, ne
  // doit s'installer qu'une fois — sinon le focus reviendrait sur la croix à
  // chaque lancer.
  const rappel = useRef(ferme);
  useEffect(() => {
    rappel.current = ferme;
  }, [ferme]);

  useEffect(() => {
    if (!navigateur) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') rappel.current();
    };
    window.addEventListener('keydown', surTouche);
    boutonFermer.current?.focus();
    // La page ne défile plus sous la fenêtre.
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', surTouche);
      document.body.style.overflow = avant;
    };
  }, [navigateur]);

  // Un portail vers <body> : les plaques de verre portent un backdrop-filter,
  // qui ferait d'elles le bloc de référence d'un élément fixe. La fenêtre se
  // cale sur l'écran, pas sur la plaque.
  if (!navigateur) return null;
  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-label={titre} onClick={ferme}>
      <div className="fenetre-carte glass glass-reflet relative" onClick={(e) => e.stopPropagation()}>
        <button
          ref={boutonFermer}
          type="button"
          className="btn btn-sm absolute top-5 right-5 z-10"
          onClick={ferme}
          aria-label="Fermer"
        >
          ✕
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-10 pb-6 sm:px-8">{children}</div>
        {pied && (
          <footer className="relative flex flex-wrap justify-center gap-2 border-t border-white/15 px-4 py-4">
            {pied}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------------ */
/* Le salon                                                                  */
/* ------------------------------------------------------------------------ */

type Fenetre =
  | { etat: 'attente'; jeton: number; gauche: CampApercu; droite: CampApercu; moi: 'gauche' | 'droite'; mise: number }
  | { etat: 'duel'; bataille: BatailleVueClient; anime: boolean; tour: number; fini: boolean }
  | { etat: 'erreur'; message: string };

type Resultat = { ok: true; data: BatailleVueClient } | { ok: false; message: string };

/** Un numéro par fenêtre ouverte : il distingue une attente, ou un visionnage, du suivant. */
let dernierNumero = 0;
const nouveauNumero = () => ++dernierNumero;

/**
 * Attend la promesse, et au moins `ms` millisecondes : sans ce minimum, la
 * réponse arrive si vite que l'attente clignote.
 */
async function auMoins<T>(ms: number, promesse: Promise<T>): Promise<T> {
  const [valeur] = await Promise.all([promesse, new Promise((fin) => setTimeout(fin, ms))]);
  return valeur;
}

async function poste(url: string, corps: unknown): Promise<Resultat> {
  try {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const charge = await reponse.json();
    if (!charge.ok) return { ok: false, message: charge.error?.message ?? 'Action impossible.' };
    return { ok: true, data: charge.data as BatailleVueClient };
  } catch {
    return { ok: false, message: 'Le serveur n’a pas répondu. Réessaie dans un instant.' };
  }
}

export function Affrontements({
  initial,
  moiPseudo,
  soldeMax,
}: {
  initial: Charge;
  moiPseudo: string | null;
  soldeMax: number;
}) {
  const [etat, setEtat] = useState<Charge>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  /** La mise du duel qu'on monte. */
  const [mise, setMise] = useState(MISES[0]);

  type Onglet = 'recents' | 'miens' | 'top';
  const [onglet, setOnglet] = useState<Onglet>('recents');

  const [fenetre, setFenetre] = useState<Fenetre | null>(null);

  const moi: CampApercu = { pseudo: moiPseudo ?? 'Toi', bot: false };
  const { min: miseMin, max: miseMax } = etat.bornes.mise;
  const solde = etat.balance;
  const joueur = etat.moiId !== null;
  const miseValide = Number.isInteger(mise) && mise >= miseMin && mise <= miseMax;
  const abordable = solde !== null && solde >= mise;
  const peutJouer = joueur && miseValide && abordable && !occupe;
  /** Le haut du curseur : ce qu'on peut se permettre, dans les bornes. */
  const plafond = Math.max(miseMin, Math.min(miseMax, solde ?? miseMax));

  const recharge = useCallback(async () => {
    try {
      const reponse = await fetch('/api/affrontements', { cache: 'no-store' });
      const charge = await reponse.json();
      if (charge.ok) setEtat(charge.data);
    } catch {
      // Un sondage qui échoue ne mérite pas de message : le suivant passera.
    }
  }, []);

  const fenetreOuverte = fenetre !== null;
  useEffect(() => {
    if (fenetreOuverte) return;
    const t = setInterval(recharge, SONDAGE);
    return () => clearInterval(t);
  }, [fenetreOuverte, recharge]);

  /* ------------------------------ Les gestes ----------------------------- */

  const enCours = useRef(false);
  /** Le jeton de l'attente affichée ; null si la fenêtre a été fermée entre-temps. */
  const attenteOuverte = useRef<number | null>(null);

  /** Joue un duel : la fenêtre s'ouvre tout de suite, le serveur tire pendant ce temps. */
  async function joue(
    url: string,
    corps: unknown,
    apercu: { gauche: CampApercu; droite: CampApercu; moi: 'gauche' | 'droite'; mise: number },
  ) {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    setErreur(null);
    setInfo(null);
    // Le contexte audio se réveille ici, pendant le geste : ouvert plus tard,
    // il naîtrait suspendu et la course serait muette.
    reveilleSonsDuel();

    const jeton = nouveauNumero();
    attenteOuverte.current = jeton;
    setFenetre({ etat: 'attente', jeton, ...apercu });

    const resultat = await auMoins(700, poste(url, corps));

    const toujoursLa = attenteOuverte.current === jeton;
    attenteOuverte.current = null;
    if (resultat.ok) {
      const b = resultat.data;
      if (toujoursLa) {
        setFenetre({ etat: 'duel', bataille: b, anime: true, tour: nouveauNumero(), fini: false });
      } else {
        // Fenêtre fermée pendant le tirage : le duel est joué quand même, on le dit.
        setInfo(
          b.vainqueurId === etat.moiId
            ? `Duel joué : tu as raflé ${flakes(pot(b))} ❄. Il est dans les résultats.`
            : `Duel joué : perdu, ta mise de ${flakes(b.mise)} ❄ est partie. Il est dans les résultats.`,
        );
      }
    } else if (toujoursLa) {
      setFenetre({ etat: 'erreur', message: resultat.message });
    } else {
      setErreur(resultat.message);
    }

    enCours.current = false;
    setOccupe(false);
    void recharge();
  }

  /** Un geste sans arène : ouvrir son duel, ou l'annuler. */
  async function agit(url: string, corps: unknown, succes: (b: BatailleVueClient) => string) {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    setErreur(null);
    setInfo(null);
    const resultat = await poste(url, corps);
    if (resultat.ok) setInfo(succes(resultat.data));
    else setErreur(resultat.message);
    enCours.current = false;
    setOccupe(false);
    void recharge();
  }

  const contreLeBot = (m: number) =>
    joue('/api/affrontements/bot', { mise: m }, { gauche: moi, droite: BOT, moi: 'gauche', mise: m });

  const ouvreAuxJoueurs = () =>
    agit(
      '/api/affrontements',
      { mise },
      (b) =>
        `Ton duel est ouvert : ${flakes(b.mise)} ❄ misés. Il attend un adversaire dans « Duels à rejoindre », et tu peux l’annuler tant que personne ne l’a relevé.`,
    );

  const releve = (b: BatailleVueClient) =>
    joue(
      '/api/affrontements/rejoindre',
      { batailleId: b.id },
      { gauche: { pseudo: b.camps[0]?.pseudo ?? '?', bot: false }, droite: moi, moi: 'droite', mise: b.mise },
    );

  const botSurLeMien = (b: BatailleVueClient) =>
    joue('/api/affrontements/bot', { batailleId: b.id }, { gauche: moi, droite: BOT, moi: 'gauche', mise: b.mise });

  const annule = (b: BatailleVueClient) =>
    agit('/api/affrontements/annuler', { batailleId: b.id }, () => `Duel annulé : ta mise de ${flakes(b.mise)} ❄ t’est rendue.`);

  const revoit = (b: BatailleVueClient) => {
    reveilleSonsDuel();
    setFenetre({ etat: 'duel', bataille: b, anime: true, tour: nouveauNumero(), fini: false });
  };

  function ferme() {
    attenteOuverte.current = null;
    setFenetre(null);
    void recharge();
  }

  const marqueFini = useCallback(() => {
    setFenetre((f) => (f && f.etat === 'duel' ? { ...f, fini: true } : f));
  }, []);

  /* ------------------------------ Les listes ----------------------------- */

  const ouverts = etat.batailles.filter((b) => b.statut === 'ATTENTE');
  // Ceux qu'on peut relever d'abord ; le sien ensuite.
  const aRejoindre = [...ouverts].sort(
    (a, b) => Number(a.hoteId === etat.moiId) - Number(b.hoteId === etat.moiId) || b.mise - a.mise,
  );
  const jouees = etat.batailles.filter((b) => b.statut === 'TERMINEE');
  const miens = jouees.filter((b) => joueur && b.camps.some((c) => c.id === etat.moiId));
  const listes: Record<Onglet, { titre: string; lignes: BatailleVueClient[]; vide: string }> = {
    recents: { titre: 'Récents', lignes: jouees, vide: 'Aucun duel joué pour l’instant.' },
    miens: { titre: 'Les miens', lignes: miens, vide: 'Tu n’as encore joué aucun duel.' },
    top: { titre: 'Top 7 jours', lignes: etat.top, vide: 'Aucun duel joué ces sept derniers jours.' },
  };
  const liste = listes[onglet];

  /* ------------------------------- Le bilan ------------------------------ */

  // Le solde est plafonné : au-delà, le gain d'une victoire serait perdu.
  const gainReel =
    solde !== null && miseValide ? Math.max(0, Math.min(mise * 2, soldeMax - (solde - mise)) - mise) : mise;
  const gainPerdu = miseValide ? mise - gainReel : 0;

  /* ------------------------------- La fenêtre ---------------------------- */

  let contenuFenetre: React.ReactNode = null;
  let piedFenetre: React.ReactNode = null;
  if (fenetre?.etat === 'attente') {
    // Le pied existe déjà pendant le tirage : sans lui, la fenêtre grandirait
    // d'un cran au départ de la course.
    piedFenetre = (
      <button type="button" className="btn btn-ghost" disabled>
        Tirage en cours…
      </button>
    );
    contenuFenetre = (
      <ArenePreparation gauche={fenetre.gauche} droite={fenetre.droite} moi={fenetre.moi} mise={fenetre.mise} />
    );
  } else if (fenetre?.etat === 'erreur') {
    contenuFenetre = (
      <div className="py-6 text-center">
        <p className="eyebrow">Duel impossible</p>
        <p className="mx-auto mt-3 max-w-md text-[16px] leading-relaxed text-ink">{fenetre.message}</p>
      </div>
    );
    piedFenetre = (
      <button type="button" className="btn btn-ice" onClick={ferme}>
        Revenir aux duels
      </button>
    );
  } else if (fenetre?.etat === 'duel') {
    const b = fenetre.bataille;
    const monDuelBot = b.camps[1]?.bot === true && b.hoteId === etat.moiId;
    const revanchePossible = monDuelBot && solde !== null && solde >= b.mise && !occupe;
    contenuFenetre = (
      <BatailleArene key={fenetre.tour} bataille={b} moiId={etat.moiId} anime={fenetre.anime} onFini={marqueFini} />
    );
    piedFenetre = fenetre.fini ? (
      <>
        {monDuelBot && (
          <button type="button" className="btn btn-ice" disabled={!revanchePossible} onClick={() => contreLeBot(b.mise)}>
            Revanche · {flakes(b.mise)} ❄
          </button>
        )}
        <button type="button" className="btn" onClick={() => revoit(b)}>
          Revoir la course
        </button>
        <button type="button" className="btn btn-ghost" onClick={ferme}>
          Fermer
        </button>
      </>
    ) : (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setFenetre({ ...fenetre, anime: false, tour: nouveauNumero(), fini: true })}
      >
        Passer au résultat
      </button>
    );
  }

  /* -------------------------------- Rendu -------------------------------- */

  return (
    <div className="space-y-5">
      {erreur && <Notice kind="error">{erreur}</Notice>}
      {info && <Notice kind="success">{info}</Notice>}

      {/* ========================= Les duels à rejoindre =======================
          En tête, sur toute la largeur : c'est ce qu'on vient voir d'abord. Un
          défi ouvert est une carte entière, avec sa mise en grand et son
          bouton — pas une ligne dans une colonne. */}
      <section className="rejoindre" aria-labelledby="rejoindre-titre" data-vide={aRejoindre.length === 0 ? '' : undefined}>
        <header className="rejoindre-tete">
          <h2 id="rejoindre-titre">Duels à rejoindre</h2>
          <span className="rejoindre-compte" data-actif={aRejoindre.length > 0 ? '' : undefined}>
            {aRejoindre.length}
          </span>
          <p>
            {aRejoindre.length === 0
              ? 'Personne n’attend d’adversaire. Défie les joueurs : ton duel s’affichera ici.'
              : 'Relève un défi : tu mises autant que lui, et la course part aussitôt.'}
          </p>
        </header>

        {aRejoindre.length > 0 && (
          <ul className="rejoindre-grille">
            {aRejoindre.map((b) => {
              const hote = b.camps[0];
              const mien = b.hoteId === etat.moiId;
              const manque = solde !== null && solde < b.mise ? b.mise - solde : 0;
              return (
                <li key={b.id} className="defi" data-mien={mien ? '' : undefined}>
                  <div className="defi-qui">
                    <span className="orbe orbe-sm" aria-hidden="true">
                      {hote ? initiale(hote) : '?'}
                    </span>
                    <div className="min-w-0">
                      <b>{mien ? 'Ton duel' : (hote?.pseudo ?? '?')}</b>
                      <small>
                        {mien ? 'attend un adversaire' : 'te défie'} · {shortDateTime(b.creeeA)}
                      </small>
                    </div>
                  </div>
                  <div className="defi-mise">
                    <small>Mise</small>
                    <strong>
                      {flakes(b.mise)} <span className="text-ice">❄</span>
                    </strong>
                    <small>le gagnant rafle {flakes(pot(b))} ❄</small>
                  </div>
                  <div className="defi-actions">
                    {mien ? (
                      <>
                        <button type="button" className="btn btn-ice" disabled={occupe} onClick={() => botSurLeMien(b)}>
                          Contre le bot
                        </button>
                        <button type="button" className="btn btn-ghost" disabled={occupe} onClick={() => annule(b)}>
                          Annuler
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ice"
                        disabled={occupe || !joueur || solde === null || manque > 0}
                        onClick={() => releve(b)}
                      >
                        {manque > 0 ? `Il te manque ${flakes(manque)} ❄` : 'Relever le défi'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* =============================== Le ring ============================== */}
        <section className="glass ring relative overflow-hidden" aria-labelledby="ring-titre">
          <header className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Nouveau duel</p>
              <h2
                id="ring-titre"
                className="mt-1 font-display text-3xl leading-none font-black tracking-wide text-ink uppercase sm:text-4xl"
              >
                Lance ton duel
              </h2>
            </div>
            {solde !== null && (
              <div className="ring-solde">
                <span>Ton solde</span>
                <strong>
                  {flakes(solde)} <span className="text-ice">❄</span>
                </strong>
              </div>
            )}
          </header>

          {/* La session s'est perdue en route — expirée, ou sans joueur derrière
              elle. On le dit, et on donne de quoi repartir. */}
          {!joueur && (
            <div className="ring-reconnexion">
              <p>
                <strong>Ta session ne permet pas de jouer.</strong> Elle a expiré, ou elle n’est rattachée à aucun
                joueur. Reconnecte-toi, et le ring est à toi.
              </p>
              <a href="/connexion" className="btn btn-ice no-underline">
                Se reconnecter
              </a>
            </div>
          )}
          {joueur && solde !== null && solde < miseMin && (
            <div className="ring-reconnexion">
              <p>
                <strong>Tu n’as plus assez de flocons.</strong> Il en faut au moins {flakes(miseMin)} pour miser. Ils
                se gagnent à chaque game saisie.
              </p>
            </div>
          )}

          {/* ---- L'affiche : toi, ta mise, l'adversaire ---- */}
          <div className="ring-affiche" aria-hidden="true">
            <div className="ring-camp">
              <span className="orbe">{initiale(moi)}</span>
              <b>{moi.pseudo}</b>
              <small>mise {miseValide ? flakes(mise) : '—'} ❄</small>
            </div>
            <div className="ring-pot">
              <small>Le gagnant rafle</small>
              <strong>
                {miseValide ? flakes(mise * 2) : '—'} <span className="text-ice">❄</span>
              </strong>
              <small>Le perdant perd toute sa mise</small>
            </div>
            <div className="ring-camp">
              <span className="orbe" data-inconnu="">
                ?
              </span>
              <b>Adversaire</b>
              <small>mise {miseValide ? flakes(mise) : '—'} ❄</small>
            </div>
          </div>

          {/* ---- La mise ---- */}
          <fieldset className="mt-5 min-w-0 space-y-3">
            <legend className="eyebrow mb-3">Ta mise</legend>
            <div className="flex items-center gap-3">
              <input
                type="range"
                className="curseur"
                min={0}
                max={COURSE}
                step={1}
                value={versCurseur(mise, miseMin, plafond)}
                style={{ ['--rempli' as string]: `${(versCurseur(mise, miseMin, plafond) / COURSE) * 100}%` }}
                disabled={!joueur || occupe || solde === null || solde < miseMin}
                onChange={(e) => setMise(depuisCurseur(Number(e.target.value), miseMin, plafond))}
                aria-label="Mise en flocons"
                aria-valuetext={`${flakes(mise)} flocons`}
              />
              <input
                type="number"
                inputMode="numeric"
                className="field num w-[118px] shrink-0 text-right"
                min={miseMin}
                max={miseMax}
                step={PAS_MISE}
                value={Number.isFinite(mise) ? mise : ''}
                disabled={!joueur || occupe}
                onChange={(e) => setMise(Math.floor(Number(e.target.value)))}
                aria-label="Mise exacte en flocons"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {MISES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mise === m}
                  disabled={!joueur || occupe || (solde !== null && solde < m)}
                  onClick={() => setMise(m)}
                  className={`btn btn-sm ${mise === m ? 'btn-ice' : ''}`}
                >
                  {flakes(m)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={mise === plafond && !MISES.includes(plafond)}
                disabled={!joueur || occupe || solde === null || solde < miseMin}
                onClick={() => setMise(plafond)}
                className={`btn btn-sm ${mise === plafond && !MISES.includes(plafond) ? 'btn-ice' : ''}`}
                title="Tout ce que tu peux miser"
              >
                Tapis
              </button>
            </div>
          </fieldset>

          {/* ---- Le bilan : ce qu'on gagne, ce qu'on perd ---- */}
          <div className="ring-bilan">
            <div>
              <span>Si tu gagnes</span>
              <strong className="text-aurora">{miseValide ? `+${flakes(gainReel)} ❄` : '—'}</strong>
              <small>tu récupères ta mise, plus celle de l’adversaire</small>
            </div>
            <div>
              <span>Si tu perds</span>
              <strong className="text-ink">{miseValide ? `−${flakes(mise)} ❄` : '—'}</strong>
              <small>tu perds 100 % de ta mise</small>
            </div>
          </div>
          {joueur && !miseValide && (
            <p className="mt-2 text-[13px] text-gold">
              La mise va de {flakes(miseMin)} à {flakes(miseMax)} ❄.
            </p>
          )}
          {joueur && miseValide && !abordable && solde !== null && solde >= miseMin && (
            <p className="mt-2 text-[13px] text-gold">Il te manque {flakes(mise - solde)} ❄ pour cette mise.</p>
          )}
          {joueur && miseValide && abordable && gainPerdu > 0 && (
            <p className="mt-2 text-[13px] text-gold">
              Ton solde est plafonné à {flakes(soldeMax)} ❄ : {flakes(gainPerdu)} ❄ du gain seraient perdus.
            </p>
          )}

          {/* ---- Les deux façons d'engager ---- */}
          <div className="ring-actions">
            <div>
              <button
                type="button"
                className="btn btn-ice btn-lg w-full"
                disabled={!peutJouer}
                onClick={() => contreLeBot(mise)}
              >
                <span aria-hidden="true">🤖</span> Affronter le bot
              </button>
              <p>Tout de suite. Le bot mise autant que toi, une chance sur deux.</p>
            </div>
            <div>
              <button type="button" className="btn btn-lg w-full" disabled={!peutJouer} onClick={ouvreAuxJoueurs}>
                <IconSwords className="h-5 w-5" /> Défier les joueurs
              </button>
              <p>Ta mise attend un adversaire. Annulable tant que personne ne l’a relevée.</p>
            </div>
          </div>
        </section>

        {/* ============================= Les résultats ========================== */}
        <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="resultats-titre">
          <header className="relative flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Des courses à revoir</p>
              <h2
                id="resultats-titre"
                className="mt-1 font-display text-2xl leading-none font-black tracking-wide text-ink uppercase"
              >
                Résultats
              </h2>
            </div>
            <div className="segment w-full sm:w-auto" role="group" aria-label="Quels résultats afficher">
              {(['recents', 'miens', 'top'] as const)
                .filter((cle) => cle !== 'miens' || joueur)
                .map((cle) => (
                  <button key={cle} type="button" aria-pressed={onglet === cle} onClick={() => setOnglet(cle)}>
                    {listes[cle].titre}
                    {listes[cle].lignes.length > 0 && (
                      <span className="compte hidden sm:inline">{listes[cle].lignes.length}</span>
                    )}
                  </button>
                ))}
            </div>
          </header>
          {onglet === 'top' && (
            <p className="mt-3 text-[13px] text-muted">Les plus grosses mises des sept derniers jours.</p>
          )}

          {liste.lignes.length === 0 ? (
            <p className="fil-vide mt-4 text-[14px] text-muted">{liste.vide}</p>
          ) : (
            <ul className="fil-liste mt-4">
              {liste.lignes.map((b, i) => {
                const hote = b.camps[0];
                const adverse = b.camps[1];
                const hoteGagne = b.vainqueurId !== null && b.vainqueurId === hote?.id;
                const gagnant = hoteGagne ? hote : adverse;
                const perdant = hoteGagne ? adverse : hote;
                return (
                  <li key={b.id}>
                    <button type="button" className="fil-ligne" onClick={() => revoit(b)} title="Revoir la course">
                      {onglet === 'top' && (
                        <span className="medaille" data-rang={i + 1}>
                          {i + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        {/* Le vainqueur d'abord, toujours : on lit l'issue sans chercher. */}
                        <p className="resultat">
                          <b data-gagne="">{gagnant?.pseudo ?? '?'}</b>
                          <em>a battu</em>
                          <b>{perdant?.pseudo ?? '?'}</b>
                        </p>
                        <p className="mt-1 text-[12px] text-faint">{shortDateTime(b.resolueA ?? b.creeeA)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-xl leading-none font-black text-ink tabular-nums">
                          {flakes(b.mise)} <span className="text-ice">❄</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-bold tracking-[0.14em] text-faint uppercase">
                          mise par camp
                        </p>
                      </div>
                      <span className="hidden text-[18px] text-ice sm:inline" aria-hidden="true">
                        ▶
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {fenetre && (
        <FenetreDuel titre="L’arène du duel" ferme={ferme} pied={piedFenetre}>
          {contenuFenetre}
        </FenetreDuel>
      )}
    </div>
  );
}
