'use client';

/**
 * Le salon des duels : jouer d'un côté, les résultats de l'autre.
 *
 * À gauche, tout ce qui sert à jouer : les défis ouverts en tête — ceux des
 * autres, à relever d'un clic, puis les siens, à annuler —, et dessous le
 * panneau pour lancer le sien : l'affiche, la mise en boutons rapides, ce
 * qu'elle rapporte ou coûte, le bouton. À droite, les résultats, sur toute la
 * hauteur. Sur un ordinateur, le salon tient dans l'écran et ses listes
 * défilent dans leur plaque ; sur un téléphone, tout s'empile dans cet ordre.
 *
 * Un duel joué ne se rejoue pas, et ne se saute pas : la course se voit une
 * fois, en direct, jusqu'au bout — la fenêtre ne se ferme pas avant. Une fois
 * finie, le verdict reste le temps d'être lu, puis la fenêtre se ferme
 * d'elle-même et le résultat passe en tête du salon.
 *
 * Celui qui a lancé le duel voit la course, lui aussi : dès que le sondage
 * apprend qu'on l'a relevé, l'arène s'ouvre chez lui et la course s'y joue de
 * bout en bout. Revenu sur la page dans le quart d'heure, il la voit encore ;
 * une course vue ne revient pas (le navigateur s'en souvient).
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
  DELAI_DEPART_MS,
  DUREE_COURSE_MAX_MS,
  initiale,
  type BatailleVueClient,
  type CampApercu,
} from '@/components/BatailleArene';
import { CouronneGlace } from '@/components/CouronneGlace';
import { IconSwords } from '@/components/icons';
import { MedailleGlace } from '@/components/MedailleGlace';
import { SnowCap } from '@/components/SnowCap';
import { reveilleSonsDuel } from '@/components/sonsDuel';
import { flakes } from '@/components/ui';
import { CHANCE, DUEL, chanceDe, libelleMultiplicateur } from '@/lib/domain/rules';
import { shortDateTime } from '@/lib/format';

/** Le rythme du sondage, quand personne ne joue. */
const SONDAGE = 2000;
/**
 * Plus serré quand un de ses défis attend : relevé, la course part au même
 * instant chez les deux joueurs, après un compte à rebours — il faut l'apprendre
 * avant qu'il ne soit fini.
 */
const SONDAGE_EN_ATTENTE = 1000;

/**
 * L'écart entre l'horloge du serveur et celle de ce navigateur, en
 * millisecondes, mesuré à chaque sondage : il cale le départ des courses.
 */
let decalage = 0;

/** L'instant du départ d'une course, à l'horloge de ce navigateur. */
function departDe(b: BatailleVueClient): number | undefined {
  if (!b.resolueA) return undefined;
  const depart = Date.parse(b.resolueA) + DELAI_DEPART_MS - decalage;
  // Découverte après la fin : elle se rejoue du début, il n'y a plus personne
  // avec qui être synchrone.
  return depart + DUREE_COURSE_MAX_MS < Date.now() ? Date.now() : depart;
}

/** Le temps de lire le verdict, avant que la fenêtre ne se ferme d'elle-même. */
const DELAI_VERDICT = 2500;

interface Charge {
  batailles: BatailleVueClient[];
  top: BatailleVueClient[];
  balance: number | null;
  bornes: { manches: { min: number; max: number }; mise: { min: number; max: number } };
  moiId: string | null;
  /** L'heure du serveur à la lecture. */
  maintenant?: string;
}

/** La mise proposée à l'arrivée. Le curseur et le champ font le reste. */
const MISE_DEPART = 100;

/** Les résultats montrés d'emblée sur un écran étroit ; le reste se déplie. */
const RESULTATS_REPLIES = 5;

/** Les défis montrés d'emblée sur un écran étroit ; le reste se déplie. */
const DEFIS_REPLIES = 3;

/** Le temps qu'un message reste à l'écran — une erreur, un peu plus. */
const DUREE_MESSAGE = 6500;
const DUREE_ERREUR = 9000;

/** Le dernier message du salon : un défi lancé ou annulé, un duel joué, une erreur. */
interface Message {
  kind: 'success' | 'error' | 'info';
  texte: string;
  /** Un numéro par message : le même texte deux fois relance le minuteur. */
  cle: number;
}

/** Le pot : les deux mises réunies. C'est ce qui change de mains. */
const pot = (b: BatailleVueClient) => b.mise * 2;

/**
 * Le rang dans le top de la semaine : la couronne et les médailles de glace du
 * classement — la même matière, le même éclat qui passe —, sertis dans son
 * disque teinté or, argent ou cuivre (`.rang-socle`), puis un chiffre. Des
 * pastilles pleines l'ont précédé : elles n'étaient de rien d'autre sur le site.
 */
