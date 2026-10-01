import { describe, expect, it } from 'vitest';
import {
  CARDS,
  cardsOfRarity,
  cartesDuPack,
  getPack,
  PACKS,
  poolDuPack,
  RARITY_META,
  TOTAL_CARDS,
} from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import {
  CHANCE,
  chanceDe,
  crossedMilestones,
  DEFAULT_MAX_GAMES_PER_PLAYER,
  ECONOMY,
  multiplicateurChance,
  PALIERS_CHANCE,
  nextMilestone,
  packsPersoAcquis,
  paliersDuCompteur,
  departAccelere,
  COMMU_ACCELERE_TOUS_LES,
  PACKS_REGLES,
  poidsAvecChance,
  rarityPercent,
  RARITY_WEIGHTS_BASE,
  SUB_MILESTONES,
  WEIGHT_TOTAL,
  WINTER_SPIN,
} from '@/lib/domain/rules';
import { PACK_IDS, type Rarity } from '@/lib/domain/types';

const LADDER: Rarity[] = ['C', 'R', 'UR', 'L'];

const total = (weights: Record<string, number>) =>
  Object.values(weights).reduce((a, b) => a + b, 0);

describe('cohérence du catalogue', () => {
  it('propose au moins quatre cartes par rareté', () => {
    for (const rarity of LADDER) {
      expect(cardsOfRarity(rarity).length).toBeGreaterThanOrEqual(4);
    }
    expect(TOTAL_CARDS).toBe(CARDS.length);
  });

  it('n’a aucun identifiant en double', () => {
    const ids = CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('range chaque carte dans au moins un booster connu', () => {
    for (const card of CARDS) {
      expect(card.packs.length).toBeGreaterThan(0);
      for (const pack of card.packs) expect(PACK_IDS).toContain(pack);
    }
  });

  it('fait monter la puissance avec la rareté', () => {
    // Rareté par rareté : la carte la plus faible d'un palier doit rester
    // au-dessus de la plus forte du palier précédent.
    let plafondPrecedent = -1;
    for (const rarity of LADDER) {
      const powers = cardsOfRarity(rarity).map((c) => c.power);
      expect(Math.min(...powers)).toBeGreaterThan(plafondPrecedent);
      plafondPrecedent = Math.max(...powers);
    }
  });

  it('réserve le reflet holographique aux raretés à partir de Rare', () => {
    expect(RARITY_META.C.holo).toBe(false);
    for (const rarity of ['R', 'UR', 'L'] as Rarity[]) {
      expect(RARITY_META[rarity].holo).toBe(true);
    }
  });
});

describe('les boosters', () => {
  it('sont quatre, un par identifiant', () => {
    expect(PACKS.map((p) => p.id).sort()).toEqual([...PACK_IDS].sort());
    for (const id of PACK_IDS) expect(getPack(id)?.id).toBe(id);
    expect(getPack('sachet-fantome')).toBeNull();
  });

  it('ont une carte à tirer pour chaque rareté qu’ils annoncent', () => {
    // Une rareté affichée à 5 % sans carte derrière serait servie par le
    // palier du dessous : le taux affiché mentirait.
    for (const pack of PACKS) {
      const pool = poolDuPack(pack.id);
      for (const rarity of LADDER) {
        if (pack.weights[rarity] > 0) expect(pool[rarity].length).toBeGreaterThan(0);
      }
    }
  });

  it('ne contiennent que des bonus quand ils s’ouvrent pour un joueur', () => {
    for (const pack of PACKS.filter((p) => p.portee === 'JOUEUR')) {
      for (const card of cartesDuPack(pack.id)) expect(card.nature).toBe('bonus');
    }
  });

  it('ne promettent rien en dessous de rare dans le Booster Folie', () => {
    const folie = getPack('folie')!;
    expect(folie.weights.C).toBe(0);
    for (const card of cartesDuPack('folie')) {
      expect(['R', 'UR', 'L']).toContain(card.rarity);
    }
  });

  it('doivent un Booster Perso à chaque multiple de subs offerts', () => {
    const n = PACKS_REGLES.persoTousLes;
    expect(packsPersoAcquis(0)).toBe(0);
    expect(packsPersoAcquis(n - 1)).toBe(0);
    expect(packsPersoAcquis(n)).toBe(1);
    expect(packsPersoAcquis(n * 3 + 1)).toBe(3);
    expect(packsPersoAcquis(-4)).toBe(0);
  });

  it('doivent en plus un Booster Perso par sub T3, pris ou offert', () => {
    const n = PACKS_REGLES.persoTousLes;
    expect(packsPersoAcquis(0, 1)).toBe(1);
    expect(packsPersoAcquis(n - 1, 2)).toBe(2);
    expect(packsPersoAcquis(n * 2, 3)).toBe(5);
    expect(packsPersoAcquis(0, -1)).toBe(0);
  });
});

describe('tables de raretés', () => {
  it('somme exactement à 100 000 pour chaque booster', () => {
    expect(total(RARITY_WEIGHTS_BASE)).toBe(WEIGHT_TOTAL);
    for (const pack of PACKS) {
      expect(total(pack.weights)).toBe(WEIGHT_TOTAL);
    }
  });

  it('n’utilise que des poids entiers, positifs ou nuls', () => {
    for (const pack of PACKS) {
      for (const weight of Object.values(pack.weights)) {
        expect(Number.isInteger(weight)).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rend chaque rareté strictement plus rare que la précédente', () => {
    for (let i = 1; i < LADDER.length; i += 1) {
      expect(RARITY_WEIGHTS_BASE[LADDER[i]]).toBeLessThan(RARITY_WEIGHTS_BASE[LADDER[i - 1]]);
    }
  });

  it('garde la légendaire rare mais atteignable', () => {
    // Une sur cinq cents au Booster Perso, sans chance.
    expect(rarityPercent(RARITY_WEIGHTS_BASE, 'L')).toBeCloseTo(0.2, 5);
  });

  it('ne fait jamais du Perso, le booster qu’on obtient en offrant des subs, le meilleur en légendaires', () => {
    for (const pack of PACKS) {
      if (pack.id === 'perso') continue;
      expect(pack.weights.L).toBeGreaterThan(RARITY_WEIGHTS_BASE.L);
    }
  });
});

describe('la chance', () => {
  it('monte par paliers avec le solde, de ×1 à ×4, et s’arrête au plafond', () => {
    expect(chanceDe(0)).toBe(0);
    expect(chanceDe(-500)).toBe(0);
    expect(chanceDe(Number.NaN)).toBe(0);
    expect(multiplicateurChance(0)).toBe(1);
    expect(multiplicateurChance(999)).toBe(1);
    expect(multiplicateurChance(1_000)).toBe(1.1);
    expect(multiplicateurChance(17_999)).toBe(1.9);
    expect(multiplicateurChance(18_000)).toBe(2);
    expect(multiplicateurChance(32_000)).toBe(3);
    expect(multiplicateurChance(ECONOMY.soldeMax)).toBe(4);
    expect(chanceDe(ECONOMY.soldeMax)).toBe(CHANCE.max);
    expect(chanceDe(ECONOMY.soldeMax * 10)).toBe(CHANCE.max);
  });

  it('a des paliers qui montent, du premier au plafond', () => {
    expect(PALIERS_CHANCE[0]).toEqual({ des: 0, multiplicateur: 1 });
    expect(PALIERS_CHANCE.at(-1)).toEqual({ des: ECONOMY.soldeMax, multiplicateur: 1 + CHANCE.max });
    for (let i = 1; i < PALIERS_CHANCE.length; i += 1) {
      expect(PALIERS_CHANCE[i].des).toBeGreaterThan(PALIERS_CHANCE[i - 1].des);
      expect(PALIERS_CHANCE[i].multiplicateur).toBeGreaterThan(PALIERS_CHANCE[i - 1].multiplicateur);
    }
  });

  it('garde la somme exacte, quelle que soit la chance', () => {
    // C'est la plage dans laquelle le tirage se fait : une table poussée qui
    // ne totaliserait plus 100 000 rendrait les taux affichés mensongers.
    for (const pack of PACKS) {
      for (const chance of [0, 0.01, 0.333, 0.5, 0.999, 1, 1.5, 2, 2.5, 3]) {
        const pousse = poidsAvecChance(pack.weights, chance);
        expect(total(pousse)).toBe(WEIGHT_TOTAL);
        for (const poids of Object.values(pousse)) {
          expect(Number.isInteger(poids)).toBe(true);
          expect(poids).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('multiplie les raretés hautes par 4 au maximum, pas davantage', () => {
    const plein = poidsAvecChance(RARITY_WEIGHTS_BASE, CHANCE.max);
    for (const rarity of ['R', 'UR', 'L'] as Rarity[]) {
      expect(plein[rarity]).toBe(RARITY_WEIGHTS_BASE[rarity] * 4);
    }
    // La commune absorbe la différence, et il en reste : au Booster Perso,
    // 32 % de communes et une légendaire sur cent vingt-cinq.
    expect(plein.C).toBe(32_000);
    expect(plein.L).toBe(800);
    expect(poidsAvecChance(RARITY_WEIGHTS_BASE, CHANCE.max * 10)).toEqual(plein);
  });

  it('ne change rien sans flocons', () => {
    expect(poidsAvecChance(RARITY_WEIGHTS_BASE, 0)).toEqual(RARITY_WEIGHTS_BASE);
  });

  it('ne fait jamais tomber la commune sous zéro', () => {
    // Une table réglée à la main avec presque pas de communes.
    const serree: Record<Rarity, number> = {
      C: 1_000,
      R: 90_000,
      UR: 8_000,
      L: 1_000,
    };
    const pousse = poidsAvecChance(serree, 1);
    expect(pousse.C).toBe(0);
    expect(total(pousse)).toBe(WEIGHT_TOTAL);
  });
});

describe('économie de jeu', () => {
  it('récompense kills, placement et participation', () => {
    const reward = rewardForGame(10, 1);
    expect(reward.total).toBe(10 * ECONOMY.perKill + ECONOMY.perPlacement['1'] + ECONOMY.participation);
  });

  it('ne récompense que ce qui s’est passé en jeu', () => {
    // La récompense n'a que deux entrées, les kills et le placement : rien de
    // ce qu'un joueur possède ne peut la faire monter.
    expect(rewardForGame.length).toBe(2);
    expect(rewardForGame(0, null).total).toBe(ECONOMY.participation);
    expect(rewardForGame(-3, null).total).toBe(ECONOMY.participation);
  });

  it('paie les trois places, dans l’ordre', () => {
    const p = ECONOMY.perPlacement;
    expect(p['1']).toBeGreaterThan(p['2']);
    expect(p['2']).toBeGreaterThan(p['3']);
    expect(p['3']).toBeGreaterThan(0);
  });
});

describe('économie des subs', () => {
  it('met un booster en file à chaque multiple franchi', () => {
    // 0 → 120 : deux Boosters Commu (50 et 100), rien d'autre.
    expect(crossedMilestones(0, 120).map((m) => m.label)).toEqual(['Booster Commu', 'Booster Commu']);
  });

  it('cumule les paliers quand un gros gift en franchit plusieurs', () => {
    // 0 → 400 : 8 Boosters Commu, 2 Boosters Folie.
    const labels = crossedMilestones(0, 400).map((m) => m.label);
    expect(labels.filter((l) => l === 'Booster Commu')).toHaveLength(8);
    expect(labels.filter((l) => l === 'Booster Folie')).toHaveLength(2);
  });

  it('ne déclenche rien quand on reste dans le même intervalle', () => {
    expect(crossedMilestones(6, 49)).toEqual([]);
  });

  it('annonce le palier le plus proche', () => {
    const next = nextMilestone(36);
    expect(next?.milestone.label).toBe('Booster Commu');
    expect(next?.remaining).toBe(14);
  });

  it('ne verse jamais rien à un joueur nommé, ni de flocons', () => {
    // Garde-fou de conception : aucun palier ne cible un joueur. Si un jour une
    // récompense individuelle apparaît ici, l'équilibre anti-pay-to-win saute.
    for (const milestone of SUB_MILESTONES) {
      expect(milestone.kind).toBe('PACK');
      expect(milestone).not.toHaveProperty('amount');
      expect(milestone).not.toHaveProperty('playerId');
      expect(milestone).not.toHaveProperty('joueurId');
    }
  });

  it('ne met en file que des boosters collectifs', () => {
    // Un Booster Perso tombé d'un palier irait à quelqu'un en particulier.
    expect(SUB_MILESTONES.length).toBeGreaterThan(0);
    for (const milestone of SUB_MILESTONES) {
      expect(getPack(milestone.packId)?.portee).toBe('TOUS');
    }
  });
});

describe('le jeton Winter Spin', () => {
  it('a une table de relance qui somme exactement à 100 000', () => {
    // Même règle que toutes les autres tables : c'est la plage dans laquelle
    // `pickWeighted` tire, et une somme fausse rend les taux mensongers sans
    // que personne puisse s'en apercevoir.
    expect(total(WINTER_SPIN.weights)).toBe(WEIGHT_TOTAL);
    for (const poids of Object.values(WINTER_SPIN.weights)) {
      expect(Number.isInteger(poids)).toBe(true);
      expect(poids).toBeGreaterThanOrEqual(0);
    }
  });

  it('relance vers le haut, sans quoi le jeton ne vaudrait rien', () => {
    const haut = WINTER_SPIN.weights.UR + WINTER_SPIN.weights.L;
    expect(haut / WEIGHT_TOTAL).toBeGreaterThan(0.5);
    expect(WINTER_SPIN.weights.C).toBe(0);
  });

  it('reste très rare, et jamais impossible', () => {
    // Une chance nulle retirerait la mécanique en silence ; une chance élevée
    // ferait du jeton la règle plutôt que l'évènement. Les bornes sont larges,
    // elles ne verrouillent qu'un ordre de grandeur.
    expect(WINTER_SPIN.chance).toBeGreaterThan(0);
    expect(WINTER_SPIN.chance / WEIGHT_TOTAL).toBeLessThan(0.005);
  });
});

describe('les paliers du compteur de subs', () => {
  it('montre les boosters de la ligue et les évènements, du plus petit palier au plus grand', () => {
    expect(paliersDuCompteur(36).map((p) => [p.label, p.every, p.remaining])).toEqual([
      ['Booster Commu', 50, 14],
      ['Avalanche', 100, 64],
      ['Booster Folie', 200, 164],
      ['Tempête de neige', 500, 464],
    ]);
  });

  it('pendant une Tempête, fait tomber le Booster Commu tous les 20 subs, comptés depuis elle', () => {
    const commu = paliersDuCompteur(507, 500).find((p) => p.packId === 'commu')!;
    expect(commu).toMatchObject({ every: COMMU_ACCELERE_TOUS_LES, remaining: 13, accelere: true });
    expect(departAccelere(505)).toBe(500);
  });
});

describe('la Tempête et le Booster Commu', () => {
  const commus = (from: number, to: number, depuis: number | null) =>
    crossedMilestones(from, to, depuis).filter((m) => m.packId === 'commu').length;

  it('compte tous les 50 sans Tempête, tous les 20 pendant', () => {
    expect(commus(500, 600, null)).toBe(2);
    expect(commus(500, 600, 500)).toBe(5);
  });

  it('garde le palier de 50 jusqu’à la Tempête, et passe à 20 après, dans la même saisie', () => {
    // 495 → 545 : le 500 tombe par la règle habituelle, puis 520 et 540.
    expect(commus(495, 545, 500)).toBe(3);
  });
});
