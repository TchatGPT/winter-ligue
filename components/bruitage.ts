/**
 * Les bruits des sachets, synthétisés.
 *
 * Pas de fichier audio. Un sachet de mylar ne produit que du bruit filtré : le
 * synthétiser tient en quelques lignes, là où des échantillons demanderaient
 * des fichiers à héberger, des allers-retours réseau et un préchargement pour
 * que le son ne traîne pas derrière l'animation.
 *
 * Rien ne part au chargement : chaque son suit un geste délibéré. Et le
 * contexte audio est fermé dès la fin — en laisser un ouvert par son finirait
 * par épuiser le quota du navigateur, qui en compte les instances.
 *
 * ## Trois règles, tenues par les deux sons
 *
 * Une première version cherchait le réalisme et tapait dans les oreilles :
 * attaques instantanées, coupe-bas à 1,1 kHz et une bosse de +7 dB à 5,2 kHz,
 * c'est-à-dire précisément la bande où l'oreille est le plus sensible. Un son
 * qu'on entend dix fois en choisissant un booster n'a pas à être fidèle ; il
 * a à être agréable. D'où :
 *
 *  1. **Aucune attaque instantanée.** Toute enveloppe monte en cosinus sur
 *     plusieurs dizaines de millisecondes. C'est le passage de zéro à pleine
 *     amplitude en un échantillon qui fait le « clic » agressif, bien plus que
 *     le contenu spectral.
 *  2. **Rien au-dessus de trois kilohertz.** Passe-bas doux, puis plateau
 *     descendant qui enlève ce qui reste. Le sifflement du film disparaît, la
 *     matière reste.
 *  3. **Bas niveau, et deux canaux décorrélés.** Un bruit légèrement différent
 *     à gauche et à droite s'entend comme large et proche plutôt que comme
 *     ponctuel — c'est ce qui fait la sensation d'enveloppement au casque.
 */

/** Durées, en secondes. */
const DUREE_SELECTION = 0.34;
const DUREE_DECHIRURE = 1.25;

/**
 * Niveaux de sortie.
 *
 * Ils paraissent élevés et ne le sont pas : le passe-bas retire l'essentiel
 * de l'énergie du bruit blanc, si bien que le signal rendu crête à 0,09 pour
 * la sélection et 0,30 pour l'ouverture — contre 0,2 et 0,9 auparavant, cette
 * dernière frôlant la saturation. C'est le niveau **mesuré en sortie** qui
 * compte, pas le gain affiché.
 *
 * Ne pas les baisser davantage. Une version antérieure du froissement tenait
 * à un dixième de volume : elle passait tout simplement inaperçue, et trop
 * discret revient au même que muet.
 */
const NIVEAU_SELECTION = 0.38;
const NIVEAU_DECHIRURE = 0.36;

/**
 * Ouvre un contexte audio, ou rien.
 *
 * Un navigateur peut refuser — quota atteint, politique de la page. Le son est
 * un agrément : son absence ne doit jamais empêcher le geste.
 */
function contexte(): AudioContext | null {
  const Fabrique =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Fabrique) return null;
  try {
    return new Fabrique();
  } catch {
    return null;
  }
}

/** Une montée en cosinus, de 0 à 1 sur [0, 1]. Ni angle, ni pente infinie. */
function douceur(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}

/**
 * Un tampon stéréo rempli par une fonction d'enveloppe.
 *
 * Le bruit est tiré indépendamment pour chaque canal. Deux bruits identiques
 * se placent au centre de la tête ; deux bruits décorrélés s'ouvrent en
 * largeur, et c'est la moitié de l'effet recherché.
 */
function tampon(
  ctx: BaseAudioContext,
  duree: number,
  enveloppe: (t: number, i: number) => number,
) {
  const n = Math.floor(ctx.sampleRate * duree);
  const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < n; i += 1) {
      canal[i] = (Math.random() * 2 - 1) * enveloppe(i / n, i);
    }
  }
  return buffer;
}

/**
 * Le volume de sortie, avec ses fondus.
 *
 * Même une enveloppe douce laisse un résidu au tout début et à la toute fin ;
 * ces deux rampes garantissent le silence exact aux deux bouts. Sans elles, un
 * son qu'on répète en glissant le rail finit par accumuler des micro-clics.
 */
function volumeFondu(ctx: BaseAudioContext, niveau: number, duree: number) {
  const volume = ctx.createGain();
  const t0 = ctx.currentTime;
  volume.gain.setValueAtTime(0, t0);
  volume.gain.linearRampToValueAtTime(niveau, t0 + 0.03);
  volume.gain.setValueAtTime(niveau, t0 + duree - 0.08);
  volume.gain.linearRampToValueAtTime(0, t0 + duree);
  return volume;
}

/**
 * Le froissement du sachet qu'on fait passer devant soi.
 *
 * Le geste est répété — on traverse le rail d'un bout à l'autre et il part une
 * fois par sachet franchi. Il doit donc être court, très bas, et surtout ne
 * jamais accrocher l'oreille : c'est une caresse de papier, pas un déclic.
 */