function RangTop({ rang }: { rang: number }) {
  return (
    <span className="rang-socle duels-rang" data-podium={rang <= 3 ? rang : undefined}>
      {rang === 1 ? (
        <CouronneGlace className="h-8 w-8" id="couronne-duels" />
      ) : rang <= 3 ? (
        <MedailleGlace rang={rang as 2 | 3} className="h-8 w-8" id={`medaille-${rang}-duels`} />
      ) : (
        <span className="duels-rang-chiffre" aria-hidden="true">
          {rang}
        </span>
      )}
      <span className="sr-only">{rang === 1 ? '1er' : `${rang}e`}</span>
    </span>
  );
}

/** Ce qu'on dit d'un duel joué, une fois sa fenêtre refermée. */
function bilanDe(b: BatailleVueClient, moiId: string | null): { gagne: boolean; texte: string } {
  const gagne = moiId !== null && b.vainqueurId === moiId;
  const adverse = b.camps.find((c) => c.id !== moiId);
  const contre = adverse?.pseudo ?? 'ton adversaire';
  return gagne
    ? { gagne, texte: `Duel gagné contre ${contre} : tu rafles ${flakes(pot(b))} ❄.` }
    : { gagne, texte: `Duel perdu contre ${contre} : ta mise de ${flakes(b.mise)} ❄ est partie.` };
}

/* ------------------------------------------------------------------------ */
/* La mise                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Les mises qu'on joue le plus, d'un clic, plus « Max » : tout ce qu'on peut
 * se permettre. Un curseur de 100 à 50 000 les a précédées : un pixel y valait
 * cent flocons, et viser 500 demandait de la précision.
 */
const MISES_RAPIDES: readonly number[] = [100, 500, 1_000, 5_000, 10_000];

/** Le pas des boutons − et + : il grandit avec la mise. */
function pasDe(mise: number): number {
  if (mise < 1_000) return 100;
  if (mise < 10_000) return 500;
  return 1_000;
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
  fermable,
  pied,
  children,
}: {
  titre: string;
  ferme: () => void;
  /**
   * Faux pendant le tirage et la course : ni croix, ni clic à côté, ni Échap.
   * Un duel ne se saute pas — il se regarde jusqu'au bout.
   */
  fermable: boolean;
  pied?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigateur = useNavigateur();
  const carte = useRef<HTMLDivElement>(null);

  // Le rappel change à chaque rendu du salon ; l'écoute du clavier, elle, ne
  // doit s'installer qu'une fois — sinon le focus sauterait à chaque lancer.
  const rappel = useRef(ferme);
  const peutFermer = useRef(fermable);
  useEffect(() => {
    rappel.current = ferme;
    peutFermer.current = fermable;
  }, [ferme, fermable]);

  useEffect(() => {
    if (!navigateur) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && peutFermer.current) rappel.current();
    };
    window.addEventListener('keydown', surTouche);
    carte.current?.focus();
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
    <div
      className="fenetre-voile"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      onClick={fermable ? ferme : undefined}
    >
      <div
        ref={carte}
        tabIndex={-1}
        className="fenetre-carte glass glass-reflet relative outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {fermable && (
          <button type="button" className="btn btn-sm absolute top-5 right-5 z-10" onClick={ferme} aria-label="Fermer">
            ✕
          </button>
        )}
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

/**
 * Le message du salon, dans un coin de l'écran : en bas à droite sur un
 * ordinateur, au-dessus de la barre de navigation sur un téléphone. Il ne
 * pousse rien dans la page, et s'en va de lui-même (voir `DUREE_MESSAGE`).
 */
