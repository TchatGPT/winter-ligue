import { describe, expect, it } from 'vitest';
import { construitBande } from '@/lib/spin/bande';
import {
  avance,
  demiFenetre,
  departDeBande,
  DUREE,
  dureesEtalees,
  ETALEMENT,
  ETRANGLEMENT,
  imagesCles,
  imagesClesRelance,
  dureeRelance,
  PAUSE_RELANCE,
  RANG_JETON,
  RANG_RELANCE,
  TUILES_RELANCE,
  instant,
  instantsDesCrans,
  MARGE,
  COURBE_MESUREE,
  COURBE_SIMPLE,
  dureeDe,
  MODES,
  PARCOURS,
  PLAFOND,
  VISIBLES,
  RANG_GAGNANT,
  TUILES,
  vitesse,
} from '@/lib/spin/courbe';

/**
 * Ce qui verrouille le rail.
 *
 * Le ressenti d'une roulette ne se teste pas — il se regarde. Ce qui se teste,
 * et qui doit l'être, c'est ce sur quoi le ressenti repose : que la courbe passe
 * par les points relevés sur la vidéo, qu'elle ne dépasse pas le plafond de
 * vitesse, que son inverse soit bien son inverse — c'est lui qui rend le son
 * échantillon-précis — et que la bande couvre l'écran d'un bout à l'autre.
 *
 * Sans ces garde-fous, régler le ressenti revient à bouger des nombres à
 * l'aveugle, ce qui a déjà coûté trois retours de suite sur « trop rapide »
 * alors que la vraie cause était ailleurs.
 */

/**
 * Les allures en millisecondes, pour la courbe mesurée.
 *
 * MODES donne des fractions depuis qu'il y a deux courbes en concurrence :
 * « rapide » doit vouloir dire la même chose des deux côtés, alors qu'elles
 * n'ont pas la même durée nominale.
 */
const D = {
  normal: dureeDe(COURBE_MESUREE, 'normal'),
  rapide: dureeDe(COURBE_MESUREE, 'rapide'),
  turbo: dureeDe(COURBE_MESUREE, 'turbo'),
  immediat: dureeDe(COURBE_MESUREE, 'immediat'),
};

