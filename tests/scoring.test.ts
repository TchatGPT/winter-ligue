import { describe, expect, it } from 'vitest';
import { rank, round2, scoreGame, totalsFor } from '@/lib/domain/scoring';
import type { ScoredGame } from '@/lib/domain/scoring';

describe('score d’une game', () => {
  it('additionne kills, classement et bonus de cartes', () => {
    const result = scoreGame({ kills: 10, placement: 1, bonusPoints: 0 });
    expect(result.killPoints).toBe(10);
    expect(result.placementPoints).toBe(20);
    expect(result.total).toBe(30);
  });

  it('compte les bonus de cartes, positifs comme négatifs', () => {
    expect(scoreGame({ kills: 8, placement: null, bonusPoints: 12 }).total).toBe(20);
    expect(scoreGame({ kills: 8, placement: null, bonusPoints: -6 }).total).toBe(2);
  });

  it('applique le bonus permanent de la famille Tempête aux kills seuls', () => {
    const sans = scoreGame({ kills: 20, placement: 1, bonusPoints: 0 });
    const avec = scoreGame({ kills: 20, placement: 1, bonusPoints: 0 }, 0.07);
    // +7 % sur les 20 kills, mais les 20 points de Top 1 ne bougent pas.
    expect(sans.total).toBe(40);
    expect(avec.total).toBe(41.4);
  });

  it('borne les entrées aberrantes plutôt que de les propager', () => {
    // Une requête forgée avec des valeurs absurdes ne peut pas gonfler un score.
    expect(scoreGame({ kills: 99999, placement: null, bonusPoints: 0 }).total).toBe(60);
    expect(scoreGame({ kills: -5, placement: null, bonusPoints: 0 }).total).toBe(0);
    expect(scoreGame({ kills: 0, placement: null, bonusPoints: 9999 }).total).toBe(80);
    expect(scoreGame({ kills: 0, placement: null, bonusPoints: -9999 }).total).toBe(-80);
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