function Annonce({ message, ferme }: { message: Message; ferme: () => void }) {
  const navigateur = useNavigateur();
  if (!navigateur) return null;
  return createPortal(
    <div className="duels-annonce" data-kind={message.kind} role="status" aria-live="polite">
      <p>{message.texte}</p>
      <button type="button" className="duels-annonce-fermer" onClick={ferme} aria-label="Fermer le message">
        ✕
      </button>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------------ */
/* Le salon                                                                  */
/* ------------------------------------------------------------------------ */

type Fenetre =
  | { etat: 'attente'; jeton: number; gauche: CampApercu; droite: CampApercu; moi: 'gauche' | 'droite'; mise: number }
  | { etat: 'duel'; bataille: BatailleVueClient; anime: boolean; tour: number; fini: boolean; depart?: number }
  | { etat: 'erreur'; message: string };

type Resultat = { ok: true; data: BatailleVueClient } | { ok: false; message: string };

/** Un numéro par fenêtre ouverte : il distingue une attente, ou un visionnage, du suivant. */
let dernierNumero = 0;
const nouveauNumero = () => ++dernierNumero;

/* ------------------------------------------------------------------------ */
/* La course de celui qui a lancé le duel                                     */
/* ------------------------------------------------------------------------ */

/** Un duel relevé il y a plus longtemps ne rouvre plus l'arène. */
const COURSE_FRAICHE_MS = 15 * 60_000;
const CLE_VUES = 'wl-courses-vues';
/** Sans mémoire du navigateur (navigation privée), celle de la page suffit. */
const vuesEnMemoire = new Set<string>();

function coursesVues(): string[] {
  try {
    const brut = window.localStorage.getItem(CLE_VUES);
    const lu: unknown = brut ? JSON.parse(brut) : [];
    return Array.isArray(lu) ? lu.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function marqueVue(id: string): void {
  vuesEnMemoire.add(id);
  try {
    const vues = [...coursesVues().filter((x) => x !== id), id].slice(-100);
    window.localStorage.setItem(CLE_VUES, JSON.stringify(vues));
  } catch {
    // Rien à faire : la mémoire de la page tiendra.
  }
}

/**
 * Mes duels relevés depuis peu, dont je n'ai pas vu la course : je les ai
 * lancés, quelqu'un les a relevés, et la course s'est ouverte chez lui.
 */
function coursesAMontrer(charge: Charge, maintenant: number): BatailleVueClient[] {
  if (charge.moiId === null) return [];
  const vues = new Set([...vuesEnMemoire, ...coursesVues()]);
  return charge.batailles.filter(
    (b) =>
      b.statut === 'TERMINEE' &&
      b.hoteId === charge.moiId &&
      !b.camps.some((c) => c.bot) &&
      b.resolueA !== null &&
      maintenant - Date.parse(b.resolueA) < COURSE_FRAICHE_MS &&
      !vues.has(b.id),
  );
}

/** La prochaine course en file, marquée vue : la fenêtre qui la joue. */
function prochaineCourse(file: BatailleVueClient[]): Fenetre | null {
  const b = file.shift();
  if (!b) return null;
  marqueVue(b.id);
  return { etat: 'duel', bataille: b, anime: true, tour: nouveauNumero(), fini: false, depart: departDe(b) };
}

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
      // La fenêtre ne se ferme pas pendant le tirage : un serveur muet ne doit
      // pas y laisser le joueur coincé.
      signal: AbortSignal.timeout(15_000),
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
  /**
   * Le dernier message — un défi lancé, un duel joué, une erreur —, posé dans
   * un coin de l'écran (`Annonce`) : en tête du salon, il repoussait tout le
   * reste vers le bas.
   */
  const [message, setMessage] = useState<Message | null>(null);
  const annonce = useCallback(
    (kind: Message['kind'], texte: string) => setMessage({ kind, texte, cle: nouveauNumero() }),
    [],
  );
  const annonceBilan = useCallback(
    (b: { gagne: boolean; texte: string }) => annonce(b.gagne ? 'success' : 'info', b.texte),
    [annonce],
  );
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), message.kind === 'error' ? DUREE_ERREUR : DUREE_MESSAGE);
    return () => clearTimeout(t);
  }, [message]);
  const [occupe, setOccupe] = useState(false);

  /** La mise du duel qu'on monte. */
  const [mise, setMise] = useState(MISE_DEPART);

  type Onglet = 'recents' | 'miens' | 'top';
  const [onglet, setOnglet] = useState<Onglet>('recents');
  /** Toute la liste des résultats, sur un écran étroit (voir `RESULTATS_REPLIES`). */
  const [tousResultats, setTousResultats] = useState(false);
  /** Tous les défis à relever, sur un écran étroit (voir `DEFIS_REPLIES`). */
  const [tousDefis, setTousDefis] = useState(false);

  const [fenetre, setFenetre] = useState<Fenetre | null>(null);
  /** Les courses de mes duels relevés, en attente d'une fenêtre libre. */
  const aMontrer = useRef<BatailleVueClient[]>([]);
  /** Vrai tant qu'une fenêtre est ouverte : le sondage le lit hors du rendu. */
  const fenetreLa = useRef(false);
  useEffect(() => {
    fenetreLa.current = fenetre !== null;
  }, [fenetre]);

  // Une course qui s'ouvre sans clic — celle d'un duel relevé — n'a de son que
  // si la page a déjà reçu un geste : le premier réveille le son.
  useEffect(() => {
    const reveil = () => reveilleSonsDuel();
    window.addEventListener('pointerdown', reveil, { once: true });
    return () => window.removeEventListener('pointerdown', reveil);
  }, []);

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
    let suivant: Charge;
    try {
      const avant = Date.now();
      const reponse = await fetch('/api/affrontements', { cache: 'no-store' });
      const charge = await reponse.json();
      if (!charge.ok) return;
      suivant = charge.data as Charge;
      // L'heure du serveur, rapportée au milieu de l'aller-retour.
      if (suivant.maintenant) decalage = Date.parse(suivant.maintenant) - (avant + Date.now()) / 2;
    } catch {
      // Un sondage qui échoue ne mérite pas de message : le suivant passera.
      return;
    }
    setEtat(suivant);

    // Un de mes duels vient d'être relevé : la course se joue chez moi aussi,
    // dès que la fenêtre est libre.
    for (const b of coursesAMontrer(suivant, Date.now())) {
      if (!aMontrer.current.some((x) => x.id === b.id)) aMontrer.current.push(b);
    }
    if (!fenetreLa.current) {
      const course = prochaineCourse(aMontrer.current);
      if (course) {
        fenetreLa.current = true;
        setFenetre(course);
      }
    }
  }, []);

  const fenetreOuverte = fenetre !== null;
  const jAttends = etat.moiId !== null && etat.batailles.some((b) => b.statut === 'ATTENTE' && b.hoteId === etat.moiId);
  useEffect(() => {
    if (fenetreOuverte) return;
    const t = setInterval(recharge, jAttends ? SONDAGE_EN_ATTENTE : SONDAGE);
    return () => clearInterval(t);
  }, [fenetreOuverte, jAttends, recharge]);

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
    setMessage(null);
    // Le contexte audio se réveille ici, pendant le geste : ouvert plus tard,
    // il naîtrait suspendu et la course serait muette.
    reveilleSonsDuel();

    const jeton = nouveauNumero();
    attenteOuverte.current = jeton;
    fenetreLa.current = true;
    setFenetre({ etat: 'attente', jeton, ...apercu });

    const resultat = await auMoins(700, poste(url, corps));

    const toujoursLa = attenteOuverte.current === jeton;
    attenteOuverte.current = null;
    if (resultat.ok) {
      const b = resultat.data;
      if (toujoursLa) {
        setFenetre({ etat: 'duel', bataille: b, anime: true, tour: nouveauNumero(), fini: false, depart: departDe(b) });
      } else {
        // Fenêtre fermée pendant le tirage : le duel est joué quand même, on le dit.
        annonceBilan(bilanDe(b, etat.moiId));
      }
    } else if (toujoursLa) {
      setFenetre({ etat: 'erreur', message: resultat.message });
    } else {
      annonce('error', resultat.message);
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
    setMessage(null);
    const resultat = await poste(url, corps);
    if (resultat.ok) annonce('success', succes(resultat.data));
    else annonce('error', resultat.message);
    enCours.current = false;
    setOccupe(false);
    void recharge();
  }

  const ouvreAuxJoueurs = () => {
    // Le son se réveille pendant ce clic : la course s'ouvrira sans geste,
    // quand quelqu'un relèvera le duel.
    reveilleSonsDuel();
    return agit(
      '/api/affrontements',
      { mise },
      (b) =>
        `Ton défi de ${flakes(b.mise)} ❄ est lancé : la course s’ouvrira ici dès qu’un joueur le relèvera. Tu peux l’annuler jusque-là.`,
    );
  };

  const releve = (b: BatailleVueClient) =>
    joue(
      '/api/affrontements/rejoindre',
      { batailleId: b.id },
      { gauche: { pseudo: b.camps[0]?.pseudo ?? '?', bot: false }, droite: moi, moi: 'droite', mise: b.mise },
    );

  const annule = (b: BatailleVueClient) =>
    agit(
      '/api/affrontements/annuler',
      { batailleId: b.id },
      () => `Défi annulé : ta mise de ${flakes(b.mise)} ❄ t’est rendue.`,
    );

  function ferme() {
    attenteOuverte.current = null;
    // Fermée à la main sur le verdict, la fenêtre laisse l'issue dans le salon —
    // et la place à la course suivante, s'il y en a une en file.
    if (fenetre?.etat === 'duel') annonceBilan(bilanDe(fenetre.bataille, etat.moiId));
    const suivante = prochaineCourse(aMontrer.current);
    fenetreLa.current = suivante !== null;
    setFenetre(suivante);
    void recharge();
  }

  const marqueFini = useCallback(() => {
    setFenetre((f) => (f && f.etat === 'duel' ? { ...f, fini: true } : f));
  }, []);

  // La course finie, le verdict reste le temps d'être lu, puis la fenêtre se
  // ferme d'elle-même et l'issue s'annonce dans un coin de l'écran.
  const duelTermine = fenetre?.etat === 'duel' && fenetre.fini ? fenetre.bataille : null;
  const moiId = etat.moiId;
  useEffect(() => {
    if (!duelTermine) return;
    const t = setTimeout(() => {
      const suivante = prochaineCourse(aMontrer.current);
      fenetreLa.current = suivante !== null;
      setFenetre(suivante);
      annonceBilan(bilanDe(duelTermine, moiId));
      void recharge();
    }, DELAI_VERDICT);
    return () => clearTimeout(t);
  }, [duelTermine, moiId, recharge, annonceBilan]);

  /* ------------------------------ Les listes ----------------------------- */

  const ouverts = etat.batailles.filter((b) => b.statut === 'ATTENTE');
  /** Les défis des autres, à relever : les plus grosses mises en tête. */
  const aRelever = ouverts.filter((b) => b.hoteId !== etat.moiId).sort((a, b) => b.mise - a.mise);
  /**
   * Mes défis en attente — `DUEL.enAttenteMax` au plus, le serveur le vérifie.
   * Ils sont en tête de la liste des défis ouverts, avec de quoi les annuler :
   * un défi lancé se voit là où les autres le voient.
   */
  const mesDefis = joueur
    ? ouverts.filter((b) => b.hoteId === etat.moiId).sort((a, b) => a.creeeA.localeCompare(b.creeeA))
    : [];
  const defisOuverts = [...mesDefis, ...aRelever];
  const complet = mesDefis.length >= DUEL.enAttenteMax;
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
  const chance = solde !== null ? chanceDe(solde) : null;
  /** On ne peut pas miser du tout : pas de joueur derrière la session, ou plus assez de flocons. */
  const bloque = !joueur || solde === null || solde < miseMin;
  /** On peut régler une mise : un joueur, des flocons, rien en cours. */
  const peutMiser = !bloque && !occupe;
  const changeMise = (valeur: number) => setMise(Math.min(plafond, Math.max(miseMin, valeur)));

  /** Une seule alerte à la fois, la plus bloquante d'abord. */
  const alerte =
    !joueur || solde === null || solde < miseMin
      ? null
      : !miseValide
        ? `La mise va de ${flakes(miseMin)} à ${flakes(miseMax)} ❄.`
        : !abordable
          ? `Il te manque ${flakes(mise - solde)} ❄ pour cette mise.`
          : complet
            ? `Tu as déjà ${DUEL.enAttenteMax} défis en attente : attends qu’on les relève, ou annules-en un.`
            : gainPerdu > 0
              ? `Ton solde est plafonné à ${flakes(soldeMax)} ❄ : ${flakes(gainPerdu)} ❄ du gain seraient perdus.`
              : null;

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
      <BatailleArene
        key={fenetre.tour}
        bataille={b}
        moiId={etat.moiId}
        anime={fenetre.anime}
        depart={fenetre.depart}
        onFini={marqueFini}
      />
    );
    // Pas de raccourci vers le résultat : la course se regarde jusqu'au bout.
    // Finie, la fenêtre se ferme d'elle-même ; on peut seulement la fermer un
    // peu plus tôt.
    piedFenetre = fenetre.fini ? (
      <button type="button" className="btn btn-ghost" onClick={ferme}>
        Fermer
      </button>
    ) : (
      <button type="button" className="btn btn-ghost" disabled>
        Course en cours…
      </button>
    );
  }

  /* -------------------------------- Rendu -------------------------------- */

  return (
    <div className="duels-salon">
      {/* =========================== Jouer ===========================
          Relever un défi, ou lancer le sien : tout ce qui sert à jouer, dans
          une colonne. Sur un ordinateur, la zone des défis a une hauteur fixe
          — la liste défile dedans — : le panneau de lancement ne bouge pas,
          qu'il y ait un défi ou vingt. */}
      <div className="duels-jouer">
        {/* ---- Les défis des autres : qui, combien, et son bouton ---- */}
        <section
          className="glass duels-panneau duels-defis"
          aria-labelledby="defis-titre"
          data-vide={defisOuverts.length === 0 ? '' : undefined}
        >
          <SnowCap radius="var(--r-lg)" seed="duels-rejoindre" epaisseur={16} />
          <header className="duels-panneau-tete">
            <div>
              <p className="eyebrow">Défis ouverts</p>
              <h2 id="defis-titre">
                Duels à rejoindre
                <span className="duels-compte" data-actif={defisOuverts.length > 0 ? '' : undefined}>
                  {defisOuverts.length}
                </span>
              </h2>
            </div>
          </header>

          {defisOuverts.length === 0 ? (
            <div className="duels-vide">
              <span className="duels-vide-icone" aria-hidden="true">
                <IconSwords className="h-5 w-5" />
              </span>
              <p>
                <b>Personne n’attend d’adversaire.</b> Lance le premier défi : il s’affichera ici pour les autres
                joueurs.
              </p>
            </div>
          ) : (
            <ul className="duels-defis-liste" data-tout={tousDefis ? '' : undefined}>
              {/* Les miens d'abord, en pointillés : ils attendent qu'on les relève. */}
              {mesDefis.map((b) => (
                <li key={b.id} className="duels-defi" data-mien="">
                  <span className="orbe orbe-sm" aria-hidden="true">
                    {initiale(moi)}
                  </span>
                  <div className="duels-defi-qui">
                    <b>Ton défi</b>
                    <small>
                      <span className="duels-defi-verbe">en attente d’un adversaire · </span>
                      <span className="whitespace-nowrap">{shortDateTime(b.creeeA)}</span>
                    </small>
                  </div>
                  <div className="duels-defi-mise">
                    <strong>
                      {flakes(b.mise)} <span className="text-ice">❄</span>
                    </strong>
                    <small>{flakes(pot(b))}&nbsp;❄ au gagnant</small>
                  </div>
                  <div className="duels-defi-action">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={occupe}
                      onClick={() => annule(b)}
                      title="Annuler ce défi : ta mise t’est rendue"
                    >
                      Annuler
                    </button>
                  </div>
                </li>
              ))}
              {aRelever.map((b) => {
                const hote = b.camps[0];
                const manque = solde !== null && solde < b.mise ? b.mise - solde : 0;
                return (
                  <li key={b.id} className="duels-defi">
                    <span className="orbe orbe-sm" aria-hidden="true">
                      {hote ? initiale(hote) : '?'}
                    </span>
                    <div className="duels-defi-qui">
                      <b>{hote?.pseudo ?? '?'}</b>
                      <small>
                        {/* Étroit, la date seule : le verbe y faisait passer la ligne à trois. */}
                        <span className="duels-defi-verbe">te défie · </span>
                        <span className="whitespace-nowrap">{shortDateTime(b.creeeA)}</span>
                      </small>
                    </div>
                    <div className="duels-defi-mise">
                      <strong>
                        {flakes(b.mise)} <span className="text-ice">❄</span>
                      </strong>
                      <small>{flakes(pot(b))}&nbsp;❄ au gagnant</small>
                    </div>
                    <div className="duels-defi-action">
                      <button
                        type="button"
                        className="btn btn-ice"
                        disabled={occupe || !joueur || solde === null || manque > 0}
                        onClick={() => releve(b)}
                      >
                        {manque > 0 ? `Il te manque ${flakes(manque)} ❄` : 'Relever le défi'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Sur un écran étroit, les trois premiers ; la suite se déplie. Sur
              un ordinateur, la liste défile dans sa zone. */}
          {defisOuverts.length > DEFIS_REPLIES && !tousDefis && (
            <button type="button" className="btn btn-ghost duels-defis-plus" onClick={() => setTousDefis(true)}>
              Voir les {defisOuverts.length} défis
            </button>
          )}
        </section>

        {/* ---- Lancer le sien ----
            En haut le solde et la chance aux boosters qu'il porte ; au milieu
            l'affiche ; en bas la mise, ce qu'elle rapporte ou coûte, et le
            bouton. */}
        <section className="glass duels-panneau duels-lancer" aria-labelledby="lancer-titre">
          <SnowCap radius="var(--r-lg)" seed="duels-lancer" epaisseur={18} />
          <header className="duels-panneau-tete">
            <div>
              <p className="eyebrow">Nouveau défi</p>
              <h2 id="lancer-titre">Lance ton défi</h2>
            </div>
            {solde !== null && chance !== null && (
              <div className="duels-solde">
                <p>
                  <span>Ton solde</span>
                  <strong>
                    {flakes(solde)} <span className="text-ice">❄</span>
                  </strong>
                </p>
                <div className="jauge-chance" aria-hidden="true">
                  <span style={{ width: `${(chance / CHANCE.max) * 100}%` }} />
                </div>
                <small>
                  Chance aux boosters <b>{libelleMultiplicateur(chance)}</b> : miser, c’est la risquer.
                </small>
              </div>
            )}
          </header>

          {/* L'affiche : toi, l'adversaire, et ce que le gagnant rafle. */}
          <div className="duels-affiche" aria-hidden="true">
            <div className="duels-camp">
              <span className="orbe">{initiale(moi)}</span>
              <b>{moi.pseudo}</b>
            </div>
            <div className="duels-pot">
              <small>Le gagnant rafle</small>
              <strong>
                {miseValide ? flakes(mise * 2) : '—'} <span className="text-ice">❄</span>
              </strong>
              <small>les deux mises</small>
            </div>
            <div className="duels-camp">
              <span className="orbe" data-inconnu="">
                ?
              </span>
              <b>Adversaire</b>
            </div>
          </div>

          {/* On ne peut pas miser — la session s'est perdue, ou il n'y a plus
              assez de flocons : l'avis prend la place du réglage et du bouton,
              qui ne seraient que grisés. */}
          {bloque ? (
            <>
              {/* La session s'est perdue en route — expirée, ou sans joueur derrière
                elle. On le dit, et on donne de quoi repartir. */}
              {!joueur && (
                <div className="duels-avis">
                  <p>
                    <strong>Ta session ne permet pas de jouer.</strong> Elle a expiré, ou elle n’est rattachée à aucun
                    joueur.
                  </p>
                  <a href="/connexion" className="btn btn-ice no-underline">
                    Se reconnecter
                  </a>
                </div>
              )}
              {joueur && solde !== null && solde < miseMin && (
                <div className="duels-avis">
                  <p>
                    <strong>Tu n’as plus assez de flocons.</strong> Il en faut au moins {flakes(miseMin)} pour miser :
                    ils se gagnent à chaque game saisie, et avec le cadeau du jour.
                    {mesDefis.length > 0 && ' Annuler un de tes défis en attente te rend sa mise.'}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* La mise : des mises rapides, puis le montant exact entre − et +, et à
              côté ce qu'elle rapporte ou coûte, au flocon près, avec le solde qui
              en résulte. Une grille plutôt qu'un formulaire en colonne : sur un
              ordinateur, le montant et ses issues tiennent sur une ligne. */}
              <div className="duels-reglage" data-inactif={peutMiser ? undefined : ''}>
                <p className="eyebrow duels-reglage-titre" id="mise-titre">
                  Ta mise
                </p>
                <div className="duels-mise-rapide" role="group" aria-labelledby="mise-titre">
                  {MISES_RAPIDES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={mise === v}
                      disabled={!peutMiser || v > plafond}
                      onClick={() => changeMise(v)}
                    >
                      {flakes(v)}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={mise === plafond && !MISES_RAPIDES.includes(plafond)}
                    disabled={!peutMiser}
                    onClick={() => changeMise(plafond)}
                    title={`Tout miser : ${flakes(plafond)} ❄`}
                  >
                    Max
                  </button>
                </div>
                <div className="duels-mise-champ">
                  <button
                    type="button"
                    aria-label="Miser moins"
                    data-sens="moins"
                    disabled={!peutMiser || !miseValide || mise <= miseMin}
                    onClick={() => changeMise(mise - pasDe(mise - 1))}
                  >
                    −
                  </button>
                  <label>
                    <span className="sr-only">Mise exacte en flocons</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="num"
                      min={miseMin}
                      max={miseMax}
                      value={Number.isFinite(mise) ? mise : ''}
                      disabled={!peutMiser}
                      onChange={(e) => setMise(Math.floor(Number(e.target.value)))}
                    />
                    <span aria-hidden="true">❄</span>
                  </label>
                  <button
                    type="button"
                    aria-label="Miser plus"
                    data-sens="plus"
                    disabled={!peutMiser || !miseValide || mise >= plafond}
                    onClick={() => changeMise(mise + pasDe(mise))}
                  >
                    +
                  </button>
                </div>
                <div className="duels-issues">
                  <div data-issue="gain">
                    <span>Si tu gagnes</span>
                    <strong>{miseValide ? `+${flakes(gainReel)}\u00a0❄` : '—'}</strong>
                    {miseValide && solde !== null && abordable && (
                      <small>solde {flakes(solde + gainReel)}&nbsp;❄</small>
                    )}
                  </div>
                  <div data-issue="perte">
                    <span>Si tu perds</span>
                    <strong>{miseValide ? `−${flakes(mise)}\u00a0❄` : '—'}</strong>
                    {miseValide && solde !== null && abordable && <small>solde {flakes(solde - mise)}&nbsp;❄</small>}
                  </div>
                </div>
              </div>

              {alerte && (
                <p className="duels-alerte" role="status">
                  {alerte}
                </p>
              )}
            </>
          )}

          {/* Le pied : le bouton, puis ses défis en attente — ou, s'il n'y en a
              pas, ce qu'il advient d'un défi lancé. */}
          {(!bloque || mesDefis.length > 0) && (
            <div className="duels-lancer-pied">
              {!bloque && (
                <button
                  type="button"
                  className="btn btn-ice btn-ouvrir w-full"
                  disabled={!peutJouer || complet}
                  onClick={ouvreAuxJoueurs}
                >
                  <IconSwords className="h-5 w-5" /> Lancer le défi
                </button>
              )}
              {/* Ce qu'il advient d'un défi lancé, et combien en attendent déjà —
                  c'est ce compte qui dit pourquoi on ne peut plus en lancer. */}
              <p>
                Il s’affiche dans les défis ouverts, et la course part dès qu’un joueur le relève.
                {mesDefis.length > 0 && (
                  <>
                    {' '}
                    <b className="text-ink">
                      {mesDefis.length} / {DUEL.enAttenteMax}
                    </b>{' '}
                    en attente.
                  </>
                )}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* ============================ Les résultats ============================
          Le vainqueur d'abord, toujours ; et pour un duel qu'on a joué, ce
          qu'il nous a rapporté ou coûté. */}
      <section className="glass duels-panneau duels-resultats" aria-labelledby="resultats-titre">
        <SnowCap radius="var(--r-lg)" seed="duels-resultats" epaisseur={14} />
        <header className="duels-panneau-tete">
          <div>
            <p className="eyebrow">Les derniers duels</p>
            <h2 id="resultats-titre">Résultats</h2>
          </div>
          <div className="segment" role="group" aria-label="Quels résultats afficher">
            {(['recents', 'miens', 'top'] as const)
              .filter((cle) => cle !== 'miens' || joueur)
              .map((cle) => (
                <button key={cle} type="button" aria-pressed={onglet === cle} onClick={() => setOnglet(cle)}>
                  {listes[cle].titre}
                  {listes[cle].lignes.length > 0 && <span className="compte">{listes[cle].lignes.length}</span>}
                </button>
              ))}
          </div>
        </header>
        {onglet === 'top' && <p className="duels-resultats-note">Les plus grosses mises des sept derniers jours.</p>}

        {liste.lignes.length === 0 ? (
          <p className="fil-vide mt-4 text-[15px] text-muted">{liste.vide}</p>
        ) : (
          <ul className="duels-resultats-liste" data-tout={tousResultats ? '' : undefined}>
            {liste.lignes.map((b, i) => {
              const hote = b.camps[0];
              const adverse = b.camps[1];
              const hoteGagne = b.vainqueurId !== null && b.vainqueurId === hote?.id;
              const gagnant = hoteGagne ? hote : adverse;
              const perdant = hoteGagne ? adverse : hote;
              const joue = joueur && b.camps.some((c) => c.id === etat.moiId);
              const gagne = joue && b.vainqueurId === etat.moiId;
              return (
                <li key={b.id} className="duels-resultat" data-issue={joue ? (gagne ? 'gain' : 'perte') : undefined}>
                  {onglet === 'top' && <RangTop rang={i + 1} />}
                  <div className="min-w-0 flex-1">
                    <p className="duels-resultat-phrase">
                      <b data-gagne="">{gagnant?.pseudo ?? '?'}</b>
                      <em>a battu</em>
                      <b>{perdant?.pseudo ?? '?'}</b>
                    </p>
                    <small>{shortDateTime(b.resolueA ?? b.creeeA)}</small>
                  </div>
                  <div className="duels-resultat-mise">
                    <strong>
                      {joue ? (gagne ? '+' : '−') : ''}
                      {flakes(b.mise)} <span className="text-ice">❄</span>
                    </strong>
                    <small>{joue ? (gagne ? 'gagnés' : 'perdus') : 'misés'}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {/* Sous la colonne « jouer » (téléphone, tablette), la liste s'arrête aux
            cinq premiers : la suite se déplie, au lieu d'allonger la page de
            douze lignes. Sur un ordinateur, elle défile dans sa plaque. */}
        {liste.lignes.length > RESULTATS_REPLIES && !tousResultats && (
          <button type="button" className="btn btn-ghost duels-resultats-plus" onClick={() => setTousResultats(true)}>
            Voir les {liste.lignes.length} résultats
          </button>
        )}
      </section>

      {message && <Annonce key={message.cle} message={message} ferme={() => setMessage(null)} />}

      {fenetre && (
        <FenetreDuel
          titre="L’arène du duel"
          ferme={ferme}
          fermable={fenetre.etat === 'erreur' || (fenetre.etat === 'duel' && fenetre.fini)}
          pied={piedFenetre}
        >
          {contenuFenetre}
        </FenetreDuel>
      )}
    </div>
  );
}
