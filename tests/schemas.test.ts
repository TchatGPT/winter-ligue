import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { activisionId, gameSchema, texteLibre } from '@/lib/api/schemas';

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

describe('le pseudo en jeu', () => {
  it('accepte tout ce qui se voit : symboles, katakana, dièse, un seul caractère', () => {
    for (const p of ['」モモメヨ', '★Givre★', 'xX_Dark#Angel_Xx', 'Givre#1234567', 'Ω', 'Le Pingouin (FR)']) {
      expect(activisionId.parse(p)).toBe(p);
    }
  });

  it('perd ses caractères invisibles et ses espaces autour, rien d’autre', () => {
    expect(activisionId.parse('  モモ\u202Eメヨ\u200B ')).toBe('モモメヨ');
  });

  it('refuse un pseudo vide, ou fait seulement d’invisibles', () => {
    expect(activisionId.safeParse('').success).toBe(false);
    expect(activisionId.safeParse(' \u200B\u202E ').success).toBe(false);
  });

  it('reste borné en longueur', () => {
    expect(activisionId.safeParse('x'.repeat(60)).success).toBe(true);
    expect(activisionId.safeParse('x'.repeat(61)).success).toBe(false);
  });
});