/** Un générateur déterministe, pour que la bande soit reproductible. */
function mulberry32(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('la courbe', () => {
  it('part de zéro et arrive exactement à un', () => {
    expect(avance(0)).toBe(0);
    expect(avance(DUREE)).toBe(1);
    // Sans normalisation, une exponentielle n'arrive jamais : la gagnante
    // s'immobiliserait à quelques dixièmes de tuile du repère.
    expect(avance(DUREE - 1)).toBeLessThan(1);
  });

  it('est strictement croissante', () => {
    let precedent = -1;
    for (let ms = 0; ms <= DUREE; ms += 10) {
      const valeur = avance(ms);
      expect(valeur).toBeGreaterThan(precedent);
      precedent = valeur;
    }
  });

  it('ne dépasse jamais le plafond de vitesse', () => {
    // C'est la contrainte sous laquelle ELAN et GLISSE ont été ajustés. Au-delà,
    // le rail avance de plus d'un item par image : ce n'est plus du mouvement,
    // c'est un stroboscope, et cela se lit comme du hachage autant que comme de
    // la vitesse excessive.
    for (let ms = 0; ms <= DUREE; ms += 5) {
      expect(vitesse(ms)).toBeLessThanOrEqual(PLAFOND);
    }
    // Et elle doit tout de même s'en approcher, sinon le départ est mou.
    expect(vitesse(0)).toBeGreaterThan(PLAFOND * 0.95);
  });

  it('décroît partout — aucun appât, la vidéo n’en contient pas', () => {
    for (let ms = 0; ms < DUREE; ms += 25) {
      expect(vitesse(ms + 25)).toBeLessThan(vitesse(ms));
    }
  });

  it('reproduit les huit vitesses relevées sur la vidéo', () => {
    /*
     * Relevé image par image, en items par seconde depuis le départ — **leurs**
     * items, sur un trajet de 37.
     *
     * La comparaison se fait donc en **fraction du trajet par seconde**, seule
     * grandeur qui survive au changement de taille des tuiles : nos cartes ne
     * sont pas leurs jetons, notre trajet n'est plus de 37 items, mais la forme
     * de la courbe doit être la même. Comparer des items par seconde à des items
     * par seconde reviendrait à exiger que nos cartes défilent aussi vite que
     * leurs jetons, ce qui ferait précisément le stroboscope qu'on évite.
     *
     * L'ajustement sous plafond tient à 20 % près ; l'ajustement libre faisait
     * mieux et partait à 145 items/s dans la demi-seconde qui n'avait pas été
     * mesurée.
     */
    const PARCOURS_MESURE = 37;
    const releve: [number, number][] = [
      [350, 35.0],
      [750, 14.4],
      [1150, 7.7],
      [1550, 5.3],
      [2150, 3.8],
      [2750, 2.4],
      [3550, 1.4],
      [4350, 0.5],
    ];
    for (const [ms, mesure] of releve) {
      const notre = vitesse(ms) / PARCOURS;
      const leur = mesure / PARCOURS_MESURE;
      expect(Math.abs(notre - leur) / leur).toBeLessThan(0.21);
    }
  });
});

describe('l’inverse de la courbe', () => {
  it('redonne le temps qu’on y a mis', () => {
    // C'est ce qui autorise la pré-programmation du son : si l'inverse dérivait,
    // les dents tomberaient à côté des franchissements qu'elles annoncent.
    for (let ms = 0; ms <= DUREE; ms += 37) {
      expect(instant(avance(ms))).toBeCloseTo(ms, 6);
    }
  });

  it('redonne l’avancement qu’on y a mis', () => {
    for (let k = 0; k <= 100; k += 1) {
      const part = k / 100;
      expect(avance(instant(part))).toBeCloseTo(part, 9);
    }
  });

  it('tient les bornes', () => {
    expect(instant(0)).toBe(0);
    expect(instant(1)).toBe(DUREE);
    expect(instant(-1)).toBe(0);
    expect(instant(2)).toBe(DUREE);
  });
});

describe('les dents du cliquet', () => {
  it('tombe une dent par item franchi, en allure normale', () => {
    const crans = instantsDesCrans(D.normal);
    expect(crans).toHaveLength(PARCOURS);
  });

  it('reste dans la course, et dans l’ordre', () => {
    for (const duree of [D.normal, D.rapide, D.turbo]) {
      const crans = instantsDesCrans(duree);
      expect(crans.length).toBeGreaterThan(0);
      expect(crans.length).toBeLessThanOrEqual(PARCOURS);
      expect(crans[0]).toBeGreaterThan(0);
      expect(crans[crans.length - 1]).toBeLessThanOrEqual(duree + 1e-6);
      for (let i = 1; i < crans.length; i += 1) {
        expect(crans[i]).toBeGreaterThan(crans[i - 1]);
      }
    }
  });

  it('n’émet jamais deux dents à moins de l’étranglement', () => {
    // En turbo le barème est comprimé de près de cinq fois : sans étranglement,
    // les premières dents tomberaient toutes les trois millisecondes et on
    // entendrait une mitraillette au lieu d'un mécanisme.
    for (const duree of Object.values(MODES)) {
      const crans = instantsDesCrans(duree);
      for (let i = 1; i < crans.length; i += 1) {
        expect(crans[i] - crans[i - 1]).toBeGreaterThanOrEqual(ETRANGLEMENT);
      }
    }
    expect(instantsDesCrans(D.turbo).length).toBeLessThan(PARCOURS);
  });

  it('ne fait aucun bruit quand il n’y a pas de course', () => {
    expect(instantsDesCrans(D.immediat)).toEqual([]);
  });
});

/*
 * La géométrie telle qu'elle tombe dans la colonne de contenu du site : 1 272 px
 * de large, cinq rouleaux, donc des colonnes de 254 px, des cartes de 214 sur 315,
 * un pas de 327 et une fenêtre de 523.
 */
const PAS = 327;
const FENETRE = VISIBLES * PAS;

describe('les images-clés', () => {
  const depart = departDeBande(FENETRE, PAS);
  const trajet = PARCOURS * PAS;
  const cles = imagesCles(depart, trajet);

  /** La position en px que porte une image-clé. */
  const positionDe = (cle: Keyframe): number =>
    Number(/translate3d\(0, (-?[\d.]+)px/.exec(String(cle.transform))![1]);

  it('translate sur Y : le rouleau descend', () => {
    // L'axe n'est écrit qu'ici dans tout le module. Une bande couchée était une
    // autre machine : la vidéo montre cinq colonnes verticales.
    expect(String(cles[0].transform)).toMatch(/^translate3d\(0, /);
  });

  it('couvre l’intervalle, dans l’ordre, sans doublon', () => {
    expect(cles[0].offset).toBe(0);
    expect(cles[cles.length - 1].offset).toBe(1);
    for (let i = 1; i < cles.length; i += 1) {
      expect(cles[i].offset!).toBeGreaterThan(cles[i - 1].offset!);
    }
  });

  it('part du départ et arrive à l’arrivée', () => {
    expect(positionDe(cles[0])).toBeCloseTo(depart, 1);
    expect(positionDe(cles[cles.length - 1])).toBeCloseTo(depart - trajet, 1);
  });

  it('approche la vraie courbe à moins d’un demi-pixel', () => {
    /*
     * Le navigateur interpole linéairement entre deux clés. On mesure donc
     * l'écart entre cette droite et la courbe réelle, au pire endroit.
     *
     * Ce test verrouille l'échantillonnage en carré : il donne 0,34 px sur un
     * trajet de 7 848. Un échantillonnage à temps égal en donnerait une dizaine,
     * à distance égale davantage encore — les deux passeraient inaperçus à la
     * lecture et se verraient à l'écran.
     */
    let pire = 0;
    for (let i = 0; i < cles.length - 1; i += 1) {
      const t0 = cles[i].offset! * DUREE;
      const t1 = cles[i + 1].offset! * DUREE;
      const x0 = positionDe(cles[i]);
      const x1 = positionDe(cles[i + 1]);
      for (let s = 1; s < 40; s += 1) {
        const part = s / 40;
        const droite = x0 + (x1 - x0) * part;
        const vraie = depart - avance(t0 + (t1 - t0) * part) * trajet;
        pire = Math.max(pire, Math.abs(droite - vraie));
      }
    }
    expect(pire).toBeLessThan(0.5);
  });
});

describe('la place du rouleau', () => {
  it('pose la gagnante pile sous le repère à l’arrivée', () => {
    // Le repère est au milieu ; le centre de la tuile de rang i est à
    // i·pas + pas/2 ; le rouleau a reculé de PARCOURS·pas.
    const centre =
      departDeBande(FENETRE, PAS) - PARCOURS * PAS + RANG_GAGNANT * PAS + PAS / 2;
    expect(centre).toBeCloseTo(FENETRE / 2, 9);
  });

  it('pose la tuile de marge sous le repère au départ', () => {
    const centre = departDeBande(FENETRE, PAS) + MARGE * PAS + PAS / 2;
    expect(centre).toBeCloseTo(FENETRE / 2, 9);
  });

  it('a du rouleau des deux côtés, du départ à l’arrivée', () => {
    // C'est à quoi sert la marge : sans elle on verrait le vide au bout du
    // rouleau, au premier comme au dernier instant. La fenêtre ne montrant que
    // 1,6 carte, trois tuiles de marge en laissent largement assez.
    const demi = demiFenetre(FENETRE, PAS);
    expect(demi).toBeCloseTo(VISIBLES / 2, 5);
    expect(demi).toBeLessThanOrEqual(MARGE);
    expect(RANG_GAGNANT + demi).toBeLessThanOrEqual(TUILES - 1);
  });
});

describe('les arrêts étalés', () => {
  it('donne une durée par rouleau, toutes distinctes', () => {
    const durees = dureesEtalees(5, D.normal, mulberry32(1));
    expect(durees).toHaveLength(5);
    expect(new Set(durees).size).toBe(5);
  });

  it('tient dans l’étalement mesuré, une demi-seconde', () => {
    const durees = dureesEtalees(5, D.normal, mulberry32(2));
    expect(Math.min(...durees)).toBe(D.normal);
    expect(Math.max(...durees)).toBeCloseTo(D.normal + ETALEMENT, 9);
  });

  it('comprime l’étalement avec l’allure', () => {
    // Une demi-seconde d'attente sur une course de 1,4 s, ce serait un tiers de
    // l'ouverture passé à regarder un rouleau tourner seul.
    const durees = dureesEtalees(5, D.turbo, mulberry32(3));
    const etendue = Math.max(...durees) - Math.min(...durees);
    expect(etendue).toBeCloseTo(ETALEMENT * (D.turbo / D.normal), 6);
  });

  it('ne suit pas l’ordre des colonnes', () => {
    // Relevé sur la vidéo : l'ordre des arrêts n'est pas celui de la mise en
    // page. Une cascade de gauche à droite se lit comme une vague, pas comme
    // cinq machines qui hésitent chacune pour soi.
    let croissants = 0;
    for (let graine = 0; graine < 40; graine += 1) {
      const durees = dureesEtalees(5, D.normal, mulberry32(graine));
      if (durees.every((d, i) => i === 0 || d > durees[i - 1])) croissants += 1;
    }
    expect(croissants).toBeLessThan(8);
  });

  it('laisse la course intacte en mode immédiat', () => {
    expect(dureesEtalees(5, D.immediat, mulberry32(1))).toEqual([0, 0, 0, 0, 0]);
    expect(dureesEtalees(0, D.normal, mulberry32(1))).toEqual([]);
  });

  it('ne change rien pour un rouleau seul', () => {
    expect(dureesEtalees(1, D.normal, mulberry32(1))).toEqual([D.normal]);
  });
});

/* -------------------------------------------------------------------------- */

interface Fausse {
  cardId: string;
  rarity: string;
}

const POOL: Fausse[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ cardId: `c${i}`, rarity: 'C' })),
  ...Array.from({ length: 5 }, (_, i) => ({ cardId: `pc${i}`, rarity: 'PC' })),
  ...Array.from({ length: 4 }, (_, i) => ({ cardId: `r${i}`, rarity: 'R' })),
  ...Array.from({ length: 3 }, (_, i) => ({ cardId: `l${i}`, rarity: 'L' })),
];

