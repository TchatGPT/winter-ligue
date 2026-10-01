'use client';

/**
 * Les sons de l'ouverture, programmés sur l'horloge audio.
 *
 * ## Pourquoi la Web Audio nue, et plus Howler
 *
 * Howler faisait bien trois choses — déverrouiller le contexte tout seul, garder
 * les tampons décodés, permettre la polyphonie — mais il ne sait pas faire la
 * quatrième, qui est ici la seule qui compte : **jouer un son à un instant
 * futur donné**. Son API dit « joue », jamais « joue à telle seconde ».
 *
 * Or on connaît d'avance les trente-sept instants où une tuile franchit le
 * repère : `instantsDesCrans()` les calcule en inversant la courbe. Les poser
 * tous d'un coup sur l'horloge audio les rend échantillon-précis. Les guetter
 * dans une boucle d'animation, à l'inverse, les quantifie à l'image — 16,7 ms de
 * pas — et leur ajoute la gigue du fil principal, qui est précisément occupé à
 * autre chose au moment le plus dense.
 *
 * Trente kilo-octets en moins, et un cliquet qui ne bave plus.
 *
 * ## Les échantillons
 *
 * Six fichiers dans `public/sons/`, durées décodées :
 *
 * | fichier                     | durée   | son utile | rôle                     |
 * | --------------------------- | ------- | --------- | ------------------------ |
 * | `box-opening-spin-tick`     | 0,132 s | **40 ms** | une dent du cliquet      |
 * | `common`                    | 0,784 s |           | le claquement d'un arrêt |
 * | `spin-bait`                 | 5,747 s |           | la montée, rare et +     |
 * | `rare`                      | 5,642 s |           | la fête, rare            |
 * | `ultra_rare`                | 3,762 s |           | la fête, ultra rare      |
 * | `legendary`                 | 3,762 s |           | la fête, légendaire      |
 *
 * Le cliquet ne porte que quarante millisecondes de son utile, suivies de
 * quatre-vingt-douze de silence numérique : c'est ce qui détermine à partir de
 * quelle cadence les dents se recouvrent, et à soixante items par seconde elles
 * se recouvrent — d'où le grondement du départ.
 */

import { RARITY_ORDER } from '@/lib/domain/rules';

const SONS = {
  cran: '/sons/box-opening-spin-tick.mp3',
  appat: '/sons/spin-bait.mp3',
  commun: '/sons/common.mp3',
  rare: '/sons/rare.mp3',
  ultra: '/sons/ultra_rare.mp3',
  legendaire: '/sons/legendary.mp3',
} as const;

export type NomSon = keyof typeof SONS;

/**
 * Le niveau de chaque son.
 *
 * ## Ces nombres sont mesurés, pas estimés
 *
 * Les six fichiers ne sont pas au même niveau, et de très loin. Décodés puis
 * mesurés — RMS pondéré des 20 % de fenêtres les plus fortes, ce qui ignore les
 * silences de tête et de queue :
 *
 * | fichier      | crête      | corps      | écart au plus fort |
 * | ------------ | ---------- | ---------- | ------------------ |
 * | `tick`       | −21,6 dBFS | −36,8 dBFS | −11,9 dB           |
 * | `common`     | −16,7      | −33,6      | −8,7               |
 * | `spin-bait`  | −20,9      | −31,5      | −6,6               |
 * | `rare`       | −9,4       | −26,5      | −1,6               |
 * | `legendary`  | −9,9       | −25,2      | −0,3               |
 * | `ultra_rare` | −6,3       | −24,9      | 0                  |
 *
 * Un premier réglage posé au jugé, par rôle — cliquet discret, fanfare forte —
 * allait donc dans le mauvais sens : il baissait encore le fichier déjà le plus
 * faible, et le cliquet sortait dix-huit décibels sous la fanfare.
 *
 * Chaque gain est le produit d'une **normalisation** vers `ultra_rare` et d'un
 * **écart de rôle** en décibels, seule partie discutable : le cliquet à −8 dB
 * parce qu'il revient trente-sept fois et doit être la texture, pas le sujet ;
 * l'appât à −6 parce qu'il passe sous tout ; le claquement à −4 ; les fanfares
 * à 0.
 */
