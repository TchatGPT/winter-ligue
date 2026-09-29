import { describe, expect, it } from 'vitest';
import {
  gagnantEchange,
  joueDuel,
  manchesAGagner,
  MANCHES_POSSIBLES,
  PUISSANCE_MAX,
  score,
} from '@/lib/domain/bataille';

/**
 * Ce qui verrouille le duel de flocons.
 *
 * Un duel verse toute une mise à l'un et la retire à l'autre : la règle doit
 * être lisible, reproductible, et ne favoriser aucun camp.
 */

/** Un générateur déterministe, pour que les duels soient reproductibles. */
function mulberry32(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une suite de lancers écrite à l'avance. */
function suite(...puissances: number[]): () => number {
  let i = 0;
  return () => puissances[i++];
}

describe('gagnantEchange', () => {
  it('donne la manche au lancer le plus fort, et rien sur une égalité', () => {
    expect(gagnantEchange({ hote: 80, adversaire: 12 })).toBe('hote');
    expect(gagnantEchange({ hote: 3, adversaire: 99 })).toBe('adversaire');
    expect(gagnantEchange({ hote: 50, adversaire: 50 })).toBeNull();
  });
});

describe('manchesAGagner', () => {
  it('demande la majorité', () => {
    expect([1, 3, 5].map(manchesAGagner)).toEqual([1, 2, 3]);
  });

  it('ne laisse créer que des duels en une manche', () => {
    expect([...MANCHES_POSSIBLES]).toEqual([1]);
  });
});

describe('joueDuel', () => {
  it('s’arrête dès qu’un camp a la majorité', () => {
    // 3 manches : l'hôte gagne les deux premières, la troisième n'a pas lieu.
    const { echanges, vainqueur } = joueDuel(3, suite(90, 10, 70, 20, 5, 95));
    expect(echanges).toHaveLength(2);
    expect(vainqueur).toBe('hote');
    expect(score(echanges)).toEqual({ hote: 2, adversaire: 0 });
  });

  it('rejoue les égalités sans les compter', () => {
    const { echanges, vainqueur } = joueDuel(1, suite(40, 40, 12, 60));
    expect(echanges).toHaveLength(2);
    expect(vainqueur).toBe('adversaire');
    expect(score(echanges)).toEqual({ hote: 0, adversaire: 1 });
  });

  it('va jusqu’à la manche décisive', () => {
    const { echanges, vainqueur } = joueDuel(5, suite(60, 50, 10, 90, 70, 20, 5, 80, 99, 1));
    expect(echanges).toHaveLength(5);
    expect(score(echanges)).toEqual({ hote: 3, adversaire: 2 });
    expect(vainqueur).toBe('hote');
  });

  it('ne favorise aucun camp : environ une victoire sur deux', () => {
    const hasard = mulberry32(2026);
    const lance = () => Math.floor(hasard() * PUISSANCE_MAX) + 1;
    let hote = 0;
    const essais = 20_000;
    for (let i = 0; i < essais; i += 1) {
      if (joueDuel(3, lance).vainqueur === 'hote') hote += 1;
    }
    expect(hote / essais).toBeGreaterThan(0.48);
    expect(hote / essais).toBeLessThan(0.52);
  });

  it('tranche au lieu de boucler si les égalités ne cessent pas', () => {
    const { vainqueur, echanges } = joueDuel(1, () => 50, () => true);
    expect(vainqueur).toBe('hote');
    expect(echanges.length).toBeLessThanOrEqual(60);
  });
});
