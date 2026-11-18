import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { adjust, credit } from '@/lib/services/ledger';

/**
 * Le solde maximum suit la saison (18/11/2026) : 30 000 en Mini Ligue, 50 000
 * en saison 2. Ce qui déborde est perdu, et le grand livre écrit ce qui a été
 * versé.
 */
function ligue(numero: number, solde: number): Database {
  const db = emptyDatabase();
  db.config.numero = numero;
  db.players.push({
    id: 'a',
    slug: 'a',
    pseudo: 'A',
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes: solde,
    subsOfferts: 0,
    creneauxBonus: 0,
    immuniseJusqua: null,
    sessionsDepuis: null,
    roleManuel: false,
    joinedAt: '2026-11-22T00:00:00.000Z',
    active: true,
    role: 'joueur',
  });
  return db;
}

describe('le solde maximum de la saison', () => {
  it('arrête un crédit à 30 000 en Mini Ligue, à 50 000 en saison 2', () => {
    const mini = ligue(1, 29_900);
    credit(mini, 'a', 500, 'GAME', null);
    expect(mini.players[0].snowflakes).toBe(30_000);
    expect(mini.ledger.at(-1)!.delta).toBe(100);

    const s2 = ligue(2, 29_900);
    credit(s2, 'a', 500, 'GAME', null);
    expect(s2.players[0].snowflakes).toBe(30_400);
  });

  it('ne fait jamais d’un gain une perte, même au-dessus du solde maximum', () => {
    const db = ligue(1, 35_000);
    credit(db, 'a', 200, 'GAME', null);
    adjust(db, 'a', 200, null);
    expect(db.players[0].snowflakes).toBe(35_000);
    expect(db.ledger.every((l) => l.delta === 0)).toBe(true);
    // Une reprise passe toujours.
    adjust(db, 'a', -1_000, null);
    expect(db.players[0].snowflakes).toBe(34_000);
  });
});
