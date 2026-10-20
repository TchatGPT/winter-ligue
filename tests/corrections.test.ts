import { describe, expect, it } from 'vitest';
import type { Database, Game, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { rewardForGame } from '@/lib/domain/economy';
import type { Placement } from '@/lib/domain/types';
import { corrigeGame, floconsDeLaGame, supprimeGame } from '@/lib/services/corrections';
import { appliqueCartesEnAttente, carteQuiAttend, regleCartesSansAttendre } from '@/lib/services/effects';
import { recomputeGame } from '@/lib/services/league';
import { credit } from '@/lib/services/ledger';

/**
 * Corriger ou supprimer une game déjà saisie (la capture était mal lue) : le
 * score, les cartes de la game et ses flocons suivent ; une game supprimée
 * rend sa carte et ses flocons.
 */

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

let n = 0;

/** Une carte posée sur un joueur, sans booster : rien n'attend sa révélation. */
function pose(db: Database, joueurId: string, cardId: string) {
  n += 1;
  db.cartesEnAttente.push({
    id: `c${n}`,
    joueurId,
    cardId,
    ouvertureId: `o${n}`,
    creeA: `2027-01-15T19:${String(n % 60).padStart(2, '0')}:00.000Z`,
    consommeeA: null,
    gameId: null,
    resultat: null,
    paireId: null,
  });
}

/** Une game saisie comme la saisit la route : la carte active tombe, les flocons sont versés. */
function saisis(db: Database, joueurId: string, kills: number, placement: Placement): Game {
  n += 1;
  const at = `2027-01-15T20:${String(n % 60).padStart(2, '0')}:00.000Z`;
  const game: Game = {
    id: `g${n}`,
    playerId: joueurId,
    kills,
    placement,
    bonusPoints: 0,
    skipped: false,
    score: 0,
    note: null,
    playedAt: at,
    createdAt: at,
    applied: [],
  };
  db.games.push(game);
  recomputeGame(db, game);
  const cartes = appliqueCartesEnAttente(db, game);
  credit(db, joueurId, Math.round(rewardForGame(kills, placement).total * cartes.facteurFlocons), 'GAME', game.id);
  regleCartesSansAttendre(db, joueurId);
  return game;
}

const solde = (db: Database, id: string) => db.players.find((p) => p.id === id)!.snowflakes;

describe('corriger une game', () => {
  it('réécrit le score et ajuste les flocons de la différence', () => {
    const db = ligue('a');
    const g = saisis(db, 'a', 10, null);
    const avant = solde(db, 'a');
    const r = corrigeGame(db, 'modo', g.id, { kills: 21, placement: 1 });
    if (typeof r === 'string' || 'refus' in r) throw new Error('refusée');
    expect(g.score).toBe(21 + 20);
    const ecart = rewardForGame(21, 1).total - rewardForGame(10, null).total;
    expect(r.flocons).toBe(ecart);
    expect(solde(db, 'a')).toBe(avant + ecart);
    // La game a désormais versé ce qu'elle aurait versé, au grand livre.
    expect(floconsDeLaGame(db, g)).toBe(rewardForGame(21, 1).total);
    expect(db.audit.some((e) => e.action === 'GAME_CORRIGEE')).toBe(true);
  });

  it('reprend des flocons quand la game valait moins, sans jamais passer sous zéro', () => {
    const db = ligue('a');
    const g = saisis(db, 'a', 30, 1);
    // Le joueur a dépensé presque tout ce que la game lui avait rapporté.
    db.players[0].snowflakes = 40;
    corrigeGame(db, 'modo', g.id, { kills: 3, placement: null });
    expect(solde(db, 'a')).toBe(0);
  });

  it('rend son bonus à une Luge quand la game passe en Top 1, et le lui retire sinon', () => {
    const db = ligue('a');
    pose(db, 'a', 'luge');
    const g = saisis(db, 'a', 8, 2);
    // Saisie en Top 2 : la Luge n'a rien donné.
    expect(g.score).toBe(8 + 15);
    corrigeGame(db, 'modo', g.id, { kills: 8, placement: 1 });
    expect(g.score).toBe(8 + 20 + 15);
    expect(g.applied.map((a) => a.points)).toEqual([15]);
    corrigeGame(db, 'modo', g.id, { kills: 8, placement: 3 });
    expect(g.score).toBe(8 + 8);
    expect(g.applied).toHaveLength(0);
  });

  it('relit un multiplicateur sur les nouveaux kills', () => {
    const db = ligue('a');
    pose(db, 'a', 'vent-porteur');
    const g = saisis(db, 'a', 10, null);
    expect(g.score).toBe(10 + 2);
    corrigeGame(db, 'modo', g.id, { kills: 30, placement: null });
    expect(g.score).toBe(30 + 6);
  });

  it('refuse une game dont une carte a changé les kills', () => {
    const db = ligue('a');
    pose(db, 'a', 'echo-lointain');
    const g = saisis(db, 'a', 5, null);
    const r = corrigeGame(db, 'modo', g.id, { kills: 9, placement: null });
    expect(typeof r === 'object' && 'refus' in r).toBe(true);
    expect(g.kills).toBe(5);
  });
});

describe('supprimer une game', () => {
  it('reprend ses flocons, rend sa carte, et la retire', () => {
    const db = ligue('a');
    pose(db, 'a', 'lanterne-givree');
    const g = saisis(db, 'a', 12, 1);
    expect(carteQuiAttend(db, 'a')).toBeNull();
    const r = supprimeGame(db, 'modo', g.id);
    if (typeof r === 'string' || 'refus' in r) throw new Error('refusée');
    expect(db.games).toHaveLength(0);
    expect(solde(db, 'a')).toBe(0);
    expect(r.rendues).toEqual(['Lanterne Givrée']);
    // La carte attend la prochaine game, comme si de rien n'était.
    expect(carteQuiAttend(db, 'a')?.cardId).toBe('lanterne-givree');
  });

  it('perd la carte si le joueur en a déjà une autre en attente : jamais deux', () => {
    const db = ligue('a');
    pose(db, 'a', 'lanterne-givree');
    const g = saisis(db, 'a', 12, 1);
    pose(db, 'a', 'luge');
    const r = supprimeGame(db, 'modo', g.id);
    if (typeof r === 'string' || 'refus' in r) throw new Error('refusée');
    expect(r.perdues).toEqual(['Lanterne Givrée']);
    expect(carteQuiAttend(db, 'a')?.cardId).toBe('luge');
  });

  it('reporte un Feu de Camp sur une autre game', () => {
    const db = ligue('a');
    saisis(db, 'a', 30, null);
    const pire = saisis(db, 'a', 2, null);
    const autre = saisis(db, 'a', 10, null);
    pose(db, 'a', 'feu-de-camp');
    regleCartesSansAttendre(db, 'a');
    expect(pire.applied).toHaveLength(1);
    // La pire game était une erreur : supprimée, la carte relève la suivante.
    supprimeGame(db, 'modo', pire.id);
    expect(autre.applied).toHaveLength(1);
    expect(carteQuiAttend(db, 'a')).toBeNull();
  });
});
