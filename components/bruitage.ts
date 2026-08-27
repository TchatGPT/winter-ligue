/**
 * Le bruit d'un sachet qu'on ouvre, synthétisé.
 *
 * Pas de fichier audio. Un sachet de mylar ne produit que du bruit filtré :
 * le synthétiser tient en trente lignes, là où un échantillon demanderait un
 * fichier à héberger, un aller-retour réseau et un préchargement pour que le
 * son ne traîne pas derrière l'animation.
 *
 * Il n'est déclenché que par un double-clic délibéré, jamais au chargement, et
 * le contexte audio est fermé dès la fin : en laisser un ouvert par ouverture
 * finirait par épuiser le quota du navigateur.
 */
export function bruitDeDechirure() {
  const Fabrique =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
  if (!Fabrique) return;

  let ctx: AudioContext;
  try {
    ctx = new Fabrique();
  } catch {
    // Un navigateur peut refuser d'ouvrir un contexte audio. Le son est un
    // agrément, son absence ne doit rien empêcher.
    return;
  }

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
