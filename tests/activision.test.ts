import { describe, expect, it } from 'vitest';
import { activisionPris, cleActivision, sansSuffixeActivision } from '@/lib/domain/activision';
import { monActivisionSchema } from '@/lib/api/schemas';

describe('pseudo Activision', () => {
  it('compare sans suffixe, sans casse, sans accents', () => {
    expect(cleActivision('Givre#1234567')).toBe('givre');
    expect(cleActivision('  GIVRE ')).toBe('givre');
    expect(cleActivision('Boréal')).toBe(cleActivision('boreal'));
    expect(cleActivision('Nord   Kill')).toBe('nord kill');
  });

  it('s’enregistre sans le « #1234567 » : les captures ne le montrent pas (17/11/2026)', () => {
    expect(sansSuffixeActivision('Givre#1234567')).toBe('Givre');
    expect(sansSuffixeActivision('Givre #1234567 ')).toBe('Givre');
    expect(sansSuffixeActivision('Givre#')).toBe('Givre');
    expect(sansSuffixeActivision('Gi#vre')).toBe('Gi#vre');
    expect(monActivisionSchema.parse({ activisionId: 'Jex3#4815162' }).activisionId).toBe('Jex3');
    expect(monActivisionSchema.safeParse({ activisionId: '#4815162' }).success).toBe(false);
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
