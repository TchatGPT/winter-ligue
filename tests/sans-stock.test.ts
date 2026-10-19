import { describe, expect, it } from 'vitest';
import type { Database, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { WEIGHT_TOTAL } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { carteQuiAttend, regleApresRevelation } from '@/lib/services/effects';
import { ouvrePack, PackError, reglagePack } from '@/lib/services/packs';

/**
 * Pas de stock de cartes (décidé le 13/10/2026) : un joueur n'a jamais plus
 * d'une carte en attente. Tant qu'elle n'a pas joué, aucun booster ne s'ouvre
 * pour lui, et le sort d'un booster de la ligue ne tombe pas sur lui. Le Joker,
 * qui se garde, ne bloque rien.
 *
 * Sur le vrai catalogue : la rare du Perso (Vent Porteur) et la commune du
 * Commu (Congère) attendent la prochaine game ; les ultra rares du Perso
 * (Coulée de Neige, Joker Givré) n'attendent rien.
 */

function seulement(rarity: Rarity): Record<Rarity, number> {
  return { C: 0, R: 0, UR: 0, L: 0, [rarity]: WEIGHT_TOTAL };
}

function joueur(id: string): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes: 0,
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

function ligue(...ids: string[]): Database {
  const db = emptyDatabase();
  for (const id of ids) db.players.push(joueur(id));
  return db;
}

/** La carte qui attend, jouée comme sur une game. */
function joue(db: Database, joueurId: string) {
  const c = carteQuiAttend(db, joueurId);
  if (c) c.consommeeA = '2027-01-01T00:00:00.000Z';
}

describe('pas de stock de cartes', () => {
  it('ne verse les flocons d’une carte qu’une fois révélée, sans bloquer le booster suivant', () => {
    const db = ligue('a');
    reglagePack(db, 'perso', seulement('UR'));
    for (let i = 0; i < 40; i += 1) {
      const o = ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: `r${i}` }, 'modo');
      if (o.cardId !== 'coulee-de-neige') {
        o.annonceeA = new Date().toISOString();
        regleApresRevelation(db, o.id);
        joue(db, 'a');
        continue;
      }
      // Tirée, pas encore révélée : rien sur le solde.
      expect(db.players[0].snowflakes).toBe(0);
      // Elle ne bloque pas le booster suivant, qui la règle d'abord : on
      // rouvre pour lui, la carte d'avant a été vue.
      expect(carteQuiAttend(db, 'a')).toBeNull();
      ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: `r${i}-suite` }, 'modo');
      expect(db.players[0].snowflakes).toBeGreaterThanOrEqual(50);
      return;
    }
    throw new Error('aucune Coulée de Neige en 40 ouvertures');
  });

  it('refuse un booster Perso tant que la carte précédente n’a pas joué', () => {
    const db = ligue('a');
    reglagePack(db, 'perso', seulement('R'));
    const premiere = ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: 'k1' }, 'modo');
    // Une rare du Perso (Luge, Vent Porteur) : elle attend la prochaine game.
    expect(getCard(premiere.cardId)!.rarity).toBe('R');
    expect(carteQuiAttend(db, 'a')).not.toBeNull();

    let refus: unknown = null;
    try {
      ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: 'k2' }, 'modo');
    } catch (e) {
      refus = e;
    }
    expect(refus).toBeInstanceOf(PackError);
    expect((refus as PackError).code).toBe('CARTE_EN_ATTENTE');
    expect(db.ouvertures).toHaveLength(1);

    // Sa carte a joué : le booster suivant s'ouvre.
    joue(db, 'a');
    expect(() => ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: 'k3' }, 'modo')).not.toThrow();
  });

  it('ne bloque rien avec une carte qui se règle tout de suite, ni avec le Joker', () => {
    const db = ligue('a');
    reglagePack(db, 'perso', seulement('UR'));
    // Coulée de Neige (flocons) ou Joker Givré : ni l'une ni l'autre n'attend.
    // Écho Lointain, elle, attend la prochaine game.
    for (let i = 0; i < 40; i += 1) {
      const o = ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: `k${i}` }, 'modo');
      // La carte révélée à l'écran : ce qui se règle tout de suite se règle.
      o.annonceeA = new Date().toISOString();
      regleApresRevelation(db, o.id);
      if (o.cardId === 'echo-lointain') {
        expect(carteQuiAttend(db, 'a')?.cardId).toBe('echo-lointain');
        joue(db, 'a');
      } else {
        expect(carteQuiAttend(db, 'a')).toBeNull();
      }
    }
  });

  it('ne tire jamais un joueur qui a déjà une carte en attente, et attend si tous en ont une', () => {
    const db = ligue('a', 'b');
    reglagePack(db, 'commu', seulement('C'));
    const un = ouvrePack(db, { packId: 'commu', idempotencyKey: 'k1' }, 'modo');
    const deux = ouvrePack(db, { packId: 'commu', idempotencyKey: 'k2' }, 'modo');
    // Les deux joueurs, chacun une fois.
    expect([...un.beneficiaires, ...deux.beneficiaires].sort()).toEqual(['a', 'b']);

    expect(() => ouvrePack(db, { packId: 'commu', idempotencyKey: 'k3' }, 'modo')).toThrow(PackError);
    expect(db.ouvertures).toHaveLength(2);

    // Celui dont la carte a joué redevient tirable, et lui seul.
    joue(db, 'b');
    const trois = ouvrePack(db, { packId: 'commu', idempotencyKey: 'k4' }, 'modo');
    expect(trois.beneficiaires).toEqual(['b']);
  });
});
