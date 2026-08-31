/**
 * Les sons de l'ouverture.
 *
 * ## Cinq échantillons, plus rien de synthétisé
 *
 * Ils viennent d'EmpireDrop, et ils remplacent les sons fabriqués à l'oscillateur
 * qui les précédaient. Ceux-ci avaient été écrits faute de fichiers, et défendus
 * longtemps ; ils tombent d'un coup, parce qu'un échantillon enregistré porte des
 * transitoires et un timbre qu'aucune somme de sinus filtrés n'approche. Les
 * garder « au cas où » n'aurait laissé que du code mort qui ne peut plus revenir.
 *
 * | fichier                     | durée   | rôle                            |
 * | --------------------------- | ------- | ------------------------------- |
 * | `box-opening-spin-tick`     | 0,209 s | une dent du cliquet             |
 * | `spin-bait`                 | 5,747 s | la montée qui fait croire       |
 * | `common`                    | 0,784 s | le claquement d'un arrêt        |
 * | `rare`                      | 5,642 s | la fête, rare et super rare     |
 * | `ultra_rare`                | 3,762 s | l'arrêt sur une ultra rare      |
 * | `legendary`                 | 3,762 s | l'arrêt sur une légendaire      |
 *
 * Les deux derniers ont exactement la même durée et le même poids sans être le
 * même fichier : EmpireDrop réutilise son lit musical et n'en change que le
 * contenu.
 *
 * ## Le ralentissement n'est écrit nulle part
 *
 * Le cliquet se déclenche sur la **distance parcourue** par le rail, pas sur une
 * horloge. La cadence est donc la dérivée du mouvement : elle épouse exactement
 * la courbe, hésitations comprises. Les trois appâts s'entendent sans qu'une
 * ligne ne les mentionne — le cliquet s'étire quand la bande s'attarde sur une
 * fausse légendaire, et repart avec elle.
 *
 * ## Le son se coupe, et le choix se retient
 *
 * Un son d'interface qu'on ne peut pas éteindre est un défaut, et celui-ci a déjà
 * agacé une fois. `contexte()` refuse de s'ouvrir tant qu'il est coupé, donc
 * aucun émetteur ne peut oublier le réglage : tous passent par là.
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

/* -------------------------------------------------------------------------- */

const SONS = {
  cran: '/sons/box-opening-spin-tick.mp3',
  appat: '/sons/spin-bait.mp3',
  commun: '/sons/common.mp3',
  rare: '/sons/rare.mp3',
  ultra: '/sons/ultra_rare.mp3',
  legendaire: '/sons/legendary.mp3',
} as const;

export type NomSon = keyof typeof SONS;

/** Le niveau propre à chaque son, avant le bus. */
const NIVEAUX: Record<NomSon, number> = {
  // Le cliquet se répète des dizaines de fois : il doit se poser sous le reste,
  // sinon il devient le son de l'ouverture au lieu d'en être la texture.
  cran: 0.32,
  appat: 0.5,
  commun: 0.55,
  rare: 0.6,
  ultra: 0.65,
  legendaire: 0.7,
};

const tampons = new Map<NomSon, AudioBuffer>();
const chargements = new Map<NomSon, Promise<AudioBuffer | null>>();

/**
 * Décode un échantillon, une fois pour la vie de la page.
 *
 * L'échec est une valeur, pas une exception : un son est un agrément, et son
 * absence ne doit jamais empêcher un geste. Un fichier manquant se traduit par un
 * silence, pas par une ouverture qui casse.
 */
function charge(ctx: AudioContext, nom: NomSon): Promise<AudioBuffer | null> {
  const pret = tampons.get(nom);
  if (pret) return Promise.resolve(pret);

  let encours = chargements.get(nom);
  if (!encours) {
    encours = fetch(SONS[nom])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((d) => ctx.decodeAudioData(d))
      .then((b) => {
        tampons.set(nom, b);
        return b;
      })
      .catch(() => null);
    chargements.set(nom, encours);
  }
  return encours;
}

/**
 * Précharge tout ce que l'ouverture va jouer.
 *
 * Le décodage est asynchrone : demandé au démarrage du rail, le cliquet
 * arriverait après lui, et l'appât — cent soixante-dix kilo-octets — bien plus
 * tard encore. On décode pendant que le joueur choisit son sachet.
 *
 * Sans effet si le son est coupé : on ne va pas chercher trois cents
 * kilo-octets que personne n'entendra.
 */
export function prechargeSons() {
  const ctx = contexte();
  if (!ctx) return;
  for (const nom of Object.keys(SONS) as NomSon[]) void charge(ctx, nom);
}

/**
 * Joue un échantillon.
 *
 * `quand` est un délai en secondes, pour programmer un son à l'avance sur
 * l'horloge audio — bien plus stable qu'un `setTimeout`, qui dérive dès que le
 * fil principal est occupé, ce qu'il est précisément pendant une animation.
 */
export function joueSon(nom: NomSon, quand = 0) {
  const ctx = contexte();
  if (!ctx) return;

  void charge(ctx, nom).then((tampon) => {
    if (!tampon) return;
    const volume = ctx.createGain();
    volume.gain.value = NIVEAUX[nom];
    volume.connect(sortie(ctx));

    const source = ctx.createBufferSource();
    source.buffer = tampon;
    source.connect(volume);
    source.start(ctx.currentTime + Math.max(0, quand));
  });
}

/**
 * Programme un son pour qu'il **se termine** à l'instant donné.
 *
 * C'est ce dont l'appât a besoin : ses 5,747 secondes doivent résoudre pile au
 * moment où le dernier rouleau s'arrête, sans quoi la montée retombe dans le
 * vide ou se fait couper. On cale donc la fin, pas le début — et la durée vient
 * du tampon décodé plutôt que d'une constante, pour qu'un remplacement du
 * fichier ne demande aucune retouche ici.
 *
 * Si le son est plus long que le temps restant, il démarre tout de suite : mieux
 * vaut une montée tronquée qu'une montée qui déborde sur la révélation.
 */
export function programmeFin(nom: NomSon, dansMs: number) {
  const ctx = contexte();
  if (!ctx) return;

  const demande = performance.now();
  void charge(ctx, nom).then((tampon) => {
    if (!tampon) return;
    // Le décodage a pris du temps : on le retire du délai restant.
    const restant = dansMs - (performance.now() - demande);
    joueSon(nom, Math.max(0, restant / 1000 - tampon.duration));
  });
}

/**
 * Le son de fête qui convient à un palier, ou rien.
 *
 * Quatre fichiers pour six raretés, et la coupure suit exactement leurs noms :
 * `legendary` pour la légendaire, `ultra_rare` pour l'ultra rare, `rare` pour la
 * rare et la super rare. En dessous, `null` — le claquement d'arrêt suffit.
 * Fêter une peu commune dévaluerait la fête pour les paliers qu'on attend
 * vraiment.
 */
export function sonDeFete(rang: number): NomSon | null {
  if (rang >= 5) return 'legendaire';
  if (rang >= 4) return 'ultra';
  if (rang >= 2) return 'rare';
  return null;
}