const NIVEAUX: Record<NomSon, number> = {
  cran: 0.44, // normalisé ×3,94, puis −8 dB de rôle
  appat: 0.3, // ×2,14, −6 dB
  commun: 0.48, // ×2,72, −4 dB
  rare: 0.34, // ×1,20
  ultra: 0.28, // référence
  legendaire: 0.29, // ×1,04
};

/**
 * Le volume général.
 *
 * **C'est le seul nombre à toucher pour « plus fort » ou « moins fort ».** Les
 * niveaux par son sont un équilibre entre eux, pas des volumes : les bouger un
 * par un défait la mesure qui les a produits.
 */
const VOLUME = 0.9;

/** Variation de hauteur d'une dent à l'autre : ±3 %, contre l'effet mitraillette. */
const GRAIN = 0.03;

/* --------------------------------------------------------------------------
 * Le contexte
 * ------------------------------------------------------------------------ */

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let deverrouille = false;

/** Les sources programmées et pas encore éteintes, pour pouvoir tout couper. */
const vivantes = new Set<AudioBufferSourceNode>();

const tampons = new Map<NomSon, AudioBuffer>();
let chargement: Promise<void> | null = null;

/**
 * Ouvre le contexte, une fois, et pose le bus.
 *
 * Le compresseur n'est plus là pour écraser mais pour servir de filet : son
 * seuil est à −6 dBFS. Il était à −24 avec un rapport de 12, réglage hérité de
 * l'époque des sinus synthétisés dont les crêtes s'additionnaient sans contrôle ;
 * les échantillons sont déjà masterisés et il mordait en permanence.
 */
function contexte(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Constructeur =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructeur) return null;

    ctx = new Constructeur();
    bus = ctx.createGain();
    bus.gain.value = VOLUME;

    const filet = ctx.createDynamicsCompressor();
    filet.threshold.value = -6;
    filet.knee.value = 6;
    filet.ratio.value = 12;
    filet.attack.value = 0.003;
    filet.release.value = 0.25;

    bus.connect(filet).connect(ctx.destination);
    poseDeverrouillage();
  }
  return ctx;
}

/**
 * Le contexte naît suspendu, et il faut un geste pour le réveiller.
 *
 * C'est la règle de tous les navigateurs, et Howler ne faisait rien d'autre que
 * poser ces trois écouteurs. Un contexte suspendu ne fait pas tourner son
 * horloge : tout ce qu'on lui programme s'entasse au même instant et part d'un
 * bloc au réveil. C'était le défaut du « son en retard ».
 */
function poseDeverrouillage() {
  if (deverrouille || typeof window === 'undefined') return;
  deverrouille = true;
  const reveille = () => {
    void ctx?.resume();
  };
  for (const evenement of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(evenement, reveille, { capture: true, passive: true });
  }
}

/**
 * Réveille le contexte. **À appeler depuis un gestionnaire de clic.**
 *
 * Les écouteurs de `poseDeverrouillage` couvrent le cas général, mais un appel
 * explicite au moment du clic qui lance l'ouverture ne coûte rien et garantit
 * que l'horloge tourne avant qu'on ne programme quarante évènements dessus.
 */
export function reveilleSon() {
  void contexte()?.resume();
}

/* --------------------------------------------------------------------------
 * Le chargement
 * ------------------------------------------------------------------------ */

/**
 * Rapatrie et décode les six échantillons.
 *
 * À appeler à l'affichage de l'écran de boosters : trois cents kilo-octets
 * décodés pendant qu'on choisit son sachet, pour que la première dent ne se
 * fasse pas attendre. Le décodage est la partie coûteuse, et il ne se fait pas
 * deux fois — d'où le `Map`, et la promesse gardée pour que deux montages
 * simultanés ne lancent pas deux fois le même travail.
 */
