import { describe, expect, it } from 'vitest';
import {
  correspond,
  distance,
  normalise,
  sansTagClan,
  SEUIL_CONFIANCE,
  type JoueurConnu,
} from '@/lib/domain/correspondance';

const JOUEURS: JoueurConnu[] = [
  { id: 'a', pseudo: 'Cristal', activisionId: 'CristalWZ#1234567', twitchLogin: 'cristal_tv' },
  { id: 'b', pseudo: 'Boreal', activisionId: null, twitchLogin: 'boreal' },
  { id: 'c', pseudo: 'MiKaa', activisionId: '_MiKaa', twitchLogin: null },
];

describe('sansTagClan', () => {
  it('retire la marque de clan et le tiret bas qui la suit', () => {
    expect(sansTagClan('[VI]LD')).toBe('LD');
    expect(sansTagClan('[7]_MiKaa')).toBe('MiKaa');
    expect(sansTagClan('Boreal')).toBe('Boreal');
  });
});

describe('normalise', () => {
  it('ramène tout à des minuscules alphanumériques, sans suffixe', () => {
    expect(normalise('CristalWZ#1234567')).toBe('cristalwz');
    expect(normalise('[TAG] Éléa_99')).toBe('elea99');
  });
});

describe('distance', () => {
  it('compte les éditions', () => {
    expect(distance('', 'abc')).toBe(3);
    expect(distance('kitten', 'sitting')).toBe(3);
    expect(distance('same', 'same')).toBe(0);
  });
});

describe('correspond', () => {
  it('trouve le joueur par son pseudo Activision, tag de clan compris', () => {
    expect(correspond('[VI]CristalWZ', JOUEURS)).toEqual({ joueurId: 'a', confiance: 1 });
  });

  it('tolère une lettre mal lue', () => {
    const r = correspond('Boreai', JOUEURS);
    expect(r.joueurId).toBe('b');
    expect(r.confiance).toBeGreaterThanOrEqual(SEUIL_CONFIANCE);
  });

  it('retrouve le pseudo derrière le tiret bas et le tag', () => {
    expect(correspond('[7]_MiKaa', JOUEURS).joueurId).toBe('c');
  });

  it('ne propose personne quand rien ne ressemble', () => {
    expect(correspond('Lriaa', JOUEURS)).toEqual({ joueurId: null, confiance: expect.any(Number) });
    expect(correspond('Lriaa', JOUEURS).confiance).toBeLessThan(SEUIL_CONFIANCE);
  });

  it('ne plante pas sur un nom vide', () => {
    expect(correspond('   ', JOUEURS)).toEqual({ joueurId: null, confiance: 0 });
  });
});
