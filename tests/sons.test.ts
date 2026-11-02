import { describe, expect, it } from 'vitest';
import { sonDeFete } from '@/components/bruitage';
import { RARITY_ORDER } from '@/lib/domain/rules';

/**
 * Les sons d'une ouverture : une commune n'a rien à fêter, chaque rareté au-dessus
 * a sa fanfare, à l'arrêt seulement.
 */
describe('les sons d’une ouverture', () => {
  it('donnent à chaque rareté sa fanfare, et aucune à la commune', () => {
    expect(sonDeFete(RARITY_ORDER.C)).toBeNull();
    expect(sonDeFete(RARITY_ORDER.R)).toBe('rare');
    expect(sonDeFete(RARITY_ORDER.UR)).toBe('ultra');
    expect(sonDeFete(RARITY_ORDER.L)).toBe('legendaire');
  });
});
