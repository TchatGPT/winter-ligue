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
 */

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

/**
 * Le petit bruit sec du sachet qu'on fait passer devant soi.
 *
 * Dix fois plus court et cinq fois plus discret que l'ouverture : il ponctue
 * une navigation, et un geste qu'on répète en glissant le rail ne doit surtout
 * pas s'entendre autant que celui, unique, qui coûte des flocons.
 */
export function bruitDeSelection() {
  const ctx = contexte();
  if (!ctx) return;

  const n = Math.floor(ctx.sampleRate * 0.075);
  const tampon = ctx.createBuffer(1, n, ctx.sampleRate);
  const canal = tampon.getChannelData(0);
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    canal[i] = (Math.random() * 2 - 1) * Math.exp(-14 * t) * (1 - t);
  }

  const source = ctx.createBufferSource();
  source.buffer = tampon;

  const bande = ctx.createBiquadFilter();
  bande.type = 'bandpass';
  bande.frequency.value = 4200;
  bande.Q.value = 1.4;

  const volume = ctx.createGain();
  volume.gain.value = 0.1;

  source.connect(bande).connect(volume).connect(ctx.destination);
  source.onended = () => {
    void ctx.close();
  };
  source.start();
}

/** Le sachet qu'on déchire, au moment de l'ouvrir. */
export function bruitDeDechirure() {
  const ctx = contexte();
  if (!ctx) return;

  const duree = 0.85;
  const n = Math.floor(ctx.sampleRate * duree);
  const tampon = ctx.createBuffer(1, n, ctx.sampleRate);
  const canal = tampon.getChannelData(0);

  /*
   * Un déchirement est une grêle de micro-craquements, pas une détonation.
   *
   * Une première version prenait du bruit blanc sous une simple décroissance
   * exponentielle : ça donnait une claque, parce qu'une enveloppe unique n'a
   * qu'une attaque et qu'une chute. Ici chaque craquement est un grain qui naît
   * à un instant tiré au sort et retombe en trois millisecondes ; c'est leur
   * irrégularité qui fait entendre du plastique.
   *
   * Leur densité suit le geste : elle monte à mesure que le film cède, culmine,
   * puis s'éteint quand la déchirure atteint le bord.
   */
  const chute = Math.exp(-1 / (0.003 * ctx.sampleRate));
  const grainsParSeconde = 900;
  let grain = 0;

  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const densite = Math.sin(Math.PI * Math.min(1, t * 1.12)) ** 1.3;
    if (Math.random() < (grainsParSeconde / ctx.sampleRate) * densite) {
      grain = 0.35 + Math.random() * 0.65;
    }
    grain *= chute;
    canal[i] = (Math.random() * 2 - 1) * grain;
  }

  const source = ctx.createBufferSource();
  source.buffer = tampon;

  // Sous le kilohertz, il ne reste qu'un grondement sourd : c'est ce qui donnait
  // à la version précédente son côté « coup » plutôt que « froissement ».
  const coupeBas = ctx.createBiquadFilter();
  coupeBas.type = 'highpass';
  coupeBas.frequency.value = 1100;
  coupeBas.Q.value = 0.7;

  // La bosse où le mylar chante.
  const brillance = ctx.createBiquadFilter();
  brillance.type = 'peaking';
  brillance.frequency.value = 5200;
  brillance.Q.value = 1.1;
  brillance.gain.value = 7;

  const volume = ctx.createGain();
  volume.gain.value = 0.5;

  source.connect(coupeBas).connect(brillance).connect(volume).connect(ctx.destination);
  source.onended = () => {
    void ctx.close();
  };
  source.start();
}