const POIDS = { C: 60000, PC: 30000, R: 9000, SR: 0, UR: 0, L: 1000 };

describe('la bande de leurres', () => {
  it('a la bonne longueur et la gagnante à sa place', () => {
    const gagnante = POOL[8];
    const bande = construitBande(POOL, gagnante, POIDS, mulberry32(1));
    expect(bande).toHaveLength(TUILES);
    expect(bande[RANG_GAGNANT]).toBe(gagnante);
  });

  it('ne répète pas une carte à moins de trois cases', () => {
    // Y compris autour de la gagnante : sans quoi la carte gagnée serait
    // précédée de son propre double, et l'arrêt se lirait mal.
    for (let graine = 0; graine < 40; graine += 1) {
      const bande = construitBande(POOL, POOL[0], POIDS, mulberry32(graine));
      for (let i = 1; i < bande.length; i += 1) {
        const proches = bande.slice(Math.max(0, i - 3), i).map((c) => c.cardId);
        expect(proches).not.toContain(bande[i].cardId);
      }
    }
  });

  it('suit les taux du booster, et non des taux gonflés', () => {
    /*
     * Le point n'est pas cosmétique. La plupart des sites du genre saupoudrent
     * la bande de légendaires pour faire monter la tension ; le joueur qui
     * compte les anneaux dorés qui passent en tire alors une idée fausse de ses
     * chances, sans aucun moyen de savoir qu'il se trompe.
     */
    const hasard = mulberry32(7);
    const comptes: Record<string, number> = { C: 0, PC: 0, R: 0, L: 0 };
    const tirages = 300;
    for (let n = 0; n < tirages; n += 1) {
      for (const tuile of construitBande(POOL, POOL[0], POIDS, hasard)) {
        comptes[tuile.rarity] += 1;
      }
    }
    // On retire la gagnante, imposée à chaque bande.
    comptes.C -= tirages;
    const total = tirages * (TUILES - 1);

    expect(comptes.C / total).toBeCloseTo(0.6, 1);
    expect(comptes.PC / total).toBeCloseTo(0.3, 1);
    expect(comptes.R / total).toBeCloseTo(0.09, 1);
    expect(comptes.L / total).toBeCloseTo(0.01, 2);
  });

  it('redistribue le poids d’une rareté que le pool ne peut pas servir', () => {
    // SR et UR pèsent ici, mais aucune carte ne les porte. Leur poids doit
    // sortir du tirage, et non rester à zéro en écrasant tout le reste.
    const poids = { C: 40000, PC: 20000, R: 5000, SR: 30000, UR: 4000, L: 1000 };
    const bande = construitBande(POOL, POOL[0], poids, mulberry32(3));
    expect(bande).toHaveLength(TUILES);
    expect(bande.every((c) => POOL.includes(c))).toBe(true);
  });

  it('est reproductible à générateur égal', () => {
    const a = construitBande(POOL, POOL[0], POIDS, mulberry32(42)).map((c) => c.cardId);
    const b = construitBande(POOL, POOL[0], POIDS, mulberry32(42)).map((c) => c.cardId);
    expect(a).toEqual(b);
  });

  it('survit à un pool d’une seule carte', () => {
    const solo = [POOL[0]];
    const bande = construitBande(solo, POOL[0], POIDS, mulberry32(5));
    expect(bande).toHaveLength(TUILES);
  });

  it('survit à un pool vide', () => {
    const bande = construitBande([], POOL[0], POIDS, mulberry32(5));
    expect(bande).toHaveLength(TUILES);
    expect(bande[RANG_GAGNANT]).toBe(POOL[0]);
  });
});

