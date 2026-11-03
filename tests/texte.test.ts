import { describe, expect, it } from 'vitest';
import { CARDS, resumeEffet } from '@/lib/domain/catalog';
import { memeTexte, pourChercher } from '@/lib/domain/texte';

describe('deux textes qui disent la même chose', () => {
  it('ignore la casse, les espaces et le signe moins typographique', () => {
    expect(memeTexte('Game ×1,2', 'game ×1,2')).toBe(true);
    expect(memeTexte('−4 pts', '-4 pts')).toBe(true);
    expect(memeTexte('+10 flocons', '+10 ❄')).toBe(false);
    expect(memeTexte(null, '')).toBe(true);
  });

  it('reconnaît l’intitulé et le résumé de Vent Porteur comme un seul texte', () => {
    const vent = CARDS.find((c) => c.id === 'vent-porteur')!;
    expect(memeTexte(vent.subtitle, resumeEffet(vent.effect))).toBe(true);
  });
});

describe('chercher un pseudo', () => {
  const trouve = (pseudo: string, tape: string) => pourChercher(pseudo).includes(pourChercher(tape));

  it('ignore accents et casse', () => {
    expect(trouve('Boréal', 'boreal')).toBe(true);
    expect(trouve('Queen_Ludi', 'queen')).toBe(true);
  });

  it('confond les lettres qu’une police confond : I et l, O et 0', () => {
    expect(trouve('AIessandroPeps', 'Ales')).toBe(true);
    expect(trouve('AlessandroPeps', 'AIes')).toBe(true);
    expect(trouve('Old_Br0ther', 'brother')).toBe(true);
  });

  it('ne trouve pas ce qui ne correspond pas', () => {
    expect(trouve('thomaschatpi', 'queen')).toBe(false);
  });
});
