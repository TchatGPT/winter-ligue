/**
 * Les bruits des sachets, synthétisés.
 *
 * Pas de fichier audio. Deux sinus et quelques enveloppes tiennent en trente
 * lignes, là où des échantillons demanderaient des fichiers à héberger, des
 * allers-retours réseau et un préchargement pour que le son ne traîne pas
 * derrière l'animation.
 *
 * Rien ne part au chargement : chaque son suit un geste délibéré, et le
 * contexte audio n'est ouvert qu'au premier d'entre eux.
 *
 * ## Des notes, pas du bruit
 *
 * Trois versions de bruit filtré ont précédé, et toutes ont été rejetées à
 * l'écoute. La première claquait — attaque instantanée, coupe-bas à 1,1 kHz,
 * bosse de +7 dB à 5,2 kHz, crête à 0,9. Les deux suivantes ont corrigé chacun
 * de ces défauts, mesures à l'appui, et sonnaient toujours mal : on avait
 * fabriqué du souffle propre, et du souffle reste du souffle.
 *
 * Ce qui manquait n'était pas dans les chiffres. Les sons d'interface qu'on
 * trouve agréables sont presque tous **pitchés** : ils ont une note. C'est la
 * hauteur, et non la douceur du filtrage, qui fait qu'un son se lit comme un
 * évènement plutôt que comme un parasite.
 *
 * Les deux sons ci-dessous ont été choisis à l'oreille parmi dix candidats.
 * Leurs valeurs sont donc **le résultat d'un choix, pas d'un réglage** : les
 * modifier revient à changer le son, pas à l'affiner.
 */

/** L'unique contexte audio de la page, ouvert au premier son. */
let partage: AudioContext | null = null;

/**
 * Le contexte audio, partagé, ou rien.
 *
 * ## Pourquoi un seul, et pourquoi il ne se ferme jamais
 *
 * Chaque son ouvrait autrefois son propre contexte et le fermait à
 * l'extinction. C'était tenable tant qu'un son suivait un clic. Le carrousel de
 * tirage a tout changé : il émet un cran par carte franchie, soit plusieurs
 * dizaines en quelques secondes. Or un navigateur plafonne le nombre de
 * contextes audio simultanés — six sur Chrome — et **la construction d'un
 * contexte n'est pas gratuite** : elle démarre un fil audio et négocie avec le
 * périphérique de sortie. Au rythme du rail, on payait cette négociation vingt
 * fois par seconde sur le fil principal, et l'animation saccadait.
 *
 * Un contexte unique, gardé ouvert, coûte un fil audio pour toute la vie de la
 * page. C'est le fonctionnement normal de l'API ; la fermeture systématique
 * était la déviation.
 *
 * Un navigateur peut toujours refuser d'en ouvrir un — politique de la page,
 * périphérique absent. Le son est un agrément : son absence ne doit jamais
 * empêcher le geste.
 */
function contexte(): AudioContext | null {
  if (partage && partage.state !== 'closed') {
    // Un contexte ouvert avant le premier geste de l'utilisateur naît suspendu,
    // et le reste jusqu'à ce qu'on le réveille explicitement.
    if (partage.state === 'suspended') void partage.resume();
    return partage;
  }

  const Fabrique =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Fabrique) return null;
  try {
    partage = new Fabrique();
    return partage;
  } catch {
    return null;
  }
}

interface Note {
  /** Hauteur de départ, en hertz. */
  hz: number;
  /** Hauteur d'arrivée. Absente, la note ne glisse pas. */
  vers?: number;
  /** Durée d'extinction, en secondes. */
  duree: number;
  niveau: number;
  /** Retard au démarrage, en secondes. */
  retard?: number;
}

/**
 * Une note sinusoïdale, montée en rampe et éteinte en exponentielle.
 *
 * Les rampes sont exponentielles et non linéaires : l'oreille perçoit le volume
 * en logarithme, et une extinction linéaire s'entend comme une coupure sur la
 * fin. D'où aussi le 0,0001 plutôt que zéro aux deux bouts —
 * `exponentialRampToValueAtTime` refuse la valeur nulle.
 *
 * Les 18 ms d'attaque ne sont pas cosmétiques : c'est le passage de zéro à
 * pleine amplitude en un échantillon qui fait le clic désagréable.
 */