describe('les deux courbes en concurrence', () => {
  /*
   * Deux dépouillements de la même vidéo, deux lois différentes. Ces tests ne
   * disent pas laquelle est juste — ça se regarde, et le banc `/dev/rail`
   * bascule de l'une à l'autre. Ils vérifient que les deux sont utilisables :
   * bornes tenues, croissance stricte, inverse fidèle. C'est cet inverse qui
   * donne les dents du cliquet, et il doit valoir pour les deux.
   */
  for (const courbe of [COURBE_MESUREE, COURBE_SIMPLE]) {
    it(`${courbe.nom} : part de zéro et arrive exactement à un`, () => {
      expect(courbe.avance(0)).toBe(0);
      expect(courbe.avance(courbe.duree)).toBe(1);
      expect(courbe.avance(courbe.duree - 1)).toBeLessThan(1);
    });

    it(`${courbe.nom} : est strictement croissante`, () => {
      let precedent = -1;
      for (let ms = 0; ms <= courbe.duree; ms += 10) {
        const valeur = courbe.avance(ms);
        expect(valeur).toBeGreaterThan(precedent);
        precedent = valeur;
      }
    });

    it(`${courbe.nom} : son inverse redonne le temps qu’on y a mis`, () => {
      for (let ms = 0; ms <= courbe.duree; ms += 37) {
        expect(courbe.instant(courbe.avance(ms))).toBeCloseTo(ms, 6);
      }
    });

    it(`${courbe.nom} : donne des dents dans l’ordre et dans la course`, () => {
      const crans = instantsDesCrans(courbe.duree, courbe);
      expect(crans.length).toBeGreaterThan(0);
      expect(crans[crans.length - 1]).toBeLessThanOrEqual(courbe.duree + 1e-6);
      for (let i = 1; i < crans.length; i += 1) {
        expect(crans[i] - crans[i - 1]).toBeGreaterThanOrEqual(ETRANGLEMENT);
      }
    });
  }

  it('diverge là où ça se voit : la traîne', () => {
    /*
     * À la moitié du temps, la courbe mesurée a parcouru 96 % du chemin, la
     * simple 87 %. Neuf points d'écart, c'est-à-dire trois tuiles et demie de
     * plus à parcourir dans la seconde moitié pour la simple : elle rampe moins
     * longtemps, la mesurée traîne davantage.
     *
     * Ce test ne tranche pas, il **consigne** l'écart, pour que personne ne
     * croie que basculer d'une courbe à l'autre est un détail.
     */
    const miMesuree = COURBE_MESUREE.avance(COURBE_MESUREE.duree / 2);
    const miSimple = COURBE_SIMPLE.avance(COURBE_SIMPLE.duree / 2);
    expect(miMesuree).toBeGreaterThan(0.95);
    expect(miSimple).toBeLessThan(0.9);
    expect(miMesuree - miSimple).toBeGreaterThan(0.05);
  });
});

