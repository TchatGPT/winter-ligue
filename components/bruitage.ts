/**
 * Les bruits des sachets, synthétisés.
 *
 * ## Ce module n'est appelé nulle part
 *
 * Tous les sons ont été retirés de l'ouverture sur demande. Le module est
 * conservé plutôt que supprimé parce qu'il porte des décisions coûteuses à
 * refaire — le choix des deux notes à l'oreille parmi dix candidates, la
 * descente du cran sous la zone sensible de l'audition, le bus à compresseur qui
 * empêchait l'écrêtage quand quatre sons se superposaient. Le rebrancher, c'est
 * un import.
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
    // Le bus appartient au contexte : un nouveau contexte en veut un neuf.
    bus = null;
    return partage;
  } catch {
    return null;
  }
}

/** Le bus par lequel tout passe, créé avec le contexte. */
let bus: AudioNode | null = null;

/**
 * La sortie commune de tous les sons.
 *
 * ## Pourquoi un bus, et pourquoi un compresseur
 *
 * Les sons étaient branchés en direct sur la sortie. Tant qu'ils ne se
 * chevauchaient pas, ça tenait ; mais le tirage superpose un roulement continu,
 * un cran toutes les cinquante millisecondes, une montée de tension et une
 * résolution de trois notes. Les amplitudes s'additionnent, la somme dépasse
 * l'unité, et la carte son écrête — c'est ce grésillement dur qu'on prenait pour
 * un son aigu.
 *
 * Un compresseur avec un seuil bas et un ratio franc rattrape ces crêtes au lieu
 * de les laisser saturer, et le gain général descend l'ensemble à un niveau
 * qu'on peut écouter une soirée entière. Le son ne devient pas seulement moins
 * fort : il devient propre.
 */