export function prechargeSons(): Promise<void> {
  if (chargement) return chargement;
  const audio = contexte();
  if (!audio) return Promise.resolve();

  chargement = Promise.all(
    (Object.keys(SONS) as NomSon[]).map(async (nom) => {
      try {
        const reponse = await fetch(SONS[nom]);
        const octets = await reponse.arrayBuffer();
        tampons.set(nom, await audio.decodeAudioData(octets));
      } catch {
        // Un son manquant ne doit pas empêcher l'ouverture : le rail tourne, il
        // est simplement muet de cette voix-là.
      }
    }),
  ).then(() => undefined);

  return chargement;
}

/** La durée décodée d'un échantillon, en secondes — 0 s'il n'est pas prêt. */
export function dureeDe(nom: NomSon): number {
  return tampons.get(nom)?.duration ?? 0;
}

/* --------------------------------------------------------------------------
 * La programmation
 * ------------------------------------------------------------------------ */

/** L'instant courant de l'horloge audio, ou `null` si elle n'existe pas. */
export function maintenantAudio(): number | null {
  return contexte()?.currentTime ?? null;
}

/**
 * Convertit un instant de l'horloge des animations en instant de l'horloge audio.
 *
 * ## Les deux horloges ne sont pas la même, et l'écart n'est pas constant
 *
 * `document.timeline.currentTime` et `performance.now()` partagent leur origine ;
 * `AudioContext.currentTime`, non — il compte les échantillons produits, avec la
 * latence de sortie en plus. Les recaler « à la louche » par
 * `ctx.currentTime + un délai deviné` donne un décalage de plusieurs dizaines de
 * millisecondes, variable selon la carte son.
 *
 * `getOutputTimestamp()` donne le couple exact : le temps audio et le temps
 * `performance.now()` du **même échantillon**, celui qui sort du haut-parleur à
 * cet instant. On y ramène le `startTime` de l'animation, et les deux mondes
 * partagent enfin une origine.
 *
 * Le repli — quand la méthode manque, ou avant que le contexte n'ait produit son
 * premier échantillon — est l'approximation naïve. Elle suffit : la vidéo montre
 * que l'écart entre un franchissement et l'attaque sonore la plus proche tient
 * dans ±65 ms chez eux, et une latence de sortie typique est en deçà.
 */
export function horlogeAudio(instantDocumentMs: number): number | null {
  const audio = contexte();
  if (!audio) return null;

  const repere = audio.getOutputTimestamp?.();
  if (repere && repere.contextTime && repere.performanceTime) {
    return repere.contextTime + (instantDocumentMs - repere.performanceTime) / 1000;
  }
  return audio.currentTime + Math.max(0, instantDocumentMs - performance.now()) / 1000;
}

/** Prépare une source branchée sur le bus, ou `null` si rien n'est jouable. */
function source(nom: NomSon, gain: number): AudioBufferSourceNode | null {
  const audio = contexte();
  const tampon = tampons.get(nom);
  if (!audio || !bus || !tampon) return null;

  const src = audio.createBufferSource();
  src.buffer = tampon;
  const volume = audio.createGain();
  volume.gain.value = NIVEAUX[nom] * gain;
  src.connect(volume).connect(bus);

  vivantes.add(src);
  src.onended = () => {
    vivantes.delete(src);
  };
  return src;
}

/** Programme un son pour qu'il **commence** à `quand`, sur l'horloge audio. */
export function programme(nom: NomSon, quand: number, gain = 1): void {
  const audio = contexte();
  const src = source(nom, gain);
  if (!audio || !src) return;
  src.start(Math.max(quand, audio.currentTime));
}

