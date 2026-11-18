import { describe, expect, it } from 'vitest';
import { emptyDatabase } from '@/lib/db/store';
import { parametresSaison } from '@/lib/domain/rules';
import { bilanSaison } from '@/lib/services/bilanSaison';
import { ajouteDonneesFictives } from '@/lib/services/donneesFictives';
import { classementDe } from '@/lib/services/league';

/** Le bilan de la saison (18/11/2026) : ses chiffres sont ceux du classement et des games. */
function ligue(numero: number) {
  const db = emptyDatabase();
  db.config.numero = numero;
  db.config.maxGamesPerPlayer = parametresSaison(numero).games;
  ajouteDonneesFictives(db, 'test', new Date('2026-12-10T12:00:00.000Z'));
  return db;
}

describe('le bilan de la saison', () => {
  it('nomme le premier du classement, et les cinq suivants', () => {
    const db = ligue(1);
    const b = bilanSaison(db);
    const classement = classementDe(db);
    expect(b.tete[0].pseudo).toBe(classement[0].pseudo);
    expect(b.tete.map((j) => j.rang)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.saison.finalistes).toBe(0);
  });

  it('compte les games, les kills et les tops sur les games qui comptent', () => {
    const db = ligue(1);
    const b = bilanSaison(db);
    const comptees = db.games.filter((g) => !g.skipped);
    expect(b.games).toBe(comptees.length);
    expect(b.kills).toBe(comptees.reduce((n, g) => n + g.kills, 0));
    expect(b.top1).toBe(comptees.filter((g) => g.placement === 1).length);
    expect(b.top3).toBeGreaterThanOrEqual(b.top1);
    expect(b.killsParGame).toBeCloseTo(b.kills / b.games, 1);
    expect(b.subs).toBe(db.config.totalSubs);
  });

  it('en saison 2, montre les six finalistes ; la lanterne rouge a joué au moins la moitié des games du plus assidu', () => {
    const db = ligue(2);
    const b = bilanSaison(db);
    expect(b.saison.finalistes).toBe(6);
    expect(b.tete).toHaveLength(6);
    const assidu = Math.max(...classementDe(db).map((r) => r.totals.countedGames));
    expect(b.lanterne).not.toBeNull();
    expect(b.lanterne!.games).toBeGreaterThanOrEqual(Math.floor(assidu / 2));
    expect(b.lanterne!.rang).toBeGreaterThan(6);
  });
});
