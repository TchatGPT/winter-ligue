'use client';

/**
 * Le salon des duels.
 *
 * En tête, sur toute la largeur, les duels à rejoindre : c'est ce qu'on vient
 * voir d'abord. Dessous, à gauche le ring, où l'on règle sa mise et où deux
 * boutons engagent — le bot, tout de suite, ou les joueurs ; à droite les
 * résultats, aussi hauts que le ring.
 *
 * Un duel joué ne se rejoue pas : la course se voit une fois, en direct. Une
 * fois finie, le verdict reste le temps d'être lu, puis la fenêtre se ferme
 * d'elle-même et le résultat passe en tête du salon.
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

/** Le temps de lire le verdict, avant que la fenêtre ne se ferme d'elle-même. */
const DELAI_VERDICT = 2500;

interface Charge {
  batailles: BatailleVueClient[];
  top: BatailleVueClient[];
  balance: number | null;
  bornes: { manches: { min: number; max: number }; mise: { min: number; max: number } };
  moiId: string | null;
}

/** La mise proposée à l'arrivée. Le curseur et le champ font le reste. */
const MISE_DEPART = 100;

/** Des places libres, pour que la bande des défis garde sa taille, vide ou pas. */
const PLACES_VISIBLES = 3;

const BOT: CampApercu = { pseudo: 'Le Bot', bot: true };

/** Le pot : les deux mises réunies. C'est ce qui change de mains. */
const pot = (b: BatailleVueClient) => b.mise * 2;

/** Ce qu'on dit d'un duel joué, une fois sa fenêtre refermée. */
function bilanDe(b: BatailleVueClient, moiId: string | null): { gagne: boolean; texte: string } {
  const gagne = moiId !== null && b.vainqueurId === moiId;
  const adverse = b.camps.find((c) => c.id !== moiId);
  const contre = adverse ? (adverse.bot ? 'le Bot' : adverse.pseudo) : 'ton adversaire';
  return gagne
    ? { gagne, texte: `Duel gagné contre ${contre} : tu rafles ${flakes(pot(b))} ❄.` }
    : { gagne, texte: `Duel perdu contre ${contre} : ta mise de ${flakes(b.mise)} ❄ est partie.` };
}

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
  /** L'issue du dernier duel joué, affichée quand sa fenêtre se referme. */
  const [bilan, setBilan] = useState<{ gagne: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  /** La mise du duel qu'on monte. */
  const [mise, setMise] = useState(MISE_DEPART);

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
    setBilan(null);
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
        setBilan(bilanDe(b, etat.moiId));
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
    setBilan(null);
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

  function ferme() {
    attenteOuverte.current = null;
    // Fermée avant la fin de la course, la fenêtre ne cache pas l'issue.
    if (fenetre?.etat === 'duel') setBilan(bilanDe(fenetre.bataille, etat.moiId));
    setFenetre(null);
    void recharge();
  }

  const marqueFini = useCallback(() => {
    setFenetre((f) => (f && f.etat === 'duel' ? { ...f, fini: true } : f));
  }, []);

  // La course finie, le verdict reste le temps d'être lu, puis la fenêtre se
  // ferme d'elle-même et l'issue passe en tête du salon.
  const duelTermine = fenetre?.etat === 'duel' && fenetre.fini ? fenetre.bataille : null;
  const moiId = etat.moiId;
  useEffect(() => {
    if (!duelTermine) return;
    const t = setTimeout(() => {
      setFenetre(null);
      setBilan(bilanDe(duelTermine, moiId));
      void recharge();
    }, DELAI_VERDICT);
    return () => clearTimeout(t);
  }, [duelTermine, moiId, recharge]);

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
    contenuFenetre = (
      <BatailleArene key={fenetre.tour} bataille={b} moiId={etat.moiId} anime={fenetre.anime} onFini={marqueFini} />
    );
    // Une fois la course finie, la fenêtre se ferme d'elle-même : on peut
    // seulement la fermer un peu plus tôt.
    piedFenetre = fenetre.fini ? (
      <button type="button" className="btn btn-ghost" onClick={ferme}>
        Fermer
      </button>
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
      {bilan && <Notice kind={bilan.gagne ? 'success' : 'info'}>{bilan.texte}</Notice>}

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
              ? 'Personne n’attend d’adversaire. Lance un duel : il s’affichera ici.'
              : 'Relève un défi : tu mises autant que lui, et la course part aussitôt.'}
          </p>
        </header>

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
          {/* Les places libres : la bande garde sa taille, et on voit où
              un défi viendra se poser. */}
          {Array.from({ length: Math.max(0, PLACES_VISIBLES - aRejoindre.length) }, (_, i) => (
            <li key={`libre-${i}`} className="defi defi-libre" aria-hidden="true">
              <span className="orbe orbe-sm" data-inconnu="">
                ?
              </span>
              <b>Place libre</b>
              <small>Un duel lancé s’affiche ici, prêt à être relevé.</small>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:items-stretch">
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
                joueur. Reconnecte-toi pour jouer.
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
          </fieldset>

          {/* ---- Le bilan : ce qu'on mise, ce qu'on gagne, ce qu'on perd ----
              Au flocon près, et le solde qui en résulte : « +100 » ne disait
              pas qu'on recevait 200, ni ce qu'il resterait. */}
          <div className="ring-bilan">
            <div>
              <span>Tu mises</span>
              <strong className="text-ink">{miseValide ? `${flakes(mise)} ❄` : '—'}</strong>
              <small>retirés de ton solde au lancement du duel</small>
            </div>
            <div data-issue="gain">
              <span>Si tu gagnes</span>
              <strong className="text-aurora">{miseValide ? `+${flakes(gainReel)} ❄` : '—'}</strong>
              <small>
                {miseValide
                  ? `tu reçois ${flakes(mise + gainReel)} ❄ : ta mise revient, plus ${flakes(gainReel)} ❄ de l’adversaire`
                  : 'ta mise revient, plus celle de l’adversaire'}
              </small>
              {miseValide && solde !== null && abordable && <em>solde après : {flakes(solde + gainReel)} ❄</em>}
            </div>
            <div data-issue="perte">
              <span>Si tu perds</span>
              <strong className="text-ink">{miseValide ? `−${flakes(mise)} ❄` : '—'}</strong>
              <small>ta mise ne revient pas : tu la perds en entier</small>
              {miseValide && solde !== null && abordable && <em>solde après : {flakes(solde - mise)} ❄</em>}
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
                <IconSwords className="h-5 w-5" /> Lancer un duel
              </button>
              <p>Il s’affiche dans « Duels à rejoindre » pour les autres joueurs. Annulable tant que personne ne l’a relevé.</p>
            </div>
          </div>
        </section>

        {/* ============================= Les résultats ========================== */}
        <section className="glass resultats relative overflow-hidden p-5 sm:p-6" aria-labelledby="resultats-titre">
          <header className="relative flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Les derniers duels</p>
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
                  <li key={b.id} className="fil-ligne">
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
                          mise
                        </p>
                      </div>
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
