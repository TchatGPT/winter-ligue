import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { gameSchema, texteLibre } from '@/lib/api/schemas';

const ID = '3f2c9a1e-8b7d-4c6a-9e5f-1a2b3c4d5e6f';

describe('les textes libres', () => {
  it('perdent les caractères de contrôle et les inversions de sens', () => {
    const r = gameSchema.parse({
      playerId: ID,
      kills: 3,
      placement: null,
      note: 'Top\u202E3 truqué\u0007 ',
    });
    expect(r.note).toBe('Top3 truqué');
  });

  it('restent vides une fois vidés de leurs invisibles : un texte obligatoire le reste', () => {
    const obligatoire = texteLibre(140).pipe(z.string().min(1));
    expect(obligatoire.safeParse('\u200B\u202E ').success).toBe(false);
    expect(obligatoire.parse('Lot du samedi')).toBe('Lot du samedi');
  });

  it('restent bornés en longueur', () => {
    expect(texteLibre(140).safeParse('x'.repeat(141)).success).toBe(false);
  });
});