function sortie(ctx: AudioContext): AudioNode {
  if (bus) return bus;

  const limiteur = ctx.createDynamicsCompressor();
  limiteur.threshold.value = -24;
  limiteur.knee.value = 24;
  limiteur.ratio.value = 12;
  limiteur.attack.value = 0.004;
  limiteur.release.value = 0.18;

  const general = ctx.createGain();
  general.gain.value = 0.62;

  limiteur.connect(general).connect(ctx.destination);
  bus = limiteur;
  return bus;
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
function grapheSelection(ctx: AudioContext) {
  return joue(ctx, sortie(ctx), { hz: 210, vers: 128, duree: 0.16, niveau: 0.13 });
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
function grapheDechirure(ctx: AudioContext) {
  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 3000;
  doux.Q.value = 0.6;
  doux.connect(sortie(ctx));

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
 * Le cran de la bande.
 *
 * Il part une fois par tuile franchie, donc jusqu'à vingt fois par seconde au
 * lancement. Ce qui compte n'est pas de l'entendre isolément mais d'entendre le
 * **ralentissement** — les crans qui s'espacent sont ce qui rend le tirage
 * haletant.
 *
 * ## Pourquoi il a été redescendu d'une octave et demie
 *
 * Il sonnait à 1 180 Hz, soit en plein dans la zone où l'oreille est la plus
 * sensible — celle des courbes isosoniques, entre 2 et 5 kHz pour le pic, mais
 * déjà bien engagée à 1 kHz. Vingt répétitions par seconde d'une note dans cette
 * bande sont fatigantes en quelques secondes, quel que soit le volume.
 *
 * À 420 Hz, avec un passe-bas qui coupe ce qui reste au-dessus de 1 200, le même
 * rythme se lit comme un cliquet de mécanisme et non comme une alarme. Le niveau
 * descend aussi de moitié : il n'a jamais eu besoin d'être fort, il a besoin
 * d'être **régulier**.
 */
export function bruitDeCran() {
  const ctx = contexte();
  if (!ctx) return;

  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 1200;
  doux.Q.value = 0.5;
  doux.connect(sortie(ctx));

  joue(ctx, doux, { hz: 420, vers: 300, duree: 0.05, niveau: 0.035 });
}

/**
 * Le roulement de fond, pendant tout le tirage.
 *
 * C'est ce qui manquait le plus par rapport aux sites d'ouverture de caisses :
 * chez eux, la bande n'est pas seulement une suite de clics, elle **gronde**.
 * Le grondement porte l'attente entre deux crans, et son arrêt est ce qui rend
 * le silence final audible.
 *
 * Deux dents de scie graves, désaccordées de trois hertz. Le battement qui en
 * résulte donne au son une épaisseur qu'un oscillateur seul n'a pas, sans
 * coûter un générateur de bruit ni un fichier. Le passe-bas à 220 Hz retire
 * tout ce qui piquerait sous les crans, qui vivent, eux, autour de 1 kHz : les
 * deux sons occupent des étages séparés et ne se masquent pas.
 *
 * Rend la fonction d'arrêt : l'appelant la rend à React, qui l'exécute au
 * démontage. Un roulement qui survivrait à la fin du tirage tournerait jusqu'à
 * la fermeture de l'onglet.
 */
export function bruitDeRoulement(): () => void {
  const ctx = contexte();
  if (!ctx) return () => {};

  const filtre = ctx.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 220;
  filtre.Q.value = 0.7;

  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, ctx.currentTime);
  // Une montée d'une demi-seconde : un grondement qui démarre à plein volume
  // s'entend comme un défaut de lecture.
  volume.gain.exponentialRampToValueAtTime(0.034, ctx.currentTime + 0.5);
  filtre.connect(volume).connect(sortie(ctx));

  const oscillateurs = [56, 59].map((hz) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    o.connect(filtre);
    o.start();
    return o;
  });

  return () => {
    const fin = ctx.currentTime + 0.35;
    volume.gain.cancelScheduledValues(ctx.currentTime);
    volume.gain.setValueAtTime(Math.max(0.0001, volume.gain.value), ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, fin);
    for (const o of oscillateurs) o.stop(fin + 0.05);
  };
}

/**
 * La carte qui se pose, d'autant plus éclatante qu'elle est rare.
 *
 * `ordre` va de 0 pour une commune à 5 pour une légendaire. Trois choses en
 * dépendent, et c'est le cumul qui fait la différence entre « encore une
 * commune » et « oh » :
 *
 *  — la hauteur monte d'une quinte sur l'échelle, donc une légendaire sonne
 *    plus haut et plus tendu ;
 *  — le nombre de notes passe de une à trois, l'accord se déployant en arpège ;
 *  — la durée double, ce qui laisse la dernière note résonner.
 *
 * Une commune obtient donc une note sèche, une légendaire une petite fanfare.
 * C'est exactement le contrat des sites d'ouverture de caisses : on sait ce
 * qu'on a eu avant d'avoir lu quoi que ce soit.
 */
export function bruitDeGain(ordre: number) {
  const ctx = contexte();
  if (!ctx) return;

  const rang = Math.min(5, Math.max(0, ordre));
  const fondamentale = 262 * Math.pow(2, rang / 6);
  const notes = rang >= 4 ? 3 : rang >= 2 ? 2 : 1;
  const duree = 0.2 + rang * 0.07;

  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 4200;
  doux.Q.value = 0.6;
  doux.connect(sortie(ctx));

  // Fondamentale, quinte, octave : les trois premiers harmoniques justes, donc
  // un accord qui ne peut pas sonner faux quelle que soit la fondamentale.
  const rapports = [1, 1.5, 2];
  for (let i = 0; i < notes; i += 1) {
    joue(ctx, doux, {
      hz: fondamentale * rapports[i],
      duree,
      niveau: 0.075 - i * 0.012,
      retard: i * 0.07,
    });
  }
}

/**
 * La montée de tension, juste avant qu'une carte rare se pose.
 *
 * Un balayage qui monte d'une octave et demie en huit dixièmes de seconde, sous
 * les crans du rail. C'est le seul son du tirage qui **annonce** au lieu de
 * commenter : quand il démarre, la carte est déjà décidée depuis longtemps, mais
 * le joueur sait qu'il se passe quelque chose avant de l'avoir vu.
 *
 * Réservé aux ultra rares et aux légendaires. Le déclencher sur une commune
 * userait l'effet en trois ouvertures — et c'est exactement pour ça qu'il
 * marche : on l'entend rarement.
 */
export function bruitDeTension() {
  const ctx = contexte();
  if (!ctx) return;

  const filtre = ctx.createBiquadFilter();
  filtre.type = 'lowpass';
  filtre.frequency.value = 2600;
  filtre.connect(sortie(ctx));

  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, ctx.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.55);
  volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  volume.connect(filtre);

  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(180, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.8);
  o.connect(volume);
  o.start();
  o.stop(ctx.currentTime + 0.95);
}
