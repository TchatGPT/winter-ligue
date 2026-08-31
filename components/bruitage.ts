/**
 * Les bruits des sachets, synthétisés.
 *
 * ## Le spin vient d'un fichier, le reste est synthétisé
 *
 * `public/sons/spin.mp3` est un lit de cliquet à cadence **constante** : 2,424 s,
 * 24 kHz, et une enveloppe plate d'un bout à l'autre — vérifié en lisant le
 * `global_gain` de ses cent un granules, sans le décoder. Il ne ralentit donc
 * pas tout seul, et c'est exactement ce qu'il fallait : le fichier apporte le
 * timbre, l'animation apporte la décélération en pilotant sa vitesse de lecture.
 * Un fichier qui aurait déjà son propre ralenti aurait été inutilisable, puisque
 * le rail met 9,5 s là où l'échantillon en fait 2,4.
 *
 * ## Les sons synthétisés qui restent
 *
 * Tous les sons avaient été retirés de l'ouverture : ils cassaient les oreilles.
 * Un seul revient — la **résolution** à l'arrêt, qui gradue ce qu'on vient
 * d'obtenir. Le roulement de fond, la montée de tension et le cran synthétisé
 * restent au placard : c'est leur superposition qui faisait la nappe fatigante,
 * et le cliquet du fichier dit désormais tout ce qu'il y a à dire.
 *
 * Le module avait été conservé plutôt que supprimé parce qu'il portait des
 * décisions coûteuses à refaire — le choix des notes à l'oreille parmi dix
 * candidates, la descente du cran sous la zone sensible de l'audition, le bus à
 * compresseur qui empêchait l'écrêtage. C'est ce qui rend ce retour bon marché.
 *
 * ## Le son se coupe, et le choix se retient
 *
 * Un son d'interface qu'on ne peut pas éteindre est un défaut, et celui-ci a
 * déjà agacé une fois. `basculeSon()` le coupe pour de bon, `contexte()` refuse
 * de s'ouvrir tant qu'il l'est, et le choix survit au rechargement.
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
const CLE_SON = 'winter.son';

/** `null` tant que la préférence n'a pas été lue. */
let actif: boolean | null = null;

/**
 * Le son est-il allumé ?
 *
 * Allumé par défaut : l'ouverture d'un booster est le seul endroit du site qui
 * en émette, et c'est un geste que l'on déclenche exprès. Mais le choix
 * contraire se retient — rien n'est plus agaçant qu'un réglage à refaire à
 * chaque visite.
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
 * module — et c'est bien ce qu'il doit faire, puisque les émetteurs de son le
 * consultent sans passer par un composant. Un magasin observable est la façon
 * dont React lit ce genre de source : `useSyncExternalStore` s'en sert pour
 * afficher la bonne icône sans jamais désynchroniser le rendu serveur du rendu
 * client, ce qu'un `setState` dans un effet ferait au prix d'un rendu de plus.
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
  for (const rappel of abonnes) rappel();
  return suivant;
}

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
  // Un seul point de coupure pour tous les sons : aucun émetteur ne peut
  // l'oublier, puisque tous passent par ici et abandonnent sur `null`.
  if (!sonActif()) return null;
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
export function bruitDeCran(intensite = 1) {
  const ctx = contexte();
  if (!ctx) return;

  const v = Math.min(1, Math.max(0, intensite));

  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 1200;
  doux.Q.value = 0.5;
  doux.connect(sortie(ctx));

  /*
   * La hauteur et le niveau suivent la vitesse du rail.
   *
   * Ce n'est pas un ornement : c'est ce qui fait entendre le ralentissement
   * autrement que par l'espacement des clics. Une bande lancée cliquette clair
   * et fort, une bande qui s'arrête fait des clics graves et mous — la
   * différence est celle d'un mécanisme qui perd son élan. L'écart reste
   * volontairement étroit (470 à 330 hertz) : au-delà on entend deux sons
   * distincts au lieu d'un seul qui décélère.
   */
  joue(ctx, doux, {
    hz: 330 + v * 140,
    vers: 240 + v * 90,
    duree: 0.05,
    niveau: 0.022 + v * 0.02,
  });
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

