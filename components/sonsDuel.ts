'use client';

/**
 * Les sons du duel : la neige qui roule, les bosses, le fracas, les grelots.
 *
 * ## Pourquoi pas les sons des boosters
 *
 * Le duel les empruntait : le claquement d'un arrêt de rail pour un impact, la
 * fête d'une carte rare pour une victoire. On entendait une ouverture de
 * booster là où il n'y en avait pas. Le duel a maintenant les siens, et ils
 * sont **synthétisés** : du bruit filtré pour la neige, des sinus pour les
 * grelots. Aucun fichier à charger, rien à attendre au premier clic.
 *
 * Tout passe par un bus à volume contenu, derrière un compresseur : plusieurs
 * sons qui tombent ensemble — une bosse pendant le roulement — ne saturent pas.
 */

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let bruit: AudioBuffer | null = null;

const VOLUME = 0.5;

function contexte(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Constructeur =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructeur) return null;
    ctx = new Constructeur();
    bus = ctx.createGain();
    bus.gain.value = VOLUME;
    const filet = ctx.createDynamicsCompressor();
    filet.threshold.value = -10;
    filet.ratio.value = 8;
    bus.connect(filet).connect(ctx.destination);
  }
  return ctx;
}

/** Deux secondes de bruit blanc, tirées une fois, rejouées en boucle. */
function tamponBruit(audio: AudioContext): AudioBuffer {
  if (!bruit) {
    bruit = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const donnees = bruit.getChannelData(0);
    for (let i = 0; i < donnees.length; i += 1) donnees[i] = Math.random() * 2 - 1;
  }
  return bruit;
}

/** Réveille le contexte. **À appeler depuis un gestionnaire de clic.** */
export function reveilleSonsDuel(): void {
  void contexte()?.resume();
}

/** Une note qui s'éteint : la brique des grelots et des bosses. */
function note(frequence: number, quand: number, duree: number, gain: number, forme: OscillatorType = 'sine'): void {
  const audio = contexte();
  if (!audio || !bus) return;
  const osc = audio.createOscillator();
  osc.type = forme;
  osc.frequency.value = frequence;
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.0001, quand);
  volume.gain.exponentialRampToValueAtTime(gain, quand + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, quand + duree);
  osc.connect(volume).connect(bus);
  osc.start(quand);
  osc.stop(quand + duree + 0.05);
}

/** Une bouffée de bruit filtré : la neige qui s'écrase, ou qui s'éparpille. */
function bouffee(quand: number, duree: number, gain: number, filtre: BiquadFilterType, frequence: number): void {
  const audio = contexte();
  if (!audio || !bus) return;
  const src = audio.createBufferSource();
  src.buffer = tamponBruit(audio);
  const f = audio.createBiquadFilter();
  f.type = filtre;
  f.frequency.value = frequence;
  const volume = audio.createGain();
  volume.gain.setValueAtTime(gain, quand);
  volume.gain.exponentialRampToValueAtTime(0.0001, quand + duree);
  src.connect(f).connect(volume).connect(bus);
  src.start(quand, Math.random());
  src.stop(quand + duree + 0.05);
}

export interface Roulement {
  /** De 0 à 1 : plus la boule est grosse, plus elle gronde. */
  regle(intensite: number): void;
  arrete(): void;
}

/** Le grondement de la boule qui roule. Un par couloir. */
export function demarreRoulement(): Roulement {
  const audio = contexte();
  if (!audio || !bus) return { regle: () => {}, arrete: () => {} };

  const src = audio.createBufferSource();
  src.buffer = tamponBruit(audio);
  src.loop = true;
  const f = audio.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 160;
  const volume = audio.createGain();
  volume.gain.value = 0.0001;
  src.connect(f).connect(volume).connect(bus);
  src.start(audio.currentTime, Math.random());

  let arrete = false;
  return {
    regle(intensite) {
      if (arrete) return;
      const i = Math.min(1, Math.max(0, intensite));
      const t = audio.currentTime;
      volume.gain.setTargetAtTime(0.05 + 0.3 * i, t, 0.08);
      // Une grosse boule gronde plus bas.
      f.frequency.setTargetAtTime(320 - 170 * i, t, 0.08);
    },
    arrete() {
      if (arrete) return;
      arrete = true;
      const t = audio.currentTime;
      volume.gain.setTargetAtTime(0.0001, t, 0.05);
      src.stop(t + 0.4);
    },
  };
}

/** Le départ : un coup de sifflet qui monte. */
export function sonDepart(): void {
  const audio = contexte();
  if (!audio || !bus) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620, t);
  osc.frequency.exponentialRampToValueAtTime(1240, t + 0.22);
  const volume = audio.createGain();
  volume.gain.setValueAtTime(0.0001, t);
  volume.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
  volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(volume).connect(bus);
  osc.start(t);
  osc.stop(t + 0.35);
}

/** Une bosse : la boule passe sur un obstacle, sourdement. */
export function sonBosse(grosseur: number): void {
  const audio = contexte();
  if (!audio) return;
  const t = audio.currentTime;
  note(120 - 45 * grosseur, t, 0.16, 0.35, 'sine');
  bouffee(t, 0.12, 0.12, 'lowpass', 500);
}

/** La chute : un choc sourd, puis la neige qui s'éparpille. */
export function sonFracas(): void {
  const audio = contexte();
  if (!audio) return;
  const t = audio.currentTime;
  note(70, t, 0.4, 0.7, 'sine');
  bouffee(t, 0.18, 0.6, 'lowpass', 900);
  bouffee(t + 0.04, 0.7, 0.3, 'highpass', 2200);
}

/** La victoire : des grelots qui montent. */
export function sonGrelots(): void {
  const audio = contexte();
  if (!audio) return;
  const t = audio.currentTime;
  const gamme = [1318.5, 1568, 1760, 2093, 2637];
  gamme.forEach((f, i) => {
    const quand = t + i * 0.11;
    note(f, quand, 0.5, 0.2, 'sine');
    // L'harmonique qui fait le métal du grelot.
    note(f * 2.76, quand, 0.22, 0.06, 'sine');
    bouffee(quand, 0.05, 0.05, 'highpass', 6000);
  });
  note(2093, t + 0.62, 0.9, 0.18, 'sine');
  note(2637, t + 0.62, 0.9, 0.14, 'sine');
}

/** La défaite : deux notes qui descendent. */
export function sonDefaite(): void {
  const audio = contexte();
  if (!audio) return;
  const t = audio.currentTime;
  note(392, t, 0.35, 0.22, 'triangle');
  note(293.7, t + 0.22, 0.6, 0.22, 'triangle');
}
