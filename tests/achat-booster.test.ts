import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { ACHAT_PERSO, multiplicateurChance } from '@/lib/domain/rules';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { credit } from '@/lib/services/ledger';
import { acheteBoosterPerso, PackError } from '@/lib/services/packs';

/**
 * Un Booster Perso contre 5 000 flocons : le prix passe au grand livre, le
 * booster en file, et une même clé d'achat n'achète qu'une fois.
 */

const CLE_A = '0b9e6a52-6f5e-4c55-9d0a-3c1f4d1a2b01';
const CLE_B = '0b9e6a52-6f5e-4c55-9d0a-3c1f4d1a2b02';

function base(solde: number): { db: Database; id: string } {
  const db = emptyDatabase();
  const p = rattacheCompteTwitch(db, { id: 'tw-a', login: 'alpha', displayName: 'Alpha', avatarUrl: null, roleChaine: 'joueur' });
  if (solde > 0) credit(db, p.id, solde, 'AJUSTEMENT_ADMIN', null);
  return { db, id: p.id };
}

const persoEnFile = (db: Database, id: string) =>
  db.packsDus.filter((d) => d.packId === 'perso' && d.joueurId === id && d.ouvertureId === null).length;

describe('acheter un Booster Perso', () => {
  it('débite le prix au grand livre et met le booster en file', () => {
    const { db, id } = base(7_000);
    const r = acheteBoosterPerso(db, id, CLE_A);
    expect(r).toEqual({ solde: 7_000 - ACHAT_PERSO.prix, dejaAchete: false });
    expect(db.players[0].snowflakes).toBe(2_000);
    expect(persoEnFile(db, id)).toBe(1);
    const ligne = db.ledger.at(-1)!;
    expect(ligne).toMatchObject({ delta: -ACHAT_PERSO.prix, reason: 'ACHAT_BOOSTER', refId: CLE_A, balanceAfter: 2_000 });
  });

  it('n’achète qu’une fois avec la même clé', () => {
    const { db, id } = base(12_000);
    acheteBoosterPerso(db, id, CLE_A);
    expect(acheteBoosterPerso(db, id, CLE_A)).toEqual({ solde: 7_000, dejaAchete: true });
    expect(persoEnFile(db, id)).toBe(1);
    // Une autre clé, un autre achat.
    acheteBoosterPerso(db, id, CLE_B);
    expect(persoEnFile(db, id)).toBe(2);
    expect(db.players[0].snowflakes).toBe(2_000);
  });

  it('refuse sans assez de flocons, sans rien toucher', () => {
    const { db, id } = base(ACHAT_PERSO.prix - 1);
    expect(() => acheteBoosterPerso(db, id, CLE_A)).toThrow(PackError);
    expect(() => acheteBoosterPerso(db, id, CLE_A)).toThrow(/Il te manque 1 ❄/);
    expect(db.players[0].snowflakes).toBe(ACHAT_PERSO.prix - 1);
    expect(persoEnFile(db, id)).toBe(0);
  });

  it('coûte de la chance : le solde qui baisse fait baisser le multiplicateur', () => {
    const { db, id } = base(10_000);
    const avant = multiplicateurChance(db.players[0].snowflakes);
    acheteBoosterPerso(db, id, CLE_A);
    expect(multiplicateurChance(db.players[0].snowflakes)).toBeLessThan(avant);
  });
});
