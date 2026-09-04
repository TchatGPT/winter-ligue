import { describe, expect, it } from 'vitest';
import {
  MANCHES_MAX,
  MANCHES_MIN,
  meilleureCarte,
  scoreCamp,
  vainqueur,
  valeurCarte,
} from '@/lib/domain/bataille';

/**
 * Ce qui verrouille les batailles.
 *
 * Une bataille attribue des cartes à quelqu'un et les retire à un autre. La
 * règle qui décide doit donc être lisible, reproductible, et incapable de
 * favoriser un camp sans qu'on s'en aperçoive — d'où ces tests, qui portent sur
 * la seule fonction qui tranche.
 */

/** Un générateur déterministe, pour que le départage soit reproductible. */
function mulberry32(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('la valeur d’une carte', () => {
  it('monte avec la rareté, de un à six', () => {
    expect(valeurCarte('C')).toBe(1);
    expect(valeurCarte('PC')).toBe(2);
    expect(valeurCarte('R')).toBe(3);
    expect(valeurCarte('SR')).toBe(4);
    expect(valeurCarte('UR')).toBe(5);
    expect(valeurCarte('L')).toBe(6);
  });

  it('ne vaut jamais zéro, même pour une rareté inconnue', () => {
    // Une carte dont la rareté ne serait pas reconnue compte quand même : la
    // faire valoir zéro reviendrait à la retirer du décompte en silence.
    expect(valeurCarte('???')).toBe(1);
  });

  it('additionne sans surprise', () => {
    expect(scoreCamp(['C', 'C', 'C'])).toBe(3);
    expect(scoreCamp(['L', 'C'])).toBe(7);
    expect(scoreCamp([])).toBe(0);
  });

  it('retient la plus haute pour le départage', () => {
    expect(meilleureCarte(['C', 'SR', 'PC'])).toBe(4);
    expect(meilleureCarte([])).toBe(0);
  });
});

describe('le vainqueur', () => {
  it('est celui qui totalise le plus', () => {
    const gagne = vainqueur([{ raretes: ['C', 'C'] }, { raretes: ['R', 'C'] }], mulberry32(1));
    expect(gagne).toBe(1);
  });

  it('à somme égale, la plus haute carte tranche', () => {
    /*
     * Six peu communes contre une légendaire entourée de communes : même somme,
     * et c'est la légendaire qu'on a envie de voir gagner. Sans ce second
     * critère, le camp le plus régulier l'emporterait toujours sur le coup
     * d'éclat, ce qui est le contraire de l'effet recherché.
     */
    const regulier = { raretes: ['PC', 'PC', 'PC', 'PC', 'PC', 'PC'] }; // 12
    const eclat = { raretes: ['L', 'C', 'C', 'C', 'C', 'C', 'C'] }; // 12
    expect(scoreCamp(regulier.raretes)).toBe(scoreCamp(eclat.raretes));
    expect(vainqueur([regulier, eclat], mulberry32(1))).toBe(1);
  });

  it('à égalité parfaite, tire au sort — et ne favorise pas l’hôte', () => {
    /*
     * Faire gagner l'hôte serait plus simple à écrire, et donnerait un avantage
     * silencieux à celui qui crée la bataille. Sur mille égalités parfaites, les
     * deux camps doivent l'emporter à peu près autant.
     */
    const camps = [{ raretes: ['R', 'R'] }, { raretes: ['R', 'R'] }];
    const hasard = mulberry32(7);
    let hote = 0;
    for (let i = 0; i < 1000; i += 1) if (vainqueur(camps, hasard) === 0) hote += 1;
    expect(hote).toBeGreaterThan(400);
    expect(hote).toBeLessThan(600);
  });

  it('ne dépend pas de l’ordre des camps', () => {
    // Le même tirage doit donner le même vainqueur, qu'on présente l'hôte en
    // premier ou en second. Sans ça, l'ordre d'affichage changerait le résultat.
    const fort = { raretes: ['UR', 'PC'] };
    const faible = { raretes: ['C', 'C'] };
    expect(vainqueur([fort, faible], mulberry32(3))).toBe(0);
    expect(vainqueur([faible, fort], mulberry32(3))).toBe(1);
  });

  it('rend −1 quand il n’y a personne', () => {
    expect(vainqueur([], mulberry32(1))).toBe(-1);
  });
});

describe('les bornes d’une bataille', () => {
  it('vont de un à cinq sachets', () => {
    // Le plancher rend la bataille la plus courte possible accessible ; le
    // plafond est un plafond d'écran, pas de calcul — au-delà, les deux camps
    // ne tiennent plus ensemble dans une fenêtre.
    expect(MANCHES_MIN).toBe(1);
    expect(MANCHES_MAX).toBe(5);
    expect(MANCHES_MIN).toBeLessThan(MANCHES_MAX);
  });
});