describe('la taille des tuiles et le trajet', () => {
  /*
   * Ce qui gouverne la lisibilité n'est pas le nombre d'items par seconde mais
   * le nombre de **hauteurs de fenêtre** par seconde. Ces deux tests verrouillent
   * la transposition : passer de jetons à des cartes change le nombre d'items,
   * jamais le mouvement qu'on voit.
   */
  const PARCOURS_MESURE = 37;
  const VISIBLES_MESURE = 2.4;

  it('parcourt le même nombre de hauteurs de fenêtre que la vidéo', () => {
    const leur = PARCOURS_MESURE / VISIBLES_MESURE;
    const notre = PARCOURS / VISIBLES;
    expect(Math.abs(notre - leur) / leur).toBeLessThan(0.05);
  });

  it('a la même pointe, en hauteurs de fenêtre par seconde', () => {
    // Chez eux : 60 items/s pour 2,4 visibles, soit 25 fenêtres/s. Au-delà, le
    // contenu change entièrement entre deux images — un stroboscope.
    const leur = 60 / VISIBLES_MESURE;
    const notre = vitesse(0) / VISIBLES;
    expect(notre).toBeLessThanOrEqual(leur);
    expect(notre).toBeGreaterThan(leur * 0.9);
  });

  it('garde la gagnante joignable depuis la fenêtre', () => {
    // La marge doit couvrir la demi-fenêtre, sinon on voit le vide au bout du
    // rouleau — au départ comme à l'arrivée.
    expect(VISIBLES / 2).toBeLessThanOrEqual(MARGE);
    expect(RANG_GAGNANT + VISIBLES / 2).toBeLessThanOrEqual(TUILES - 1);
  });
});