/* -------------------------------------------------------------------------- */

/** Niveau du lit de cliquet, une fois lancé. */
const NIVEAU_SPIN = 0.5;

/** Vitesse de lecture au ralenti, quand le rail s'immobilise. */
const LENTEUR = 0.3;

let tampon: AudioBuffer | null = null;
let chargement: Promise<AudioBuffer | null> | null = null;

/**
 * Le lit de cliquet, décodé une fois pour la vie de la page.
 *
 * Le décodage d'un MP3 de deux secondes coûte quelques millisecondes, mais il
 * est asynchrone : demandé au moment où le rail démarre, le son arriverait après
 * lui. D'où `prechargeSpin()`, appelé à l'affichage de l'écran d'ouverture.
 */
function tamponDeSpin(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (tampon) return Promise.resolve(tampon);
  if (!chargement) {
    chargement = fetch('/sons/spin.mp3')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((d) => ctx.decodeAudioData(d))
      .then((b) => {
        tampon = b;
        return b;
      })
      .catch(() => null);
  }
  return chargement;
}

/**
 * Précharge le cliquet.
 *
 * Sans effet si le son est coupé : on ne va pas chercher cinquante kilo-octets
 * que personne n'entendra.
 */
export function prechargeSpin() {
  const ctx = contexte();
  if (ctx) void tamponDeSpin(ctx);
}

/**
 * Le cliquet du rail, en boucle, piloté par la vitesse.
 *
 * ## Un seul pour toute l'ouverture
 *
 * Cinq rouleaux, un seul lit. Cinq boucles superposées ne font pas un cliquet
 * cinq fois plus riche : elles se déphasent et font un bourdonnement. Le
 * pilotage prend donc la vitesse **du rouleau le plus rapide encore en course**,
 * si bien que le son reste vivant tant que quelque chose tourne, et ne s'éteint
 * qu'avec le dernier.
 *
 * ## Le ralentissement n'est écrit nulle part
 *
 * C'est tout l'intérêt de piloter `playbackRate` plutôt que de programmer des
 * clics. La cadence du cliquet est la vitesse du rail, donc elle épouse
 * exactement le mouvement — hésitations comprises. Les trois appâts s'entendent
 * sans qu'une ligne ne les mentionne : le cliquet s'étire quand la bande
 * s'attarde sur une fausse légendaire, et repart avec elle.
 *
 * La hauteur descend avec la cadence, puisque c'est le même réglage — ce qui est
 * précisément le bruit d'un mécanisme qui perd son élan. On ne descend pas en
 * dessous de 0,3 : plus bas, on n'entend plus un cliquet qui ralentit mais une
 * bande magnétique qui meurt.
 */
export function boucleDeSpin(): { vitesse: (v: number) => void; arrete: () => void } {
  const ctx = contexte();
  let source: AudioBufferSourceNode | null = null;
  let volume: GainNode | null = null;
  let mort = false;

  if (ctx) {
    void tamponDeSpin(ctx).then((buf) => {
      if (!buf || mort) return;
      volume = ctx.createGain();
      volume.gain.setValueAtTime(0.0001, ctx.currentTime);
      volume.gain.exponentialRampToValueAtTime(NIVEAU_SPIN, ctx.currentTime + 0.15);
      volume.connect(sortie(ctx));

      source = ctx.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      source.connect(volume);
      source.start();
    });
  }

  return {
    vitesse(v: number) {
      if (!ctx || !source || !volume) return;
      const n = Math.min(1, Math.max(0, v));
      // `setTargetAtTime` et non `value` : appelé à chaque image, un saut brut
      // ferait craquer le son à chaque changement. La constante de temps lisse
      // sans traîner derrière l'animation.
      source.playbackRate.setTargetAtTime(LENTEUR + (1 - LENTEUR) * n, ctx.currentTime, 0.06);
      volume.gain.setTargetAtTime(NIVEAU_SPIN * (0.3 + 0.7 * n), ctx.currentTime, 0.1);
    },
    arrete() {
      mort = true;
      if (!ctx || !source || !volume) return;
      volume.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      source.stop(ctx.currentTime + 0.8);
    },
  };
}
