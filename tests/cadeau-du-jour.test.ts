import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { boosterDuJour, jourDeParis, jourDuCycle, montantDuJour, serieDuJour, veille } from '@/lib/domain/cadeauDuJour';
import { CADEAU_DU_JOUR, ECONOMY } from '@/lib/domain/rules';
import { CadeauError, etatCadeau, prendsCadeauDuJour } from '@/lib/services/cadeauDuJour';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

/**
 * Le cadeau du jour : une fois par jour à Paris, quarante flocons, un Booster
 * Perso le septième jour d'affilée, et seulement après une première game.
 */

describe('le calendrier du cadeau', () => {
  it('change de jour à minuit, heure de Paris', () => {
    // 23 h 30 UTC le 1er décembre : 0 h 30 le 2 à Paris.
    expect(jourDeParis(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02');
    expect(jourDeParis(new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-01');
    expect(veille('2026-12-01')).toBe('2026-11-30');
    expect(veille('2027-01-01')).toBe('2026-12-31');
  });

  it('allonge la série d’un jour à l’autre, et la fait repartir après un trou', () => {
    expect(serieDuJour(null, 0, '2026-12-02')).toBe(1);
    expect(serieDuJour('2026-12-01', 3, '2026-12-02')).toBe(4);
    expect(serieDuJour('2026-11-29', 3, '2026-12-02')).toBe(1);
  });

  it('vaut quarante flocons, un Booster Perso le septième jour, puis recommence', () => {
    const semaines = Array.from({ length: 14 }, (_, i) => montantDuJour(i + 1));
    expect(semaines).toEqual([40, 40, 40, 40, 40, 40, 0, 40, 40, 40, 40, 40, 40, 0]);
    const boosters = Array.from({ length: 14 }, (_, i) => boosterDuJour(i + 1));
    expect(boosters.filter(Boolean)).toHaveLength(2);
    expect(boosters[6] && boosters[13]).toBe(true);
    expect(jourDuCycle(7)).toBe(7);
    expect(jourDuCycle(8)).toBe(1);
  });

  it('rapporte trois mille flocons et douze Boosters Perso sur trois mois sans en manquer un', () => {
    const total = Array.from({ length: 90 }, (_, i) => montantDuJour(i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBe(78 * CADEAU_DU_JOUR.parJour);
    expect(Array.from({ length: 90 }, (_, i) => boosterDuJour(i + 1)).filter(Boolean)).toHaveLength(12);
    expect(total).toBeLessThan(ECONOMY.soldeMax / 5);
  });
});

describe('prendre le cadeau du jour', () => {
  const T0 = new Date('2026-12-01T18:00:00Z');
  const JOUR = 86_400_000;

  function base(avecGame = true): { db: Database; id: string } {
    const db = emptyDatabase();
    const p = rattacheCompteTwitch(db, {
      id: 'tw-a',
      login: 'alpha',
      displayName: 'Alpha',
      avatarUrl: null,
      roleChaine: 'joueur',
    });
    if (avecGame) {
      db.games.push({ id: 'g1', playerId: p.id, kills: 5, placement: null, skipped: false } as Database['games'][number]);
    }
    return { db, id: p.id };
  }

  it('crédite le joueur une fois par jour, au grand livre', () => {
    const { db, id } = base();
    const r = prendsCadeauDuJour(db, id, T0);
    expect(r).toMatchObject({ montant: CADEAU_DU_JOUR.parJour, recu: CADEAU_DU_JOUR.parJour, serie: 1, jour: 1 });
    expect(db.players[0].snowflakes).toBe(CADEAU_DU_JOUR.parJour);
    expect(db.ledger.at(-1)).toMatchObject({ reason: 'CADEAU_DU_JOUR', refId: '2026-12-01' });
    expect(() => prendsCadeauDuJour(db, id, T0)).toThrow(CadeauError);
    expect(etatCadeau(db, id, T0)).toMatchObject({ dejaPris: true, serie: 1 });
  });

  it('suit la série jusqu’au septième jour, puis recommence la semaine', () => {
    const { db, id } = base();
    let total = 0;
    for (let j = 0; j < 7; j += 1) total += prendsCadeauDuJour(db, id, new Date(T0.getTime() + j * JOUR)).recu;
    // Six jours de flocons, puis le Booster Perso, à son nom, sans flocons.
    expect(total).toBe(6 * CADEAU_DU_JOUR.parJour);
    expect(db.packsDus).toHaveLength(1);
    expect(db.packsDus[0]).toMatchObject({ packId: 'perso', joueurId: id, ouvertureId: null });
    expect(db.ledger.filter((l) => l.reason === 'CADEAU_DU_JOUR')).toHaveLength(6);
    expect(etatCadeau(db, id, new Date(T0.getTime() + 7 * JOUR))).toMatchObject({ serie: 8, jour: 1, booster: false });
  });

  it('garde le jour du booster ouvert à solde plein, et ferme les jours de flocons', () => {
    const { db, id } = base();
    for (let j = 0; j < 6; j += 1) prendsCadeauDuJour(db, id, new Date(T0.getTime() + j * JOUR));
    db.players[0].snowflakes = ECONOMY.soldeMax;
    const septieme = new Date(T0.getTime() + 6 * JOUR);
    expect(etatCadeau(db, id, septieme)).toMatchObject({ booster: true, plein: false });
    expect(prendsCadeauDuJour(db, id, septieme).booster).toBe(true);
    expect(db.packsDus).toHaveLength(1);
    expect(() => prendsCadeauDuJour(db, id, new Date(T0.getTime() + 7 * JOUR))).toThrow(CadeauError);
  });

  it('fait repartir la série après un jour manqué', () => {
    const { db, id } = base();
    prendsCadeauDuJour(db, id, T0);
    prendsCadeauDuJour(db, id, new Date(T0.getTime() + JOUR));
    expect(prendsCadeauDuJour(db, id, new Date(T0.getTime() + 3 * JOUR)).serie).toBe(1);
  });

  it('attend la première game', () => {
    const { db, id } = base(false);
    expect(etatCadeau(db, id, T0)).toMatchObject({ eligible: false });
    expect(() => prendsCadeauDuJour(db, id, T0)).toThrow(CadeauError);
    expect(db.players[0].snowflakes).toBe(0);
  });

  it('fait démarrer un nouveau joueur à zéro flocon, sans ligne au grand livre', () => {
    const { db } = base(false);
    expect(db.players[0].snowflakes).toBe(0);
    expect(db.ledger).toHaveLength(0);
  });
});
