'use client';

import { Howl, Howler } from 'howler';

/**
 * Les sons de l'ouverture, sur Howler.
 *
 * ## Ce que Howler apporte, et ce qu'il n'apporte pas
 *
 * Il n'apporte **pas** l'absence de latence. C'est une surcouche du même Web
 * Audio, soumise à la même règle : un contexte ouvert hors d'un geste de
 * l'utilisateur naît suspendu, son horloge ne tourne pas, et tout ce qu'on lui
 * programme s'entasse au même instant pour partir d'un bloc au réveil. C'était
 * le défaut du son en retard, et il se corrigeait sans lui.
 *
 * Ce qu'il apporte vraiment, et qui vaut ses trente kilo-octets :
 *
 * - **Le déverrouillage automatique.** Howler pose lui-même les écouteurs sur
 *   le premier `click`, `touchend` et `keydown` de la page et reprend le
 *   contexte. Plus besoin de se souvenir d'appeler un réveil au bon endroit,
 *   ni de vérifier qu'aucun `await` ne s'est glissé avant.
 * - **Le décodage et le cache.** Un `Howl` charge, décode et garde ; les
 *   lectures suivantes ne coûtent qu'un nœud.
 * - **La polyphonie.** Une même instance se relit par-dessus elle-même, ce dont
 *   le cliquet a besoin : au démarrage il tombe une dent par image, et chacune
 *   dure quarante millisecondes.
 *
 * ## Les échantillons
 *
 * Ils viennent d'EmpireDrop. Durées décodées, mesurées :
 *
 * | fichier                     | durée   | son utile | rôle                     |
 * | --------------------------- | ------- | --------- | ------------------------ |
 * | `box-opening-spin-tick`     | 0,132 s | **40 ms** | une dent du cliquet      |
 * | `common`                    | 0,784 s |           | le claquement d'un arrêt |
 * | `rare`                      | 5,642 s |           | la fête, rare et +       |
 * | `ultra_rare`                | 3,762 s |           | la fête, ultra rare      |
 * | `legendary`                 | 3,762 s |           | la fête, légendaire      |
 * | `spin-bait`                 | 5,747 s |           | la montée du défilement  |
 *
 * Le cliquet ne dure que quarante millisecondes de son utile, suivies de
 * quatre-vingt-douze de silence numérique — un point qui compte, puisqu'il
 * détermine à partir de quelle cadence les dents se recouvrent.
 *
 * ## Le son se coupe, et le choix se retient
 *
 * Un son d'interface qu'on ne peut pas éteindre est un défaut. `Howler.mute()`
 * coupe tout d'un coup, et le choix survit au rechargement.
 */

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

const CLE_SON = 'winter.son';

/** `null` tant que la préférence n'a pas été lue. */
let actif: boolean | null = null;

/**
 * Le son est-il allumé ?
 *
 * Allumé par défaut : l'ouverture d'un booster est le seul endroit du site qui
 * en émette, et c'est un geste qu'on déclenche exprès. Mais le choix contraire
 * se retient — rien n'est plus agaçant qu'un réglage à refaire à chaque visite.
 */
export function sonActif(): boolean {
  if (actif === null) {
    try {
      actif = localStorage.getItem(CLE_SON) !== 'non';
    } catch {
      // Navigation privée, stockage refusé : on ne coupe pas le son pour ça.
      actif = true;
    }
  }
  return actif;
}

const abonnes = new Set<() => void>();

/**
 * S'abonne au réglage.
 *
 * Le réglage vit hors de React — dans `localStorage` et dans une variable de
 * module — et c'est bien ce qu'il doit faire, puisque les émetteurs le
 * consultent sans passer par un composant. `useSyncExternalStore` lit ce genre
 * de source sans jamais désynchroniser le rendu serveur du rendu client, ce
 * qu'un `setState` dans un effet ferait au prix d'un rendu de plus.
 */
