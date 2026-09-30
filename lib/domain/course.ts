/**
 * La course du duel : deux pères Noël poussent chacun une boule de neige qui
 * grossit, et le premier qui tombe a perdu.
 *
 * Module **pur**. Il ne décide de rien : le vainqueur est tiré par le serveur
 * (`lib/domain/bataille.ts`), et on le lui donne. Il écrit seulement la façon
 * dont la course se raconte — qui mène, quand, sur quoi le perdant tombe — à
 * partir de l'identifiant du duel. Même duel, même course : revoir un duel
 * montre exactement ce qu'on a vu la première fois.
 *
 * ## Le suspense
 *
 * L'ancienne arène montrait deux jauges : on savait qui gagnait avant que la
 * boule parte. Ici rien ne l'annonce :
 *
 *  - les deux couloirs portent le même nombre d'obstacles, et celui qui fait
 *    tomber ressemble aux autres ;
 *  - les allures ondulent, la tête change de camp en route ;
 *  - une fois sur deux, c'est celui qui **menait** qui tombe ;
 *  - la chute arrive tard, dans le dernier tiers de la course.
 *
 * ## Pas toujours la même fin
 *
 * La façon de perdre est tirée, elle aussi : percuter un obstacle, glisser sur
 * la glace, voir sa boule éclater, se faire écraser par sa propre boule, s'asseoir
 * à bout de souffle — ou aller jusqu'au bout et, battu d'un rien, se prendre la
 * boule de neige du vainqueur en pleine face. Et le vainqueur ne fête pas
 * toujours de la même façon : il saute, il danse, ou il grimpe sur sa boule. Le vainqueur, lui, ne change pas : c'est le serveur qui l'a tiré.
 */

import type { Camp } from './bataille';

/**
 * Ce qui fait perdre le perdant.
 *
 *  - `rocher` : il percute une souche ou un rocher ;
 *  - `glisse` : il glisse sur une plaque de glace ;
 *  - `eclate` : sa boule éclate toute seule ;
 *  - `ecrase` : sa boule, trop grosse, lui roule dessus ;
 *  - `essouffle` : il s'assoit dans la neige, à bout de souffle ;
 *  - `boule` : il va jusqu'au bout, battu d'un rien, et le vainqueur, la ligne
 *    passée, se retourne et lui envoie une boule de neige en pleine face.
 */
export type Chute = 'rocher' | 'glisse' | 'eclate' | 'ecrase' | 'essouffle' | 'boule';

/** Comment le vainqueur fête sa victoire, la ligne passée : il saute, il danse, ou il grimpe sur sa boule. */
export type Fete = 'saute' | 'danse' | 'grimpe';

/** Les issues et leur poids : la boule de neige en pleine face, une fois sur quatre. */
const ISSUES: readonly [Chute, number][] = [
  ['rocher', 16],
  ['glisse', 15],
  ['eclate', 14],
  ['ecrase', 15],
  ['essouffle', 15],
  ['boule', 25],
];

const FETES: readonly [Fete, number][] = [
  ['saute', 40],
  ['danse', 35],
  ['grimpe', 25],
];

/** Tire une valeur selon ses poids, avec un nombre de 0 à 1. */
function pioche<T>(poids: readonly [T, number][], r: number): T {
  const total = poids.reduce((s, [, w]) => s + w, 0);
  let reste = r * total;
  for (const [valeur, w] of poids) {
    if (reste < w) return valeur;
    reste -= w;
  }
  return poids[poids.length - 1][0];
}

export type GenreObstacle = 'rocher' | 'souche' | 'glace';

export interface Obstacle {
  /** Où il se trouve, en avancée du couloir : de 0 (départ) à 1 (arrivée). */
  position: number;
  genre: GenreObstacle;
}

/** L'allure d'un camp : une avancée régulière, plus une ondulation. */
export interface Allure {
  amplitude: number;
  frequence: number;
  phase: number;
  /** Au-dessus de 1, le camp aurait passé la ligne le premier. */
  elan: number;
}

export interface Couloir {
  allure: Allure;
  obstacles: Obstacle[];
}

export interface Course {
  vainqueur: Camp;
  perdant: Camp;
  chute: {
    type: Chute;
    /**
     * L'instant où le perdant s'arrête, de 0 à 1 sur la durée de la course.
     * Vaut 1 pour la boule de neige : il court jusqu'au bout, et c'est après
     * la ligne, une fois touché, qu'il tombe.
     */
    instant: number;
    /** L'avancée du perdant à cet instant. */
    position: number;
    /** Vrai si le perdant menait quand il est tombé. */
    enTete: boolean;
  };
  /** La façon dont le vainqueur fête sa victoire. */
  fete: Fete;
  couloirs: Record<Camp, Couloir>;
}

export const OBSTACLES_PAR_COULOIR = 4;
/** La chute tombe dans cette fenêtre : assez tard pour qu'on y ait cru. */
export const CHUTE_AU_PLUS_TOT = 0.68;
export const CHUTE_AU_PLUS_TARD = 0.88;
/** Deux obstacles ne se touchent pas : on doit les voir venir un par un. */
export const ECART_OBSTACLES = 0.13;

