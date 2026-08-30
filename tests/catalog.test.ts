import { describe, expect, it } from 'vitest';
import { BOOSTERS, boosterSize, CARDS, cardsOfRarity, RARITY_META } from '@/lib/domain/catalog';
import { completionRatio } from '@/lib/domain/collection';
import { rewardForGame } from '@/lib/domain/economy';
import {
  crossedMilestones,
  ECONOMY,
  nextMilestone,
  rarityPercent,
  RARITY_WEIGHTS_BASE,
  SUB_MILESTONES,
  WEIGHT_TOTAL,
} from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

const LADDER: Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

describe('cohérence du catalogue', () => {
  it('contient 24 cartes', () => {
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

  it('fait monter la puissance avec la rareté', () => {
    // Rareté par rareté : la carte la plus faible d'un palier doit rester
    // au-dessus de la plus forte du palier précédent. C'est ce qui fait qu'une
    // ultra rare vaut son prix, et c'est la seule promesse d'un booster cher.
    let plafondPrecedent = -1;
    for (const rarity of LADDER) {
      const powers = cardsOfRarity(rarity).map((c) => c.power);
      expect(Math.min(...powers)).toBeGreaterThan(plafondPrecedent);
      plafondPrecedent = Math.max(...powers);
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

  it('garde la légendaire rare mais atteignable', () => {
    const perCard = rarityPercent(RARITY_WEIGHTS_BASE, 'L');
    expect(perCard).toBeCloseTo(0.02, 5);
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

describe('collection', () => {
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

  it('ne récompense que ce qui s’est passé en jeu', () => {
    // Deux joueurs aux mêmes kills et au même placement touchent la même chose,
    // quelle que soit leur collection. C'est l'invariant qui a coûté la vie aux
    // bonus permanents.
    expect(rewardForGame(0, null).total).toBe(ECONOMY.participation);
    expect(rewardForGame(4, 2).total).toBe(rewardForGame(4, 2).total);
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

describe('emplacements de booster', () => {
  it('donne toujours au moins une carte jouable', () => {
    // Sans emplacement d'effet garanti, un booster pouvait ne rien contenir de
    // jouable — franchement pénible à trois mille flocons.
    for (const booster of BOOSTERS) {
      expect(booster.slots.effet).toBeGreaterThanOrEqual(1);
    }
  });

  it('donne toujours au moins une carte de collection', () => {
    // C'est ce qui alimente le pool échangeable et fait vivre le marché.
    for (const booster of BOOSTERS) {
      expect(booster.slots.collection).toBeGreaterThanOrEqual(1);
    }
  });

  it('fait monter la part de cartes jouables avec le prix', () => {
    const sorted = [...BOOSTERS].sort((a, b) => a.price - b.price);
    const ratio = (b: (typeof BOOSTERS)[number]) => b.slots.effet / boosterSize(b);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(ratio(sorted[i])).toBeGreaterThanOrEqual(ratio(sorted[i - 1]));
    }
  });

  it('ne promet une garantie que sur les emplacements d’effet', () => {
    // Promettre « une super rare » et livrer une carte Joueur super rare ne
    // serait pas ce que le joueur croit acheter.
    for (const booster of BOOSTERS) {
      if (booster.guaranteed) expect(booster.slots.effet).toBeGreaterThanOrEqual(1);
    }
  });

  it('garde des sachets d’une taille lisible', () => {
    for (const booster of BOOSTERS) {
      expect(boosterSize(booster)).toBeGreaterThanOrEqual(3);
      expect(boosterSize(booster)).toBeLessThanOrEqual(6);
    }
  });
});
