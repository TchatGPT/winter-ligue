import { describe, expect, it } from 'vitest';
import type { Camp } from '@/lib/domain/bataille';
import {
  avancee,
  CHUTE_AU_PLUS_TARD,
  CHUTE_AU_PLUS_TOT,
  ECART_OBSTACLES,
  ecritCourse,
  meneur,
  OBSTACLES_PAR_COULOIR,
} from '@/lib/domain/course';

/**
 * Ce qui verrouille la course du duel.
 *
 * Elle ne décide de rien — le vainqueur vient du serveur — mais elle doit le
 * respecter, être la même à chaque visionnage, et ne pas le trahir d'avance.
 */

const graines = Array.from({ length: 400 }, (_, i) => `duel-${i}`);
const camps: Camp[] = ['hote', 'adversaire'];

describe('ecritCourse', () => {
  it('respecte le vainqueur tiré par le serveur', () => {
    for (const graine of graines) {
      for (const vainqueur of camps) {
        const c = ecritCourse(graine, vainqueur);
        expect(c.vainqueur).toBe(vainqueur);
        expect(c.perdant).not.toBe(vainqueur);
        // Le vainqueur passe la ligne ; le perdant tombe avant.
        expect(avancee(c.couloirs[vainqueur].allure, 1)).toBeCloseTo(1, 6);
        expect(c.chute.position).toBeLessThanOrEqual(0.9 + 1e-9);
      }
    }
  });

  it('raconte la même course à chaque fois', () => {
    expect(ecritCourse('abc', 'hote')).toEqual(ecritCourse('abc', 'hote'));
    expect(ecritCourse('abc', 'hote')).not.toEqual(ecritCourse('abd', 'hote'));
  });

  it('fait tomber le perdant tard, dans la fenêtre prévue', () => {
    for (const graine of graines) {
      const { chute } = ecritCourse(graine, 'hote');
      expect(chute.instant).toBeGreaterThanOrEqual(CHUTE_AU_PLUS_TOT);
      expect(chute.instant).toBeLessThanOrEqual(CHUTE_AU_PLUS_TARD);
      expect(chute.position).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('n’avance qu’en avant', () => {
    for (const graine of graines.slice(0, 80)) {
      const c = ecritCourse(graine, 'adversaire');
      for (const camp of camps) {
        let avant = 0;
        for (let i = 1; i <= 200; i += 1) {
          const p = avancee(c.couloirs[camp].allure, i / 200);
          expect(p).toBeGreaterThanOrEqual(avant);
          avant = p;
        }
      }
    }
  });
});

describe('le suspense', () => {
  it('pose autant d’obstacles dans les deux couloirs, bien séparés', () => {
    for (const graine of graines) {
      const c = ecritCourse(graine, 'hote');
      for (const camp of camps) {
        const positions = c.couloirs[camp].obstacles.map((o) => o.position);
        expect(positions).toHaveLength(OBSTACLES_PAR_COULOIR);
        for (let i = 1; i < positions.length; i += 1) {
          expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(ECART_OBSTACLES - 1e-9);
        }
      }
    }
  });

  it('met un obstacle là où le perdant tombe, sauf quand sa boule éclate', () => {
    for (const graine of graines) {
      const c = ecritCourse(graine, 'hote');
      const positions = c.couloirs[c.perdant].obstacles.map((o) => o.position);
      const dessus = positions.some((p) => Math.abs(p - c.chute.position) < 1e-9);
      if (c.chute.type === 'eclate') {
        expect(positions.every((p) => Math.abs(p - c.chute.position) >= ECART_OBSTACLES - 1e-9)).toBe(true);
      } else {
        expect(dessus).toBe(true);
      }
    }
  });

  it('fait tomber celui qui menait à peu près une fois sur deux', () => {
    const enTete = graines.filter((g) => ecritCourse(g, 'hote').chute.enTete).length;
    expect(enTete / graines.length).toBeGreaterThan(0.38);
    expect(enTete / graines.length).toBeLessThan(0.62);
  });

  it('ne donne pas toujours la tête au futur vainqueur à mi-course', () => {
    const vainqueurDevant = graines.filter((g) => meneur(ecritCourse(g, 'hote'), 0.5) === 'hote').length;
    expect(vainqueurDevant / graines.length).toBeLessThan(0.8);
    expect(vainqueurDevant / graines.length).toBeGreaterThan(0.2);
  });

  it('tire les trois chutes', () => {
    const vues = new Set(graines.map((g) => ecritCourse(g, 'hote').chute.type));
    expect([...vues].sort()).toEqual(['eclate', 'glisse', 'rocher']);
  });
});