describe('la bande relancée par le jeton', () => {
  const JETON: Fausse = { cardId: 'winter-spin', rarity: 'L' };

  it('porte les deux courses bout à bout', () => {
    const bande = construitBande(POOL, POOL[0], POIDS, mulberry32(1), {
      jeton: JETON,
      relance: true,
    });
    expect(bande).toHaveLength(TUILES_RELANCE);
    // Le jeton là où la première course s'arrête, la vraie gagnante là où
    // s'arrête la seconde.
    expect(bande[RANG_JETON]).toBe(JETON);
    expect(bande[RANG_RELANCE]).toBe(POOL[0]);
  });

  it('sème le jeton en leurre, sans jamais frôler un arrêt', () => {
    /*
     * L'appât doit se voir passer, sinon personne ne le reconnaît le jour où il
     * s'arrête. Mais un jeton à une case du repère juste avant la carte gagnée
     * ferait croire à une relance manquée — l'inverse de l'effet voulu.
     */
    let vus = 0;
    for (let graine = 0; graine < 30; graine += 1) {
      const bande = construitBande(POOL, POOL[0], POIDS, mulberry32(graine), { jeton: JETON });
      bande.forEach((tuile, i) => {
        if (tuile !== JETON) return;
        vus += 1;
        expect(Math.abs(i - RANG_GAGNANT)).toBeGreaterThan(3);
      });
    }
    expect(vus).toBeGreaterThan(0);
  });

  it('ne montre aucun jeton quand on ne lui en donne pas', () => {
    const bande = construitBande(POOL, POOL[0], POIDS, mulberry32(4));
    expect(bande.some((t) => t.cardId === 'winter-spin')).toBe(false);
    expect(bande).toHaveLength(TUILES);
  });
});

describe('les images-clés d’une relance', () => {
  const depart = departDeBande(FENETRE, PAS);
  const trajet = PARCOURS * PAS;
  const duree = dureeDe(COURBE_MESUREE, 'normal');
  const cles = imagesClesRelance(depart, trajet, duree);

  const positionDe = (cle: Keyframe): number =>
    Number(/translate3d\(0, (-?[\d.]+)px/.exec(String(cle.transform))![1]);

  it('dure deux courses et la pause', () => {
    expect(dureeRelance(duree)).toBe(duree * 2 + PAUSE_RELANCE);
    expect(dureeRelance(0)).toBe(0);
  });

  it('couvre l’intervalle dans l’ordre, sans doublon', () => {
    expect(cles[0].offset).toBe(0);
    expect(cles[cles.length - 1].offset).toBeCloseTo(1, 9);
    for (let i = 1; i < cles.length; i += 1) {
      expect(cles[i].offset!).toBeGreaterThan(cles[i - 1].offset!);
    }
  });

  it('s’immobilise sur le jeton pendant toute la pause', () => {
    /*
     * Le palier n'est pas décoratif : sans lui, l'interpolation linéaire entre
     * la dernière clé du premier acte et la première du second ferait glisser le
     * rouleau pendant toute la pause au lieu de l'arrêter.
     */
    const total = dureeRelance(duree);
    const finActe = duree / total;
    const reprise = (duree + PAUSE_RELANCE) / total;
    const arret = cles.filter((c) => c.offset! >= finActe && c.offset! <= reprise);
    expect(arret.length).toBeGreaterThanOrEqual(2);
    for (const cle of arret) expect(positionDe(cle)).toBeCloseTo(depart - trajet, 1);
  });

  it('parcourt exactement deux trajets', () => {
    expect(positionDe(cles[0])).toBeCloseTo(depart, 1);
    expect(positionDe(cles[cles.length - 1])).toBeCloseTo(depart - 2 * trajet, 1);
  });
});
