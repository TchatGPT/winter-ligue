import { describe, expect, it } from 'vitest';
import type { Database, PackDu, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { getCard, PACKS, poolDuPack } from '@/lib/domain/catalog';
import { tirePack } from '@/lib/domain/rng';
import { chanceDe, CHANCE, ECONOMY, poidsAvecChance, WEIGHT_TOTAL } from '@/lib/domain/rules';
import type { PackDefinition, Rarity } from '@/lib/domain/types';
import { ouvreProchainDu, PackError } from '@/lib/services/packs';

/**
 * Le tirage réel, mesuré : le générateur du serveur, la table du booster,
 * poussée ou non par la chance. Les autres tests vérifient les tables ; ceux-ci
 * vérifient que ce qui sort du tirage les suit.
 */

const N = 120_000;
const RARETES: Rarity[] = ['C', 'R', 'UR', 'L'];

/** Les raretés sorties de N tirages, en proportions. */
function mesure(pack: PackDefinition, poids: Record<Rarity, number>): Record<Rarity, number> {
  const pool = new Set(Object.values(poolDuPack(pack.id)).flat());
  const n = { C: 0, R: 0, UR: 0, L: 0 } as Record<Rarity, number>;
  for (let i = 0; i < N; i += 1) {
    const id = tirePack(pack, poids);
    // Chaque carte tirée est bien une carte de ce booster.
    if (!pool.has(id)) throw new Error(`${id} n’est pas dans le ${pack.name}`);
    n[getCard(id)!.rarity] += 1;
  }
  return Object.fromEntries(RARETES.map((r) => [r, n[r] / N])) as Record<Rarity, number>;
}

/** Chaque rareté sort à son taux, à cinq écarts-types près. */
function suitLesTaux(observe: Record<Rarity, number>, poids: Record<Rarity, number>) {
  for (const r of RARETES) {
    const p = poids[r] / WEIGHT_TOTAL;
    const marge = 5 * Math.sqrt((p * (1 - p)) / N) + 1e-9;
    expect(Math.abs(observe[r] - p), `${r} : ${observe[r]} pour ${p}`).toBeLessThanOrEqual(marge);
  }
}

describe('le tirage réel d’un booster', () => {
  for (const pack of PACKS) {
    it(`${pack.name} : ne sort que ses cartes, aux taux annoncés`, () => {
      suitLesTaux(mesure(pack, pack.weights), pack.weights);
    });
  }

  for (const id of ['perso', 'finisseur'] as const) {
    const pack = PACKS.find((p) => p.id === id)!;
    it(`${pack.name} : à ×${1 + CHANCE.max}, sort aux taux poussés par la chance`, () => {
      const pousses = poidsAvecChance(pack.weights, CHANCE.max);
      suitLesTaux(mesure(pack, pousses), pousses);
    });
    it(`${pack.name} : à mi-chemin du plafond, sort aux taux de son palier`, () => {
      const pousses = poidsAvecChance(pack.weights, chanceDe(ECONOMY.soldeMax / 2));
      suitLesTaux(mesure(pack, pousses), pousses);
    });
  }
});

/* ------------------------------- La file ------------------------------- */

function joueur(id: string, flocons: number): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes: flocons,
    subsOfferts: 0,
    creneauxBonus: 0,
    immuniseJusqua: null,
    sessionsDepuis: null,
    roleManuel: false,
    joinedAt: '2027-01-01T00:00:00.000Z',
    active: true,
    role: 'joueur',
  };
}

function du(id: string, packId: PackDu['packId'], joueurId: string | null, creeA: string): PackDu {
  return { id, packId, joueurId, raison: 'test', creeA, ouvertureId: null, donDe: null };
}

function ligue(): Database {
  const db = emptyDatabase();
  db.players.push(joueur('riche', ECONOMY.soldeMax), joueur('pauvre', 0));
  db.packsDus.push(
    du('perso-2', 'perso', 'riche', '2027-01-02T00:00:00.000Z'),
    du('perso-1', 'perso', 'riche', '2027-01-01T00:00:00.000Z'),
    du('commu-1', 'commu', null, '2027-01-01T00:00:00.000Z'),
  );
  return db;
}

describe('l’ouverture d’un booster de la file', () => {
  it('ouvre le plus ancien dû au joueur, avec la chance de son solde, et le marque ouvert', () => {
    const db = ligue();
    const o = ouvreProchainDu(db, { packId: 'perso', joueurId: 'riche', idempotencyKey: 'a' }, 'test');
    expect(o.chance).toBe(chanceDe(ECONOMY.soldeMax));
    expect(o.chance).toBe(CHANCE.max);
    expect(db.packsDus.find((p) => p.id === 'perso-1')!.ouvertureId).toBe(o.id);
    expect(db.packsDus.find((p) => p.id === 'perso-2')!.ouvertureId).toBeNull();
    expect(o.beneficiaires).toEqual(['riche']);
  });

  it('ne s’ouvre que si un booster est dû, et jamais deux fois le même', () => {
    const db = ligue();
    ouvreProchainDu(db, { packId: 'perso', joueurId: 'riche', idempotencyKey: 'a' }, 'test');
    ouvreProchainDu(db, { packId: 'perso', joueurId: 'riche', idempotencyKey: 'b' }, 'test');
    expect(() => ouvreProchainDu(db, { packId: 'perso', joueurId: 'riche', idempotencyKey: 'c' }, 'test')).toThrow(
      PackError,
    );
    // Rien n'est dû au joueur sans booster.
    expect(() => ouvreProchainDu(db, { packId: 'perso', joueurId: 'pauvre', idempotencyKey: 'd' }, 'test')).toThrow(
      PackError,
    );
    expect(db.ouvertures).toHaveLength(2);
  });

  it('n’applique aucune chance à un booster de la ligue', () => {
    const db = ligue();
    const o = ouvreProchainDu(db, { packId: 'commu', idempotencyKey: 'c' }, 'test');
    expect(o.chance).toBe(0);
    expect(o.joueurId).toBeNull();
    expect(db.packsDus.find((p) => p.id === 'commu-1')!.ouvertureId).toBe(o.id);
  });
});