function joue(ctx: BaseAudioContext, sortie: AudioNode, n: Note) {
  const debut = ctx.currentTime + (n.retard ?? 0);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(n.hz, debut);
  if (n.vers && n.vers !== n.hz) {
    o.frequency.exponentialRampToValueAtTime(n.vers, debut + n.duree * 0.8);
  }

  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, debut);
  volume.gain.exponentialRampToValueAtTime(n.niveau, debut + 0.018);
  volume.gain.exponentialRampToValueAtTime(0.0001, debut + n.duree);

  o.connect(volume).connect(sortie);
  o.start(debut);
  o.stop(debut + n.duree + 0.02);
  return o;
}

/**
 * Le passage d'un sachet devant soi : une note grave qui retombe.
 *
 * Elle part à 210 Hz et descend à 128 en un sixième de seconde. C'est court et
 * bas exprès : le son part une fois par sachet franchi, donc plusieurs fois par
 * geste quand on traverse le rail d'un bout à l'autre. Tout ce qui serait plus
 * long ou plus aigu s'y empilerait.
 *
 * Aucun filtre : un sinus ne contient rien à filtrer.
 */
function grapheSelection(ctx: BaseAudioContext) {
  return joue(ctx, ctx.destination, { hz: 210, vers: 128, duree: 0.16, niveau: 0.16 });
}

/**
 * L'ouverture du sachet : trois notes qui montent.
 *
 * Do, mi, la — un arpège ascendant, espacé de 105 ms. Pas un bruit de
 * déchirure : une petite phrase, qui se lit comme une récompense. C'est le seul
 * geste de la page qui coûte des flocons, il a droit à une résolution.
 *
 * Le passe-bas à 3 kHz arrondit ce que les sinus ont de nu, et son Q reste bas :
 * une résonance à la coupure s'entendrait comme un sifflement ajouté.
 */
function grapheDechirure(ctx: BaseAudioContext) {
  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 3000;
  doux.Q.value = 0.6;
  doux.connect(ctx.destination);

  const notes: Note[] = [
    { hz: 523, duree: 0.42, niveau: 0.085, retard: 0 },
    { hz: 659, duree: 0.42, niveau: 0.085, retard: 0.105 },
    { hz: 880, duree: 0.42, niveau: 0.085, retard: 0.21 },
  ];
  // C'est la fin de la dernière note qui doit fermer le contexte : elle est
  // rendue, les deux autres s'éteignent avant elle.
  const jouees = notes.map((n) => joue(ctx, doux, n));
  return jouees[jouees.length - 1];
}

/** Le passage d'un sachet, pendant la navigation. */
export function bruitDeSelection() {
  const ctx = contexte();
  if (!ctx) return;
  grapheSelection(ctx);
}

/** Le sachet qu'on ouvre. */
export function bruitDeDechirure() {
  const ctx = contexte();
  if (!ctx) return;
  grapheDechirure(ctx);
}

/**
 * Le cran du carrousel de tirage.
 *
 * Très court et très bas : il part une fois par carte franchie, donc plusieurs
 * dizaines de fois en cinq secondes. Ce qui compte n'est pas de l'entendre
 * isolément mais d'entendre le **ralentissement** — les crans qui s'espacent
 * sont ce qui rend le tirage haletant.
 *
 * Un sinus de 40 ms plutôt qu'un bruit filtré : à cette durée, du bruit ne fait
 * qu'un « pfft » sourd, là où une note tient sa hauteur et se détache.
 */
export function bruitDeCran() {
  const ctx = contexte();
  if (!ctx) return;
  joue(ctx, ctx.destination, { hz: 1180, vers: 880, duree: 0.045, niveau: 0.07 });
}

/**
 * L'arrêt d'une colonne du tirage : deux notes qui se posent.
 *
 * Une quinte descendante, très courte. Elle sonne une fois par carte, à
 * quelques centaines de millisecondes d'écart d'une colonne à l'autre — d'où sa
 * brièveté : cinq arrêts en trois secondes, s'ils traînaient, se
 * chevaucheraient en bouillie.
 *
 * Plus grave que le cran, et c'est ce qui compte : le cran dit « ça défile »,
 * l'arrêt dit « c'est joué ». Deux hauteurs éloignées pour deux sens éloignés.
 */
export function bruitDArret() {
  const ctx = contexte();
  if (!ctx) return;
  joue(ctx, ctx.destination, { hz: 392, duree: 0.16, niveau: 0.1 });
  joue(ctx, ctx.destination, { hz: 262, duree: 0.24, niveau: 0.09, retard: 0.06 });
}