export function abonneSon(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

/** Bascule, retient, prévient, et renvoie le nouvel état. */
export function basculeSon(): boolean {
  const suivant = !sonActif();
  actif = suivant;
  try {
    localStorage.setItem(CLE_SON, suivant ? 'oui' : 'non');
  } catch {
    // Le réglage ne survivra pas au rechargement, mais il tient pour la session.
  }
  Howler.mute(!suivant);
  for (const rappel of abonnes) rappel();
  return suivant;
}

const banque = new Map<NomSon, Howl>();

/**
 * L'instance d'un son, créée à la demande et gardée.
 *
 * `html5: false` force le passage par Web Audio plutôt que par une balise
 * `<audio>` : c'est ce qui permet la polyphonie et une attaque immédiate. Une
 * balise `<audio>` ne peut pas se superposer à elle-même, ce qui rendrait le
 * cliquet impossible dès qu'il tombe plus vite que sa propre durée.
 */
function son(nom: NomSon): Howl {
  let h = banque.get(nom);
  if (!h) {
    h = new Howl({ src: [SONS[nom]], volume: NIVEAUX[nom], html5: false, preload: true });
    banque.set(nom, h);
  }
  return h;
}

/**
 * Précharge et décode tout ce que l'ouverture va jouer.
 *
 * À appeler à l'affichage de l'écran : trois cents kilo-octets rapatriés et
 * décodés pendant qu'on choisit son sachet, pour que la première dent ne se
 * fasse pas attendre. Howler s'occupe du reste — il déverrouille le contexte
 * tout seul au premier clic de la page, où qu'il tombe.
 */
export function prechargeSons() {
  Howler.volume(VOLUME);
  Howler.mute(!sonActif());
  for (const nom of Object.keys(SONS) as NomSon[]) son(nom);
}

/** Joue un échantillon. Sans effet si le son est coupé. */
export function joueSon(nom: NomSon) {
  if (!sonActif()) return;
  son(nom).play();
}

/**
 * Programme un son pour qu'il **se termine** à l'instant donné.
 *
 * C'est ce dont l'appât a besoin : ses 5,747 secondes doivent résoudre pile au
 * moment où le dernier rouleau s'arrête, sans quoi la montée retombe dans le
 * vide ou se fait couper. On cale donc la fin, pas le début — et la durée vient
 * du fichier chargé plutôt que d'une constante, pour qu'un remplacement ne
 * demande aucune retouche ici.
 *
 * Si le son est plus long que le temps restant, il démarre tout de suite : mieux
 * vaut une montée tronquée qu'une montée qui déborde sur la révélation.
 *
 * Renvoie de quoi l'annuler, pour le cas où l'ouverture est interrompue.
 */
export function programmeFin(nom: NomSon, dansMs: number): () => void {
  if (!sonActif()) return () => {};
  const h = son(nom);
  let minuterie = 0;
  let identifiant: number | null = null;

  const lance = () => {
    const reste = dansMs - h.duration() * 1000;
    minuterie = window.setTimeout(
      () => {
        identifiant = h.play();
      },
      Math.max(0, reste),
    );
  };

  if (h.state() === 'loaded') lance();
  else h.once('load', lance);

  return () => {
    clearTimeout(minuterie);
    h.off('load', lance);
    if (identifiant !== null) h.stop(identifiant);
  };
}

/**
 * Le son de fête qui convient à un palier, ou rien.
 *
 * Quatre fichiers pour six raretés, et la coupure suit exactement leurs noms :
 * `legendary` pour la légendaire, `ultra_rare` pour l'ultra rare, `rare` pour la
 * rare et la super rare. En dessous, `null` — le claquement d'arrêt suffit.
 * Fêter une peu commune dévaluerait la fête pour les paliers qu'on attend.
 */
export function sonDeFete(rang: number): NomSon | null {
  if (rang >= 5) return 'legendaire';
  if (rang >= 4) return 'ultra';
  if (rang >= 2) return 'rare';
  return null;
}
