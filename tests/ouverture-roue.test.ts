import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';

/**
 * Une ouverture du Commu tombe sur une carte des roues que personne ne peut
 * encore jouer : elle s'ouvre quand même, sans effet — le booster ne reste
 * pas dans la file, où le rouvrir aurait retiré une autre carte.
 */

const force = vi.hoisted(() => ({ carte: 'trois-glacons' }));
vi.mock('@/lib/domain/rng', async (original) => ({
  ...(await original<typeof import('@/lib/domain/rng')>()),
  tirePack: () => force.carte,
}));

const { ouvreProchainDu, tirageDe } = await import('@/lib/services/packs');

function ligue(...ids: string[]): Database {
  const db = emptyDatabase();
  for (const id of ids) {
    db.players.push({
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
    });
  }
  db.packsDus.push({
    id: 'commu-1',
    packId: 'commu',
    joueurId: null,
    raison: 'palier',
    creeA: '2027-01-01T00:00:00.000Z',
    ouvertureId: null,
  } as Database['packsDus'][number]);
  return db;
}

describe('une carte des roues que personne ne peut encore jouer', () => {
  it('« Trois Glaçons » avant la 30ᵉ game : le booster s’ouvre, sur trois joueurs, sans game à dérouler', () => {
    force.carte = 'trois-glacons';
    const db = ligue('a', 'b', 'c', 'd');
    const o = ouvreProchainDu(db, { packId: 'commu', idempotencyKey: 'k' }, 'modo');
    expect(o.cardId).toBe('trois-glacons');
    expect(o.beneficiaires).toHaveLength(3);
    expect(o.games ?? null).toBeNull();
    expect(db.packsDus[0].ouvertureId).toBe(o.id);
    expect(tirageDe(db, o)).toMatchObject({ gagnants: expect.any(Array), games: null });
  });
});
