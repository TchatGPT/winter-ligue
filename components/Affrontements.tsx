'use client';

/**
 * Le salon des duels.
 *
 * Il se lit comme une affiche. À gauche, le ring : on y règle sa mise et son
 * format, on voit tout de suite ce qu'on peut gagner ou perdre, et deux
 * boutons engagent — le bot, tout de suite, ou les joueurs, qui relèveront le
 * défi. À droite, le fil : les duels qui attendent un adversaire, puis ceux qui
 * viennent de se jouer.
 *
 * L'arène s'ouvre par-dessus, au centre de l'écran, dès le clic : on voit le
 * duel se mettre en place pendant que le serveur le tire, puis se jouer lancer
 * par lancer. Il n'y a rien à faire défiler pour le regarder.
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
import { prechargeSons, reveilleSon } from '@/components/bruitage';
import { IconSwords } from '@/components/icons';
import { SnowCap } from '@/components/SnowCap';
import { Notice, flakes } from '@/components/ui';
import { MANCHES_POSSIBLES, manchesAGagner } from '@/lib/domain/bataille';
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

/** Ce que dit chaque format, sous son nombre de manches. */
const FORMATS: Record<number, string> = {
  1: 'Un lancer décide',
  3: 'Le premier à 2',
  5: 'Le premier à 3',
};

const BOT: CampApercu = { pseudo: 'Le Bot', bot: true };

/** Le pot : les deux mises réunies. C'est ce qui change de mains. */
const pot = (b: BatailleVueClient) => b.mise * 2;

