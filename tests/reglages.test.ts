import { describe, expect, it } from 'vitest';
import { emptyDatabase } from '@/lib/db/store';
import { BOOSTERS } from '@/lib/domain/catalog';
import { RARITY_WEIGHTS_BASE, WEIGHT_TOTAL } from '@/lib/domain/rules';
import { RARITIES } from '@/lib/domain/types';
import {
  BoosterError,
  PRIX_MAX,
  reglageBooster,
  resolvedBooster,
  resolvedBoosters,
  verifieTable,
} from '@/lib/services/boosters';

const base = () => emptyDatabase();
const premier = BOOSTERS[0];

describe('réglages de booster', () => {
  it('rend le catalogue tant que rien n’est réglé', () => {
    const db = base();
    for (const b of resolvedBoosters(db)) {
      const original = BOOSTERS.find((x) => x.id === b.id)!;
      expect(b.price).toBe(original.price);
      expect(b.weights).toEqual(original.weights);
    }
  });

  it('applique un prix sans toucher aux taux', () => {
    const db = base();
    reglageBooster(db, premier.id, { price: 999 });
    const resolu = resolvedBooster(db, premier.id)!;
    expect(resolu.price).toBe(999);
    expect(resolu.weights).toEqual(premier.weights);
  });

  it('applique une table sans toucher au prix', () => {
    const db = base();
    reglageBooster(db, premier.id, { weights: { ...RARITY_WEIGHTS_BASE, C: 72_000, PC: 21_000 } });
    const resolu = resolvedBooster(db, premier.id)!;
    expect(resolu.price).toBe(premier.price);
    expect(resolu.weights.C).toBe(72_000);
  });

  it('revient au catalogue quand on remet à zéro', () => {
    const db = base();
    reglageBooster(db, premier.id, { price: 999 });
    reglageBooster(db, premier.id, { price: null, weights: null });
    expect(resolvedBooster(db, premier.id)!.price).toBe(premier.price);
    // Plus aucune ligne : la présence d'un réglage doit vouloir dire quelque chose.
    expect(db.boosterSettings).toHaveLength(0);
  });

  it('refuse une table qui ne totalise pas exactement 100 000', () => {
    // C'est l'invariant : `pickWeighted` tire dans cette plage. Une somme
    // inférieure laisse un intervalle sans carte, une somme supérieure rend les
    // dernières raretés inatteignables — et dans les deux cas les taux affichés
    // deviennent faux sans que personne puisse s'en apercevoir.
    const db = base();
    for (const somme of [WEIGHT_TOTAL - 1, WEIGHT_TOTAL + 1, 0]) {
      const table = { ...RARITY_WEIGHTS_BASE, C: RARITY_WEIGHTS_BASE.C + (somme - WEIGHT_TOTAL) };
      expect(() => reglageBooster(db, premier.id, { weights: table })).toThrow(BoosterError);
    }
  });

  it('refuse un poids négatif ou fractionnaire', () => {
    expect(() => verifieTable({ ...RARITY_WEIGHTS_BASE, L: -20, C: 73_040 })).toThrow(BoosterError);
    expect(() => verifieTable({ ...RARITY_WEIGHTS_BASE, L: 20.5 })).toThrow(BoosterError);
  });

  it('refuse une table à laquelle il manque une rareté', () => {
    const partielle: Record<string, number> = { ...RARITY_WEIGHTS_BASE };
    delete partielle.L;
    expect(() => verifieTable(partielle)).toThrow(BoosterError);
  });

  it('refuse un prix hors bornes ou fractionnaire', () => {
    const db = base();
    expect(() => reglageBooster(db, premier.id, { price: 0 })).toThrow(BoosterError);
    expect(() => reglageBooster(db, premier.id, { price: PRIX_MAX + 1 })).toThrow(BoosterError);
    expect(() => reglageBooster(db, premier.id, { price: 12.5 })).toThrow(BoosterError);
  });

  it('refuse un booster inconnu', () => {
    expect(() => reglageBooster(base(), 'sachet-fantome', { price: 10 })).toThrow(BoosterError);
  });

  it('n’écrit rien quand la table est refusée', () => {
    // Une validation qui laisserait une écriture partielle serait pire que pas
    // de validation : le booster sortirait de la transaction à moitié réglé.
    const db = base();
    expect(() =>
      reglageBooster(db, premier.id, { price: 500, weights: { ...RARITY_WEIGHTS_BASE, L: 0 } }),
    ).toThrow(BoosterError);
    expect(db.boosterSettings).toHaveLength(0);
    expect(resolvedBooster(db, premier.id)!.price).toBe(premier.price);
  });

  it('garde une table valide utilisable par le tirage', () => {
    // Le tirage parcourt les raretés dans l'ordre : la table rendue doit les
    // contenir toutes, sans quoi `pickWeighted` sortirait de sa plage.
    const table = verifieTable(RARITY_WEIGHTS_BASE);
    expect(Object.keys(table).sort()).toEqual([...RARITIES].sort());
    expect(RARITIES.reduce((s, r) => s + table[r], 0)).toBe(WEIGHT_TOTAL);
  });
});