/**
 * Programme un son pour qu'il **se termine** à `quandFin`.
 *
 * C'est ce dont l'appât a besoin : ses 5,747 secondes doivent résoudre pile au
 * moment où la dernière bande s'immobilise, sans quoi la montée retombe dans le
 * vide ou se fait couper.
 *
 * Si le son est plus long que le temps restant, on ne le tronque pas par la fin
 * — ce serait couper exactement la résolution qu'on cherche — mais **par le
 * début** : il démarre tout de suite, à l'intérieur du tampon. La montée est
 * entamée en cours de route, et elle résout quand même à l'heure. C'est ce qui
 * arrive en mode rapide et en turbo, où la course est plus courte que l'appât.
 */
export function programmeFin(nom: NomSon, quandFin: number, gain = 1): void {
  const audio = contexte();
  const tampon = tampons.get(nom);
  const src = source(nom, gain);
  if (!audio || !tampon || !src) return;

  const debut = quandFin - tampon.duration;
  const maintenant = audio.currentTime;
  if (debut >= maintenant) src.start(debut);
  else src.start(maintenant, Math.min(maintenant - debut, tampon.duration));
}

/**
 * Programme les dents du cliquet, toutes d'un coup.
 *
 * `instants` est en millisecondes depuis le départ de la bande, `t0` en secondes
 * sur l'horloge audio. La hauteur de chaque dent varie de ±3 % : sans ce grain,
 * trente-sept fois le même échantillon à la même hauteur donne une mitraillette
 * et non un mécanisme.
 */
export function programmeCrans(instants: readonly number[], t0: number): void {
  const audio = contexte();
  if (!audio || !tampons.get('cran')) return;

  for (const ms of instants) {
    const src = source('cran', 1);
    if (!src) return;
    src.playbackRate.value = 1 - GRAIN + Math.random() * GRAIN * 2;
    src.start(Math.max(t0 + ms / 1000, audio.currentTime));
  }
}

/**
 * Coupe tout ce qui est programmé et pas encore joué.
 *
 * Sans ça, quitter la page en plein spin laisserait trente dents et une fanfare
 * tomber dans le vide — le contexte, lui, survit au démontage du composant.
 */
export function arreteTout(): void {
  for (const src of vivantes) {
    try {
      src.stop();
    } catch {
      // Une source jamais démarrée jette ; il n'y a rien à en faire.
    }
  }
  vivantes.clear();
}

/**
 * Le son de fête qui convient à une rareté, ou rien.
 *
 * Une fanfare par rareté au-dessus de la commune, et la coupure suit leurs
 * noms : `rare`, `ultra_rare`, `legendary`. Pour la commune, `null` — le
 * claquement d'arrêt suffit.
 *
 * Les seuils se lisent dans `RARITY_ORDER`, jamais en chiffres : ils étaient
 * écrits pour six raretés (rare à 2, ultra rare à 4, légendaire à 5), et depuis
 * qu'il n'en reste que quatre, une rare se posait sans un bruit tandis que
 * l'ultra rare et la légendaire jouaient toutes deux la fanfare de la rare.
 */
export function sonDeFete(rang: number): NomSon | null {
  if (rang >= RARITY_ORDER.L) return 'legendaire';
  if (rang >= RARITY_ORDER.UR) return 'ultra';
  if (rang >= RARITY_ORDER.R) return 'rare';
  return null;
}

/**
 * L'appât — la montée de cinq secondes qui résout à l'arrêt — se joue-t-il
 * pour cette rareté ? Pour une rare ou mieux seulement.
 *
 * Il se jouait à chaque ouverture, pour ne rien laisser deviner avant l'arrêt.
 * Mais cette montée se lit comme le son d'une rareté, et une commune en avait
 * donc un : on l'entendait à chaque booster, sur des cartes qui n'avaient rien
 * à fêter. Elle annonce désormais une rare ou mieux, dans les dernières
 * secondes de la course, et la fanfare de la rareté la résout. Une commune
 * s'ouvre au cliquet et au claquement d'arrêt, sans plus.
 */
export function appatPour(rang: number): boolean {
  return rang >= RARITY_ORDER.R;
}
