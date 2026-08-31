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
 * ## Un limiteur de sécurité, et rien de plus
 *
 * Le compresseur écrasait à `-24` dBFS avec un rapport de 12. C'était réglé pour
 * des sinus synthétisés, dont les crêtes s'additionnaient sans contrôle. Les
 * échantillons d'EmpireDrop sont déjà masterisés : leurs crêtes vont de `-21` à
 * `-6` dBFS, si bien que le compresseur mordait en permanence et pompait sur
 * chaque fanfare.
 *
 * Le seuil remonte à `-6` : il ne sert plus qu'à rattraper la somme quand une
 * fanfare, le cliquet et l'appât tombent ensemble — cas mesuré à `-3` dBFS, donc
 * juste sous l'écrêtage. Le reste du temps le limiteur ne fait rien, ce qui est
 * exactement ce qu'on attend d'un filet de sécurité.
 */
function sortie(ctx: AudioContext): AudioNode {
  if (bus) return bus;

  const limiteur = ctx.createDynamicsCompressor();
  limiteur.threshold.value = -6;
  limiteur.knee.value = 4;
  limiteur.ratio.value = 12;
  limiteur.attack.value = 0.003;
  limiteur.release.value = 0.25;

  const general = ctx.createGain();
  general.gain.value = VOLUME;

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

/**
 * Le volume général.
 *
 * **C'est le seul nombre à toucher pour « plus fort » ou « moins fort ».** Les
 * niveaux par son, plus bas, sont un équilibre entre eux et non des volumes :
 * les bouger un par un défait la mesure qui les a produits.
 *
 * À 0,9, la chronologie complète — trente-cinq crans, cinq claquements, une
 * fanfare et l'appât, mixés et mesurés hors ligne — culmine à −6,5 dBFS, soit
 * juste au seuil du limiteur : il ne fait rien sauf sur les crêtes les plus
 * hautes. Le niveau court terme monte de −44 dB pendant le défilement à −26 dB
 * sur la fanfare, ce qui est la montée qu'on veut entendre.
 */
const VOLUME = 0.9;

/**
 * Le niveau de chaque son, avant le bus.
 *
 * ## Ces nombres sont mesurés, pas estimés
 *
 * Les six fichiers ne sont **pas au même niveau**, et de très loin. Décodés puis
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
 * Les premiers réglages étaient posés au jugé, par rôle : cliquet discret à
 * 0,32, fanfare à 0,70. Ils allaient donc dans le **mauvais sens** — ils
 * baissaient encore le fichier déjà le plus faible. Résultat mesuré : le cliquet
 * sortait dix-huit décibels sous la fanfare, c'est-à-dire inaudible pendant
 * qu'elle sature.
 *
 * Chaque gain ci-dessous est donc le produit de deux choses :
 *
 * 1. une **normalisation** qui ramène le fichier au niveau de `ultra_rare` ;
 * 2. un **écart de rôle** délibéré, en décibels, seule partie discutable.
 *
 * Les écarts retenus : le cliquet à −8 dB parce qu'il revient trente-cinq fois
 * et doit être la texture et non le sujet ; l'appât à −6 parce qu'il passe sous
 * tout le reste ; le claquement d'arrêt à −4 ; les trois fanfares à 0, elles
 * sont ce qu'on attend.
 *
 * Aucune crête ne dépasse −6 dBFS après gain, et leur somme dans le pire cas —
 * fanfare, cliquet et appât ensemble — atteint −3 dBFS : le limiteur a de quoi
 * travailler sans jamais écrêter.
 */
const NIVEAUX: Record<NomSon, number> = {
  cran: 1.57, // ×3,94 pour normaliser, −8 dB de rôle
  appat: 1.07, // ×2,14, −6 dB
  commun: 1.72, // ×2,72, −4 dB
  rare: 1.2, // ×1,20, 0 dB
  ultra: 1.0, // référence
  legendaire: 1.04, // ×1,04, 0 dB
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
    const dejaLa = octets.get(nom);
    encours = (dejaLa
      ? Promise.resolve(dejaLa)
      : fetch(SONS[nom]).then((r) =>
          r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))),
        )
    )
      // `decodeAudioData` consomme le tampon : on lui en donne une copie, sans
      // quoi un second décodage — après un changement de contexte — échouerait.
      .then((d) => ctx.decodeAudioData(d.slice(0)))
      .then((b) => {
        tampons.set(nom, b);
        return b;
      })
      .catch(() => null);
    chargements.set(nom, encours);
  }
  return encours;
}

/** Les octets déjà rapatriés, en attente d'un contexte pour les décoder. */
const octets = new Map<NomSon, ArrayBuffer>();

/**
 * Rapatrie les fichiers, **sans ouvrir de contexte audio**.
 *
 * ## Pourquoi c'est la seule chose à faire ici
 *
 * Un `AudioContext` créé hors d'un geste de l'utilisateur naît **suspendu** :
 * son horloge ne tourne pas. Tout ce qu'on lui programme à `currentTime` se
 * range donc au même instant, et part d'un bloc quand il se réveille enfin —
 * un tirage entier de crans lâché d'un coup, plusieurs secondes en retard.
 *
 * C'était exactement le défaut : le préchargement ouvrait le contexte au
 * montage de l'écran, bien avant le clic d'ouverture.
 *
 * On se contente donc de remplir le cache : trois cents kilo-octets rapatriés
 * pendant que le joueur choisit son sachet, et le décodage n'attend plus que le
 * contexte, qui naîtra dans le geste.
 */
export function prechargeSons() {
  if (!sonActif() || typeof fetch !== 'function') return;
  for (const nom of Object.keys(SONS) as NomSon[]) {
    if (octets.has(nom)) continue;
    void fetch(SONS[nom])
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((d) => {
        if (d) octets.set(nom, d);
      })
      .catch(() => null);
  }
}

/**
 * Ouvre et réveille le contexte, puis décode tout.
 *
 * **À appeler depuis le gestionnaire du clic**, et de nulle part ailleurs :
 * c'est le geste qui autorise le navigateur à démarrer l'horloge audio. Appelé
 * une image trop tard, la permission est perdue.
 */
export function reveilleSon() {
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
    /*
     * Rien sur une horloge arrêtée.
     *
     * Si le contexte n'a pas encore démarré — geste trop récent, autorisation
     * refusée — `currentTime` ne progresse pas et tout ce qu'on programme
     * s'entasse sur le même instant. Perdre un cran vaut infiniment mieux que
     * les lâcher tous en retard, d'un bloc.
     */
    if (ctx.state !== 'running') return;
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
