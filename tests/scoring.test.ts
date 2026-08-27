import { describe, expect, it } from 'vitest';
import { clampMultiplier, rank, round2, scoreGame, totalsFor } from '@/lib/domain/scoring';
import type { ScoredGame } from '@/lib/domain/scoring';

describe('score d’une game', () => {
  it('applique le multiplicateur aux kills seulement', () => {
    const result = scoreGame({ kills: 10, placement: 1, multiplier: 1.5, bonusPoints: 0 });
    // 10 × 1,5 = 15 kills-points, + 20 de Top 1 — le Top 1 n'est pas multiplié.
    expect(result.killPoints).toBe(15);
    expect(result.placementPoints).toBe(20);
    expect(result.total).toBe(35);
  });

  it('additionne les bonus après le multiplicateur', () => {
    const result = scoreGame({ kills: 8, placement: null, multiplier: 1.3, bonusPoints: 25 });
    expect(result.killPoints).toBe(10.4);
    expect(result.total).toBe(35.4);
  });

  it('applique le bonus permanent de la famille Tempête', () => {
    const sans = scoreGame({ kills: 20, placement: null, multiplier: 1, bonusPoints: 0 });
    const avec = scoreGame({ kills: 20, placement: null, multiplier: 1, bonusPoints: 0 }, 0.05);
    expect(sans.total).toBe(20);
    expect(avec.total).toBe(21);
  });

  it('borne les entrées aberrantes plutôt que de les propager', () => {
    // Une requête forgée avec des valeurs absurdes ne peut pas gonfler un score.
    expect(scoreGame({ kills: 99999, placement: null, multiplier: 50, bonusPoints: 0 }).total).toBe(
      180,
    );
    expect(scoreGame({ kills: -5, placement: null, multiplier: 0.1, bonusPoints: 0 }).total).toBe(0);
    expect(clampMultiplier(Number.NaN)).toBe(1);
  });

  it('arrondit sans dérive de virgule flottante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('totaux et classement', () => {
  const game = (id: string, score: number, extra: Partial<ScoredGame> = {}): ScoredGame => ({
    id,
    kills: 5,
    placement: null,
    score,
    skipped: false,
    frozen: false,
    playedAt: '2026-12-01T12:00:00.000Z',
    ...extra,
  });

  it('exclut les games passées du total', () => {
    const totals = totalsFor([game('a', 30), game('b', 50, { skipped: true }), game('c', 20)]);
    expect(totals.totalScore).toBe(50);
    expect(totals.countedGames).toBe(2);
    expect(totals.bestGameId).toBe('a');
    expect(totals.worstGameId).toBe('c');
  });

  it('départage les égalités par Top 1, puis kills, puis meilleure game', () => {
    const alice = totalsFor([game('a1', 50, { placement: 1 })]);
    const bob = totalsFor([game('b1', 50, { kills: 40 })]);

    const classement = rank([
      { player: { id: 'b', pseudo: 'Bob' }, totals: bob },
      { player: { id: 'a', pseudo: 'Alice' }, totals: alice },
    ]);

    expect(classement[0].player.pseudo).toBe('Alice');
    expect(classement[0].rank).toBe(1);
  });

  it('est stable à égalité parfaite (ordre alphabétique)', () => {
    const même = totalsFor([game('x', 10)]);
    const premier = rank([
      { player: { id: 'z', pseudo: 'Zoe' }, totals: même },
      { player: { id: 'a', pseudo: 'Ana' }, totals: même },
    ]);
    expect(premier[0].player.pseudo).toBe('Ana');
  });
});