/** Un duel dont on n'a que l'issue : il n'y a aucun lancer à rejouer. */
const sansReleve = (b: BatailleVueClient) => b.ancien || b.echanges.length === 0;

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
        <SnowCap radius="var(--r-lg)" seed="fenetre-duel" epaisseur={16} />
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
  | { etat: 'attente'; jeton: number; gauche: CampApercu; droite: CampApercu; moi: 'gauche' | 'droite'; mise: number; manches: number }
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

  /** La mise et le format du duel qu'on monte. */
  const [mise, setMise] = useState(MISES[0]);
  const [manches, setManches] = useState<number>(3);

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

  // Les sons de l'arène se décodent pendant qu'on règle sa mise.
  useEffect(() => {
    void prechargeSons();
  }, []);

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
    apercu: { gauche: CampApercu; droite: CampApercu; moi: 'gauche' | 'droite'; mise: number; manches: number },
  ) {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    setErreur(null);
    setInfo(null);
    // Le contexte audio se réveille ici, pendant le geste : ouvert plus tard,
    // il naîtrait suspendu et les lancers seraient muets.
    reveilleSon();

    const jeton = nouveauNumero();
    attenteOuverte.current = jeton;
    setFenetre({ etat: 'attente', jeton, ...apercu });

    const resultat = await auMoins(500, poste(url, corps));

    const toujoursLa = attenteOuverte.current === jeton;
    attenteOuverte.current = null;
    if (resultat.ok) {
      if (toujoursLa) {
        const b = resultat.data;
        setFenetre({ etat: 'duel', bataille: b, anime: !sansReleve(b), tour: nouveauNumero(), fini: sansReleve(b) });
      } else {
        // Fenêtre fermée pendant le tirage : le duel est joué quand même, on le dit.
        const b = resultat.data;
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

  const affronteBot = () =>
    joue('/api/affrontements/bot', { mise, manches }, { gauche: moi, droite: BOT, moi: 'gauche', mise, manches });

  const ouvreAuxJoueurs = () =>
    agit(
      '/api/affrontements',
      { mise, manches },
      (b) =>
        `Ton duel est ouvert : ${flakes(b.mise)} ❄ misés, au meilleur des ${b.manches}. Il attend un adversaire dans « Duels ouverts » — tu peux l’annuler tant que personne ne l’a relevé.`,
    );

  const releve = (b: BatailleVueClient) =>
    joue(
      '/api/affrontements/rejoindre',
      { batailleId: b.id },
      { gauche: { pseudo: b.camps[0]?.pseudo ?? '?', bot: false }, droite: moi, moi: 'droite', mise: b.mise, manches: b.manches },
    );

  const botSurLeMien = (b: BatailleVueClient) =>
    joue(
      '/api/affrontements/bot',
      { batailleId: b.id },
      { gauche: moi, droite: BOT, moi: 'gauche', mise: b.mise, manches: b.manches },
    );

  const annule = (b: BatailleVueClient) =>
    agit('/api/affrontements/annuler', { batailleId: b.id }, () => `Duel annulé : ta mise de ${flakes(b.mise)} ❄ t’est rendue.`);

  const revoit = (b: BatailleVueClient) =>
    setFenetre({ etat: 'duel', bataille: b, anime: !sansReleve(b), tour: nouveauNumero(), fini: sansReleve(b) });

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
    // d'un cran au premier lancer.
    piedFenetre = (
      <button type="button" className="btn btn-ghost" disabled>
        Tirage en cours…
      </button>
    );
    contenuFenetre = (
      <ArenePreparation
        gauche={fenetre.gauche}
        droite={fenetre.droite}
        moi={fenetre.moi}
        mise={fenetre.mise}
        manches={fenetre.manches}
      />
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
    const contreLeBot = b.camps[1]?.bot === true && b.hoteId === etat.moiId;
    const revanchePossible = contreLeBot && solde !== null && solde >= b.mise && !occupe;
    contenuFenetre = (
      <BatailleArene
        key={fenetre.tour}
        bataille={b}
        moiId={etat.moiId}
        anime={fenetre.anime}
        onFini={marqueFini}
      />
    );
    piedFenetre = fenetre.fini ? (
      <>
        {contreLeBot && (
          <button
            type="button"
            className="btn btn-ice"
            disabled={!revanchePossible}
            onClick={() =>
              joue(
                '/api/affrontements/bot',
                { mise: b.mise, manches: b.manches },
                { gauche: moi, droite: BOT, moi: 'gauche', mise: b.mise, manches: b.manches },
              )
            }
          >
            Revanche · {flakes(b.mise)} ❄
          </button>
        )}
        {!sansReleve(b) && (
          <button
            type="button"
            className="btn"
            onClick={() => setFenetre({ ...fenetre, anime: true, tour: nouveauNumero(), fini: false })}
          >
            Revoir le duel
          </button>
        )}
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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* =============================== Le ring ============================== */}
        <section className="glass ring relative overflow-hidden" aria-labelledby="ring-titre">
          <SnowCap radius="var(--r-lg)" seed="ring-duel" epaisseur={18} />

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
              elle. On le dit, et on donne de quoi repartir : un bouton grisé
              « connexion requise » ne menait nulle part. */}
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

          {/* ---- L'affiche : toi, le pot, l'adversaire ---- */}
          <div className="ring-affiche" aria-hidden="true">
            <div className="ring-camp">
              <span className="orbe">{initiale(moi)}</span>
              <b>{moi.pseudo}</b>
              <small>toi</small>
            </div>
            <div className="ring-pot">
              <small>En jeu</small>
              <strong>
                {miseValide ? flakes(mise * 2) : '—'} <span className="text-ice">❄</span>
              </strong>
              <small>
                Au meilleur des {manches} · premier à {manchesAGagner(manches)}
              </small>
            </div>
            <div className="ring-camp">
              <span className="orbe" data-inconnu="">
                ?
              </span>
              <b>Adversaire</b>
              <small>un joueur ou le bot</small>
            </div>
          </div>

          {/* ---- Les réglages ---- */}
          <div className="ring-reglages">
            <fieldset className="min-w-0 space-y-3">
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

            <fieldset className="min-w-0">
              <legend className="eyebrow mb-3">Le format</legend>
              <div className="grid grid-cols-3 gap-2">
                {MANCHES_POSSIBLES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="tuile-choix"
                    aria-pressed={manches === n}
                    disabled={!joueur || occupe}
                    onClick={() => setManches(n)}
                  >
                    <strong>
                      {n} manche{n > 1 ? 's' : ''}
                    </strong>
                    <small>{FORMATS[n]}</small>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                À chaque manche, une boule de neige chacun, d’une puissance de 1 à 100 tirée par le serveur.
                La plus forte gagne ; une égalité se rejoue.
              </p>
            </fieldset>
          </div>

          {/* ---- Le bilan : ce qu'on gagne, ce qu'on perd ---- */}
          <div className="ring-bilan">
            <div>
              <span>Si tu gagnes</span>
              <strong className="text-aurora">{miseValide ? `+${flakes(gainReel)} ❄` : '—'}</strong>
            </div>
            <div>
              <span>Si tu perds</span>
              <strong className="text-ink">{miseValide ? `−${flakes(mise)} ❄` : '—'}</strong>
            </div>
          </div>
          {joueur && !miseValide && (
            <p className="mt-2 text-[13px] text-gold">
              La mise va de {flakes(miseMin)} à {flakes(miseMax)} ❄.
            </p>
          )}
          {joueur && miseValide && !abordable && solde !== null && (
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
              <button type="button" className="btn btn-ice btn-lg w-full" disabled={!peutJouer} onClick={affronteBot}>
                <span aria-hidden="true">🤖</span> Affronter le bot
              </button>
              <p>Tout de suite. Le bot mise autant que toi et lance exactement comme toi.</p>
            </div>
            <div>
              <button type="button" className="btn btn-lg w-full" disabled={!peutJouer} onClick={ouvreAuxJoueurs}>
                <IconSwords className="h-5 w-5" /> Défier les joueurs
              </button>
              <p>Ta mise attend un adversaire. Annulable tant que personne ne l’a relevée.</p>
            </div>
          </div>
        </section>

        {/* =============================== Le fil =============================== */}
        <div className="grid gap-5">
          {/* ---- Les duels ouverts ---- */}
          <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="ouverts-titre">
            <SnowCap radius="var(--r-lg)" seed="duels-ouverts" epaisseur={14} />
            <header className="relative flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">En attente d’adversaire</p>
                <h2
                  id="ouverts-titre"
                  className="mt-1 font-display text-2xl leading-none font-black tracking-wide text-ink uppercase"
                >
                  Duels ouverts
                </h2>
              </div>
              {ouverts.length > 0 && (
                <span className="font-display text-3xl leading-none font-black text-ice tabular-nums">
                  {ouverts.length}
                </span>
              )}
            </header>

            {ouverts.length === 0 ? (
              <div className="fil-vide mt-4">
                <span className="orbe orbe-sm" data-inconnu="" aria-hidden="true">
                  ?
                </span>
                <div>
                  <p className="font-display text-[17px] font-black tracking-wide text-ink uppercase">
                    Personne n’attend
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug text-muted">
                    Défie les joueurs : ta mise attendra ici qu’on la relève. Ou affronte le bot, tout de suite.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="fil-liste fil-ouverts mt-4">
                {ouverts.map((b) => {
                  const hote = b.camps[0];
                  const mien = b.hoteId === etat.moiId;
                  return (
                    <li key={b.id} className="fil-ligne fil-ouvert" data-mien={mien ? '' : undefined}>
                      <span className="orbe orbe-sm" aria-hidden="true">
                        {hote ? initiale(hote) : '?'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-display text-[17px] font-black tracking-wide text-ink uppercase">
                          {mien ? 'Ton duel' : (hote?.pseudo ?? '?')}
                        </p>
                        <p className="text-[12.5px] text-muted">
                          Au meilleur des {b.manches} · ouvert le {shortDateTime(b.creeeA)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl leading-none font-black whitespace-nowrap text-ink tabular-nums">
                          {flakes(b.mise)} <span className="text-ice">❄</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-bold tracking-[0.14em] text-faint uppercase">mise</p>
                      </div>
                      <div className="fil-actions">
                        {mien ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-ice btn-sm"
                              disabled={occupe}
                              onClick={() => botSurLeMien(b)}
                            >
                              Contre le bot
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={occupe}
                              onClick={() => annule(b)}
                            >
                              Annuler
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ice btn-sm"
                            disabled={occupe || !joueur || solde === null || solde < b.mise}
                            title={solde !== null && solde < b.mise ? `Il te manque ${flakes(b.mise - solde)} ❄` : undefined}
                            onClick={() => releve(b)}
                          >
                            Relever le défi
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---- Les résultats ---- */}
          <section className="glass relative overflow-hidden p-5 sm:p-6" aria-labelledby="resultats-titre">
            <SnowCap radius="var(--r-lg)" seed="duels-resultats" epaisseur={14} />
            <header className="relative flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Rejouables lancer par lancer</p>
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
                  const adverseGagne = b.vainqueurId !== null && b.vainqueurId === adverse?.id;
                  return (
                    <li key={b.id}>
                      <button type="button" className="fil-ligne" onClick={() => revoit(b)} title="Revoir le duel">
                        {onglet === 'top' && (
                          <span className="medaille" data-rang={i + 1}>
                            {i + 1}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="resultat">
                            <b data-gagne={hoteGagne ? '' : undefined}>{hote?.pseudo ?? '?'}</b>
                            {/* Un duel d'avant la réforme n'a que des scores de cartes :
                                les montrer comme des manches ferait lire « 0 – 0 ». */}
                            <em>
                              {b.ancien
                                ? 'cartes'
                                : b.echanges.length === 0
                                  ? '—'
                                  : `${hote?.manches ?? 0} – ${adverse?.manches ?? 0}`}
                            </em>
                            <b data-gagne={adverseGagne ? '' : undefined}>{adverse?.pseudo ?? '?'}</b>
                          </div>
                          <p className="mt-1 text-[12px] text-faint">
                            {shortDateTime(b.resolueA ?? b.creeeA)} · au meilleur des {b.manches}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-display text-xl leading-none font-black text-ink tabular-nums">
                            {flakes(pot(b))} <span className="text-ice">❄</span>
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold tracking-[0.14em] text-faint uppercase">pot</p>
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
      </div>

      {fenetre && (
        <FenetreDuel titre="L’arène du duel" ferme={ferme} pied={piedFenetre}>
          {contenuFenetre}
        </FenetreDuel>
      )}
    </div>
  );
}