function grapheSelection(ctx: BaseAudioContext) {
  const source = ctx.createBufferSource();
  source.buffer = tampon(ctx, DUREE_SELECTION, (t) => {
    // Montée sur le premier cinquième, puis une décroissance qui s'annule
    // exactement à la fin plutôt que d'être coupée.
    const monte = douceur(t / 0.2);
    const chute = Math.exp(-3.2 * t) * (1 - t) ** 1.4;
    return monte * chute;
  });

  // Le corps du son. Un Q très bas donne une pente longue et sans bosse à la
  // coupure — une résonance ici s'entendrait comme un « tsss ».
  //
  // La coupure ne descend pas plus bas que 2,4 kHz. À 1,5 le centroïde du son
  // rendu tombait à 530 Hz, sous la bande où un froissement se lit encore
  // comme du papier : il n'en restait qu'un bruit sourd. On enlève ce qui
  // siffle, pas ce qui donne la matière.
  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 2400;
  doux.Q.value = 0.4;

  // Ce que le passe-bas laisse encore filer au-dessus de 2,4 kHz.
  const plateau = ctx.createBiquadFilter();
  plateau.type = 'highshelf';
  plateau.frequency.value = 3600;
  plateau.gain.value = -13;

  // Un peu de corps dans le bas : sans lui le froissement paraît maigre, et on
  // est tenté d'en remonter le volume — ce qui ramène le problème de départ.
  const chaleur = ctx.createBiquadFilter();
  chaleur.type = 'lowshelf';
  chaleur.frequency.value = 260;
  chaleur.gain.value = 3;

  const volume = volumeFondu(ctx, NIVEAU_SELECTION, DUREE_SELECTION);
  source.connect(doux).connect(plateau).connect(chaleur).connect(volume);
  volume.connect(ctx.destination);
  return source;
}

/**
 * Le sachet qu'on ouvre.
 *
 * Une déchirure est une grêle de micro-craquements : chaque grain naît à un
 * instant tiré au sort et retombe. Ce qui change ici par rapport à la version
 * précédente, c'est la vitesse à laquelle il retombe — trente millisecondes au
 * lieu de trois. Un grain qui s'éteint lentement se fond dans le suivant, et la
 * grêle devient un froissement continu au lieu d'une crépitation.
 *
 * La densité suit le geste : elle monte à mesure que le film cède, culmine,
 * puis s'éteint quand la déchirure atteint le bord.
 */
function grapheDechirure(ctx: BaseAudioContext) {
  const chute = Math.exp(-1 / (0.03 * ctx.sampleRate));
  const grainsParSeconde = 260;
  // Les deux canaux sont remplis l'un après l'autre : `grain` doit repartir de
  // zéro pour le second, sinon il hériterait de la queue du premier.
  let grain = 0;
  let precedent = -1;

  const source = ctx.createBufferSource();
  source.buffer = tampon(ctx, DUREE_DECHIRURE, (t, i) => {
    if (i <= precedent) grain = 0;
    precedent = i;

    // Une enveloppe d'ensemble en cloche, longue à monter et longue à
    // redescendre : c'est elle qui donne au son son allure de geste continu.
    // Le sommet est placé au premier tiers, pas au milieu : une cloche
    // symétrique sur 1,25 s met plus de trois cents millisecondes à monter, et
    // le son se décroche du geste qui l'a déclenché.
    const ampleur = Math.sin(Math.PI * t ** 0.7) ** 1.1;
    const densite = douceur(t / 0.12) * (1 - t) ** 0.5;
    if (Math.random() < (grainsParSeconde / ctx.sampleRate) * densite) {
      grain = 0.4 + Math.random() * 0.6;
    }
    grain *= chute;
    return grain * ampleur;
  });

  // Même traitement que la sélection, un peu plus ouvert : l'ouverture est
  // l'évènement de la page, elle a droit à un peu plus de matière.
  const doux = ctx.createBiquadFilter();
  doux.type = 'lowpass';
  doux.frequency.value = 2800;
  doux.Q.value = 0.4;

  const plateau = ctx.createBiquadFilter();
  plateau.type = 'highshelf';
  plateau.frequency.value = 4000;
  plateau.gain.value = -12;

  const chaleur = ctx.createBiquadFilter();
  chaleur.type = 'lowshelf';
  chaleur.frequency.value = 220;
  chaleur.gain.value = 5;

  const volume = volumeFondu(ctx, NIVEAU_DECHIRURE, DUREE_DECHIRURE);
  source.connect(doux).connect(plateau).connect(chaleur).connect(volume);
  volume.connect(ctx.destination);
  return source;
}

/** Le froissement du sachet qu'on fait passer devant soi. */
export function bruitDeSelection() {
  const ctx = contexte();
  if (!ctx) return;
  const source = grapheSelection(ctx);
  source.onended = () => {
    void ctx.close();
  };
  source.start();
}

/** Le sachet qu'on déchire, au moment de l'ouvrir. */
export function bruitDeDechirure() {
  const ctx = contexte();
  if (!ctx) return;
  const source = grapheDechirure(ctx);
  source.onended = () => {
    void ctx.close();
  };
  source.start();
}
