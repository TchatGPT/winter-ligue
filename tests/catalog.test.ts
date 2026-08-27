import { describe, expect, it } from 'vitest';
import { BOOSTERS, CARDS, cardsOfRarity, cardsOfTheme, RARITY_META, THEMES } from '@/lib/domain/catalog';
import { completionRatio, handSlotsFor, setBonusesFor, themeProgress } from '@/lib/domain/collection';
import { discountedPrice, rewardForGame } from '@/lib/domain/economy';
import {
  atLeastOnePercent,
  BASE_RESERVE_SLOTS,
  crossedMilestones,
  ECONOMY,
  nextMilestone,
  rarityPercent,
  RARITY_WEIGHTS_BASE,
  SET_TIERS,
  SUB_MILESTONES,
  WEIGHT_TOTAL,
} from '@/lib/domain/rules';
import type { Rarity, ThemeId } from '@/lib/domain/types';

const LADDER: Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

describe('cohérence du catalogue', () => {
  it('contient 4 familles de 6 cartes, une par rareté', () => {
    for (const theme of Object.keys(THEMES) as ThemeId[]) {
      const cards = cardsOfTheme(theme);
      expect(cards).toHaveLength(6);
      expect(cards.map((c) => c.rarity)).toEqual(LADDER);
    }
    expect(CARDS).toHaveLength(24);
  });

  it('propose exactement 4 cartes par rareté', () => {
    for (const rarity of LADDER) {
      expect(cardsOfRarity(rarity)).toHaveLength(4);
    }
  });

  it('n’a aucun identifiant en double', () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('donne une cible cohérente à chaque malus', () => {
    for (const card of CARDS) {
      if (card.nature === 'malus') {
        expect(card.target).toBe('opponent');
        expect(card.offensive).toBe(true);
      }
    }
  });

  it('fait monter la puissance avec la rareté, dans chaque famille', () => {
    for (const theme of Object.keys(THEMES) as ThemeId[]) {
      const powers = cardsOfTheme(theme).map((c) => c.power);
      const sorted = [...powers].sort((a, b) => a - b);
      expect(powers).toEqual(sorted);
    }
  });

  it('réserve le reflet holographique aux raretés à partir de Rare', () => {
    expect(RARITY_META.C.holo).toBe(false);
    expect(RARITY_META.PC.holo).toBe(false);
    for (const rarity of ['R', 'SR', 'UR', 'L'] as Rarity[]) {
      expect(RARITY_META[rarity].holo).toBe(true);
    }
  });
});

describe('tables de raretés', () => {
  it('somme exactement à 100 000 pour chaque booster', () => {
    const total = (weights: Record<Rarity, number>) =>
      Object.values(weights).reduce((a, b) => a + b, 0);

    expect(total(RARITY_WEIGHTS_BASE)).toBe(WEIGHT_TOTAL);
    for (const booster of BOOSTERS) {
      expect(total(booster.weights)).toBe(WEIGHT_TOTAL);
    }
  });

  it('n’utilise que des poids entiers positifs', () => {
    for (const booster of BOOSTERS) {
      for (const weight of Object.values(booster.weights)) {
        expect(Number.isInteger(weight)).toBe(true);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it('rend chaque rareté strictement plus rare que la précédente', () => {
    for (let i = 1; i < LADDER.length; i += 1) {
      expect(RARITY_WEIGHTS_BASE[LADDER[i]]).toBeLessThan(RARITY_WEIGHTS_BASE[LADDER[i - 1]]);
    }
  });

  it('garde la légendaire rare mais atteignable : environ 1 booster sur 1 000', () => {
    const perCard = rarityPercent(RARITY_WEIGHTS_BASE, 'L');
    expect(perCard).toBeCloseTo(0.02, 5);

    const perPack = atLeastOnePercent(RARITY_WEIGHTS_BASE, 'L', 5);
    expect(perPack).toBeGreaterThan(0.09);
    expect(perPack).toBeLessThan(0.11);
  });

  it('améliore la courbe à mesure que le booster coûte cher', () => {
    const sorted = [...BOOSTERS].sort((a, b) => a.price - b.price);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].weights.L).toBeGreaterThanOrEqual(sorted[i - 1].weights.L);
      expect(sorted[i].weights.C).toBeLessThanOrEqual(sorted[i - 1].weights.C);
    }
  });

  it('ne promet une garantie que sur des raretés existantes', () => {
    for (const booster of BOOSTERS) {
      if (booster.guaranteed) {
        expect(cardsOfRarity(booster.guaranteed).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('collection et paliers', () => {
  const tempete = cardsOfTheme('tempete').map((c) => c.id);
  const glace = cardsOfTheme('glace').map((c) => c.id);

  it('n’accorde aucun bonus sous le palier partiel', () => {
    const bonuses = setBonusesFor(tempete.slice(0, SET_TIERS.partial - 1));
    expect(bonuses.partial).toEqual([]);
    expect(bonuses.completed).toEqual([]);
    expect(bonuses.killMultiplier).toBe(0);
  });

  it('accorde le bonus partiel à 4 cartes sur 6', () => {
    const bonuses = setBonusesFor(tempete.slice(0, SET_TIERS.partial));
    expect(bonuses.partial).toEqual(['tempete']);
    expect(bonuses.completed).toEqual([]);
    expect(bonuses.killMultiplier).toBeCloseTo(0.03);
  });

  it('remplace le bonus partiel par le plein à 6 sur 6, sans les cumuler', () => {
    const bonuses = setBonusesFor(tempete);
    expect(bonuses.completed).toEqual(['tempete']);
    expect(bonuses.partial).toEqual([]);
    expect(bonuses.killMultiplier).toBeCloseTo(0.07);
  });

  it('cumule les bonus de familles différentes', () => {
    const bonuses = setBonusesFor([...tempete, ...glace.slice(0, 4)]);
    expect(bonuses.completed).toEqual(['tempete']);
    expect(bonuses.partial).toEqual(['glace']);
    expect(bonuses.killMultiplier).toBeCloseTo(0.07);
    expect(bonuses.handSlots).toBe(8);
    expect(handSlotsFor([...tempete, ...glace.slice(0, 4)])).toBe(BASE_RESERVE_SLOTS + 8);
    expect(handSlotsFor([...glace])).toBe(BASE_RESERVE_SLOTS + 20);
  });

  it('annonce combien de cartes restent avant le prochain palier', () => {
    const [glaceProgress] = themeProgress(glace.slice(0, 2)).filter((p) => p.theme === 'glace');
    expect(glaceProgress.toNextTier).toBe(2);

    const [full] = themeProgress(glace).filter((p) => p.theme === 'glace');
    expect(full.toNextTier).toBe(0);
    expect(full.complete).toBe(true);
  });

  it('ignore les identifiants inconnus dans le taux de complétion', () => {
    expect(completionRatio(['carte-qui-n-existe-pas'])).toBe(0);
    expect(completionRatio(CARDS.map((c) => c.id))).toBe(1);
  });
});

describe('économie de jeu', () => {
  it('récompense kills, placement et participation', () => {
    const reward = rewardForGame(10, 1);
    expect(reward.total).toBe(10 * ECONOMY.perKill + ECONOMY.perPlacement['1'] + ECONOMY.participation);
  });

  it('ajoute le bonus de la famille Aurore', () => {
    expect(rewardForGame(0, null, 20).total).toBe(ECONOMY.participation + 20);
  });

  it('applique la remise de boutique en arrondissant au supérieur', () => {
    expect(discountedPrice(1000, 0.18)).toBe(820);
    expect(discountedPrice(1000, 0)).toBe(1000);
    // Une remise absurde reste bornée : le prix ne tombe jamais à zéro.
    expect(discountedPrice(100, 5)).toBe(10);
  });
});

describe('économie des subs', () => {
  it('déclenche un palier à chaque multiple franchi', () => {
    // 0 → 12 : deux Bourrasques (5 et 10), rien d'autre.
    const crossed = crossedMilestones(0, 12);
    expect(crossed.map((m) => m.label)).toEqual(['Bourrasque', 'Bourrasque']);
  });

  it('cumule les paliers quand un gros gift en franchit plusieurs', () => {
    // 0 → 100 : 20 Bourrasques, 4 Rafales, 1 Chute de Neige.
    const labels = crossedMilestones(0, 100).map((m) => m.label);
    expect(labels.filter((l) => l === 'Bourrasque')).toHaveLength(20);
    expect(labels.filter((l) => l === 'Rafale')).toHaveLength(4);
    expect(labels.filter((l) => l === 'Chute de Neige')).toHaveLength(1);
  });

  it('ne déclenche rien quand on reste dans le même intervalle', () => {
    expect(crossedMilestones(6, 9)).toEqual([]);
  });

  it('annonce le palier le plus proche', () => {
    const next = nextMilestone(3);
    expect(next?.milestone.label).toBe('Bourrasque');
    expect(next?.remaining).toBe(2);
  });

  it('ne verse jamais de flocons à un joueur nommé', () => {
    // Garde-fou de conception : aucun palier ne cible un joueur. Si un jour une
    // récompense individuelle apparaît ici, l'équilibre anti-pay-to-win saute.
    for (const milestone of SUB_MILESTONES) {
      expect(['FLOCONS', 'BOOSTER']).toContain(milestone.kind);
      expect(milestone).not.toHaveProperty('playerId');
    }
  });

  it('garde les deux sources de flocons du même ordre de grandeur', () => {
    // Sur une saison type : 25 games jouées, environ 900 subs.
    const parGame = rewardForGame(11, null).total;
    const duJeu = parGame * 25;

    const subs = crossedMilestones(0, 900);
    const desSubs = subs
      .filter((m) => m.kind === 'FLOCONS')
      .reduce((sum, m) => sum + (m.amount ?? 0), 0);

    // Ni l'une ni l'autre ne doit écraser sa voisine : on tolère un facteur 2.
    expect(desSubs).toBeGreaterThan(duJeu / 2);
    expect(desSubs).toBeLessThan(duJeu * 2);
  });
});

describe('places de réserve', () => {
  it('plafonne la réserve à une valeur qui contraint sans étouffer', () => {
    // Assez pour plusieurs boosters d'affilée, trop peu pour tout thésauriser :
    // c'est ce qui pousse le surplus vers l'hôtel des ventes.
    expect(BASE_RESERVE_SLOTS).toBeGreaterThanOrEqual(5 * 5);
    expect(BASE_RESERVE_SLOTS).toBeLessThanOrEqual(80);
  });

  it('fait de la famille Glace un vrai gain de place', () => {
    const glace = cardsOfTheme('glace').map((c) => c.id);
    expect(handSlotsFor([])).toBe(BASE_RESERVE_SLOTS);
    expect(handSlotsFor(glace.slice(0, 4))).toBeGreaterThan(handSlotsFor([]));
    expect(handSlotsFor(glace)).toBeGreaterThan(handSlotsFor(glace.slice(0, 4)));
  });
});
