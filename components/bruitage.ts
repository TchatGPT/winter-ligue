/**
 * Le bruit d'un sachet qu'on déchire, synthétisé.
 *
 * Pas de fichier audio. Un déchirement de mylar, c'est du bruit filtré : le
 * synthétiser tient en vingt lignes, là où un échantillon demanderait un fichier
 * à héberger, un aller-retour réseau et un préchargement pour que le son ne
 * traîne pas derrière l'animation.
 *
 * Il n'est déclenché que par un double-clic délibéré, jamais au chargement. Le
 * contexte audio est fermé dès la fin du son : en laisser un ouvert par
 * ouverture finirait par épuiser le quota du navigateur.
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

  const duree = 0.5;
  const n = Math.floor(ctx.sampleRate * duree);
  const tampon = ctx.createBuffer(1, n, ctx.sampleRate);
  const canal = tampon.getChannelData(0);

  /*
   * Un film ne se déchire pas d'un trait, il cède par à-coups.
   *
   * D'où ce bruit blanc haché de micro-crêtes plutôt qu'une enveloppe lisse :
   * c'est le crépitement irrégulier qui fait entendre du plastique, une
   * décroissance propre ne donnant qu'un souffle.
   */
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const enveloppe = Math.exp(-3.4 * t) * (1 - t);
    const crete = Math.random() < 0.04 ? 3.4 : 1;
    canal[i] = (Math.random() * 2 - 1) * enveloppe * crete;
  }

  const source = ctx.createBufferSource();
  source.buffer = tampon;

  // Le mylar chante dans les aigus : sous 1 kHz on n'entend qu'un grondement.
  const bande = ctx.createBiquadFilter();
  bande.type = 'bandpass';
  bande.frequency.value = 3100;
  bande.Q.value = 0.65;

  const volume = ctx.createGain();
  volume.gain.value = 0.14;

  source.connect(bande).connect(volume).connect(ctx.destination);
  source.onended = () => {
    void ctx.close();
  };
  source.start();
}
