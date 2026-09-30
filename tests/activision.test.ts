import { describe, expect, it } from 'vitest';
import { activisionPris, cleActivision } from '@/lib/domain/activision';

describe('pseudo Activision', () => {
  it('compare sans suffixe, sans casse, sans accents', () => {
    expect(cleActivision('Givre#1234567')).toBe('givre');
    expect(cleActivision('  GIVRE ')).toBe('givre');
    expect(cleActivision('Boréal')).toBe(cleActivision('boreal'));
    expect(cleActivision('Nord   Kill')).toBe('nord kill');
  });

  it('refuse le nom d’un autre, pas le sien', () => {
    const joueurs = [
      { id: 'a', activisionId: 'Givre#1234567' },
      { id: 'b', activisionId: null },
    ];
    expect(activisionPris('givre#999', joueurs, 'b')).toBe(true);
    expect(activisionPris('Givre', joueurs, 'a')).toBe(false);
    expect(activisionPris('Stalagmite', joueurs, 'b')).toBe(false);
  });
});
