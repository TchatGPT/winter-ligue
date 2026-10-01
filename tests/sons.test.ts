import { describe, expect, it } from 'vitest';
import { appatPour, sonDeFete } from '@/components/bruitage';
import { RARITY_ORDER } from '@/lib/domain/rules';

/**
 * Les sons d'une ouverture : une commune n'a rien à fêter, chaque rareté au-dessus
 * a sa fanfare, et la montée n'annonce qu'une rare ou mieux.
 */
describe('les sons d’une ouverture', () => {
  it('donnent à chaque rareté sa fanfare, et aucune à la commune', () => {
    expect(sonDeFete(RARITY_ORDER.C)).toBeNull();
    expect(sonDeFete(RARITY_ORDER.R)).toBe('rare');
    expect(sonDeFete(RARITY_ORDER.UR)).toBe('ultra');
    expect(sonDeFete(RARITY_ORDER.L)).toBe('legendaire');
  });

  it('ne font monter l’appât que pour une rare ou mieux', () => {
    expect(appatPour(RARITY_ORDER.C)).toBe(false);
    expect(appatPour(RARITY_ORDER.R)).toBe(true);
    expect(appatPour(RARITY_ORDER.UR)).toBe(true);
    expect(appatPour(RARITY_ORDER.L)).toBe(true);
  });
});