/** Un tirage déterministe (mulberry32), semé par une chaîne. */
function tirage(graine: string): () => number {
  let h = 1779033703 ^ graine.length;
  for (const c of graine) {
    h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** L'avancée sans élan : part de 0, arrive à 1, ne recule jamais. */
function base(a: Allure, u: number): number {
  const w = 2 * Math.PI * a.frequence;
  const onde = (x: number) => (a.amplitude / w) * (Math.sin(w * x + a.phase) - Math.sin(a.phase));
  return u + onde(u) - u * onde(1);
}

/** L'avancée d'un camp à l'instant `u` (0 à 1), bornée au couloir. */
export function avancee(allure: Allure, u: number): number {
  const borne = Math.min(1, Math.max(0, u));
  return Math.min(1, Math.max(0, allure.elan * base(allure, borne)));
}

const autre = (camp: Camp): Camp => (camp === 'hote' ? 'adversaire' : 'hote');

/** Écrit la course d'un duel dont on connaît le vainqueur. */
export function ecritCourse(graine: string, vainqueur: Camp): Course {
  const rnd = tirage(`course:${graine}`);
  const entre = (a: number, b: number) => a + (b - a) * rnd();
  const perdant = autre(vainqueur);

  const allure = (): Allure => ({
    amplitude: entre(0.28, 0.45),
    frequence: entre(1.2, 2.2),
    phase: entre(0, 2 * Math.PI),
    elan: 1,
  });
  const duVainqueur = allure();
  const duPerdant = allure();

  const type = pioche(ISSUES, rnd());

  let instant: number;
  let position: number;
  if (type === 'boule') {
    // Il court jusqu'au bout, et passe la ligne juste après l'autre — de quoi
    // y croire jusqu'à la boule de neige.
    instant = 1;
    duPerdant.elan = entre(0.86, 0.95);
    position = avancee(duPerdant, 1);
  } else {
    // La chute : tard, et une fois sur deux pour celui qui menait.
    instant = entre(CHUTE_AU_PLUS_TOT, CHUTE_AU_PLUS_TARD);
    const enTete = rnd() < 0.5;
    const ecart = entre(0.03, 0.08) * (enTete ? 1 : -1);
    const vise = Math.min(0.9, Math.max(0.4, avancee(duVainqueur, instant) + ecart));
    duPerdant.elan = vise / base(duPerdant, instant);
    position = avancee(duPerdant, instant);
  }

  const genres: GenreObstacle[] = ['rocher', 'souche', 'glace'];
  const obstacles = (fatal: Obstacle | null, libre: number | null): Obstacle[] => {
    // `libre` : un endroit à laisser dégagé — là où la boule éclate toute seule.
    const occupes = libre === null ? [] : [libre];
    const genre = () => genres[Math.floor(rnd() * genres.length)];
    const tient = (poses: Obstacle[], p: number) =>
      ![...poses.map((o) => o.position), ...occupes].some((q) => Math.abs(q - p) < ECART_OBSTACLES);

    // Des poses au hasard ; si elles se gênent au point de ne plus tenir à
    // quatre, on recommence la série.
    for (let serie = 0; serie < 40; serie += 1) {
      const poses: Obstacle[] = fatal ? [fatal] : [];
      for (let essai = 0; essai < 60 && poses.length < OBSTACLES_PAR_COULOIR; essai += 1) {
        const p = entre(0.14, 0.93);
        if (tient(poses, p)) poses.push({ position: p, genre: genre() });
      }
      if (poses.length === OBSTACLES_PAR_COULOIR) return poses.sort((a, b) => a.position - b.position);
    }

    // Le filet : on range de gauche à droite, au plus serré. Ça tient toujours.
    const poses: Obstacle[] = fatal ? [fatal] : [];
    for (let p = 0.14; p <= 0.93 && poses.length < OBSTACLES_PAR_COULOIR; p += 0.01) {
      if (tient(poses, p)) poses.push({ position: p, genre: genre() });
    }
    return poses.sort((a, b) => a.position - b.position);
  };

  // Un obstacle là où il tombe, s'il tombe sur un obstacle ; sinon l'endroit
  // reste dégagé — on doit voir que rien ne l'a fait trébucher.
  const fatal: Obstacle | null =
    type === 'rocher' || type === 'glisse'
      ? { position, genre: type === 'glisse' ? 'glace' : rnd() < 0.5 ? 'rocher' : 'souche' }
      : null;

  const couloirs = {
    [vainqueur]: { allure: duVainqueur, obstacles: obstacles(null, null) },
    [perdant]: { allure: duPerdant, obstacles: obstacles(fatal, fatal ? null : position) },
  } as Record<Camp, Couloir>;

  return {
    vainqueur,
    perdant,
    chute: { type, instant, position, enTete: type !== 'boule' && position > avancee(duVainqueur, instant) },
    fete: pioche(FETES, rnd()),
    couloirs,
  };
}

/** Qui mène à l'instant `u`, ou `null` si les deux sont au coude à coude. */
export function meneur(course: Course, u: number): Camp | null {
  const h = avancee(course.couloirs.hote.allure, u);
  const a = avancee(course.couloirs.adversaire.allure, u);
  if (Math.abs(h - a) < 0.015) return null;
  return h > a ? 'hote' : 'adversaire';
}
