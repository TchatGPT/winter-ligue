import { describe, expect, it } from 'vitest';
import type { Database, Game, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { cartesDuPack, getCard, momentDe, PACKS, TROC_SUBI } from '@/lib/domain/catalog';
import { JOKERS } from '@/lib/domain/rules';
import { scoreGame } from '@/lib/domain/scoring';
import type { Placement } from '@/lib/domain/types';
import { jokersDe, joueEchangeCible, joueFigeGarde, regleCartesSansAttendre } from '@/lib/services/effects';
import { pointsHorsGame } from '@/lib/services/league';

/**
 * Les cartes de la Summer : les actions de ses roues, en cartes du Commu, du
 * Folie et du Finisseur (décidé par l'organisation le 03/11/2026). Elles se
 * règlent tout de suite, une seule fois pour tous les joueurs tirés.
 */

const MAINTENANT = new Date('2027-01-20T12:00:00.000Z');

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

function base(...ids: string[]): Database {
  const db = emptyDatabase();
  for (const id of ids) db.players.push(joueur(id));
  return db;
}

let n = 0;

function game(db: Database, playerId: string, kills: number, placement: Placement = null): Game {
  n += 1;
  const g: Game = {
    id: `g${n}`,
    playerId,
    kills,
    placement,
    bonusPoints: 0,
    skipped: false,
    score: scoreGame({ kills, placement, bonusPoints: 0 }).total,
    note: null,
    playedAt: `2027-01-15T20:${String(n % 60).padStart(2, '0')}:00.000Z`,
    createdAt: `2027-01-15T20:${String(n % 60).padStart(2, '0')}:00.000Z`,
    applied: [],
  };
  db.games.push(g);
  return g;
}

/** Une ouverture de la carte sur ces joueurs, déjà révélée, puis réglée une fois. */
function ouvre(db: Database, cardId: string, ids: string[], le = '2027-01-20T11:00:00.000Z'): string {
  n += 1;
  const ouvertureId = `o${n}`;
  db.ouvertures.push({
    id: ouvertureId,
    packId: getCard(cardId)!.packs[0],
    cardId,
    rarity: getCard(cardId)!.rarity,
    joueurId: null,
    beneficiaires: ids,
    chance: 0,
    ouvertPar: 'modo',
    openedAt: le,
    idempotencyKey: ouvertureId,
    annonceeA: le,
  });
  ids.forEach((id, i) =>
    db.cartesEnAttente.push({
      id: `${ouvertureId}-${i}`,
      joueurId: id,
      cardId,
      ouvertureId,
      creeA: le,
      consommeeA: null,
      gameId: null,
      resultat: null,
      paireId: null,
    }),
  );
  regleCartesSansAttendre(db, ids[0], MAINTENANT);
  return ouvertureId;
}

const cartesDe = (db: Database, ouvertureId: string) => db.cartesEnAttente.filter((c) => c.ouvertureId === ouvertureId);
const total = (db: Database, id: string) =>
  db.games.filter((g) => g.playerId === id && !g.skipped).reduce((s, g) => s + g.score, 0) + pointsHorsGame(db, id);
const immunise = (db: Database, id: string) => {
  db.players.find((p) => p.id === id)!.immuniseJusqua = '2027-02-01T00:00:00.000Z';
};

describe('les boosters de la Summer', () => {
  it('Commu, Folie et Finisseur tirent les cartes de la Summer : 15, 7 et 9', () => {
    // 12/11/2026 : « Booster Commu tous les 20 subs » et « Meilleure game aux
    // 5 derniers » retirées, la Cryogénisation ajoutée au Folie.
    expect(cartesDuPack('commu')).toHaveLength(15);
    expect(cartesDuPack('folie')).toHaveLength(7);
    expect(cartesDuPack('finisseur')).toHaveLength(9);
    // Le Perso garde les siennes : aucune carte de la Summer n'en sort.
    for (const c of cartesDuPack('perso')) expect(c.effect.kind).not.toBe('roue');
    // Et rien ne reste en attente : elles se règlent tout de suite, ou se gardent.
    for (const pack of PACKS.filter((p) => p.id !== 'perso')) {
      for (const c of cartesDuPack(pack.id)) expect(['INSTANT', 'GARDEE']).toContain(momentDe(c.effect));
    }
  });

  it('règle une action une seule fois pour tout le groupe tiré', () => {
    const db = base('a', 'b', 'c');
    for (const id of ['a', 'b', 'c']) game(db, id, 10);
    const o = ouvre(db, 'degel-double', ['a', 'b', 'c']);
    // Une seule règle, pour le premier : toutes les cartes du groupe sont réglées.
    expect(cartesDe(db, o).every((c) => c.consommeeA !== null)).toBe(true);
    // Chacun a vu sa pire game doublée, une fois.
    for (const id of ['a', 'b', 'c']) expect(total(db, id)).toBe(20);
  });
});

describe('les cartes de toute la ligue', () => {
  it('« Flocon de Plus » verse 100 flocons à chacun, au grand livre', () => {
    const db = base('a', 'b', 'c');
    const o = ouvre(db, 'flocon-de-plus', ['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) {
      expect(db.players.find((p) => p.id === id)!.snowflakes).toBe(100);
      expect(db.ledger.filter((l) => l.playerId === id && l.refId === o)).toHaveLength(1);
    }
    expect(cartesDe(db, o).every((c) => c.resultat === '+100 flocons')).toBe(true);
  });

  it('« Meilleure game ×1,5 » relève la meilleure game libre de chacun', () => {
    const db = base('a', 'b');
    game(db, 'a', 20);
    game(db, 'a', 4);
    game(db, 'b', 10);
    ouvre(db, 'cime-eclatante', ['a', 'b']);
    expect(total(db, 'a')).toBe(30 + 4);
    expect(total(db, 'b')).toBe(15);
  });

  it('« Pire game à 0 » frappe même une game touchée, pas une game figée ni un immunisé', () => {
    const db = base('a', 'b', 'c');
    game(db, 'a', 12);
    const petite = game(db, 'a', 3);
    // Déjà doublée par une carte : la remise à zéro la frappe quand même.
    ouvre(db, 'degel-double', ['a']);
    expect(petite.score).toBe(6);
    game(db, 'b', 8);
    game(db, 'b', 9);
    immunise(db, 'c');
    game(db, 'c', 5);
    ouvre(db, 'nuit-blanche', ['a', 'b', 'c']);
    expect(petite.score).toBe(0);
    expect(total(db, 'b')).toBe(9);
    expect(total(db, 'c')).toBe(5);
  });

  it('« Échange général » fait tourner les scores en chaîne, sans créer de point', () => {
    const db = base('a', 'b', 'c', 'd');
    game(db, 'a', 5);
    game(db, 'b', 10);
    game(db, 'c', 20);
    immunise(db, 'd');
    game(db, 'd', 30);
    const avant = ['a', 'b', 'c'].reduce((s, id) => s + total(db, id), 0);
    ouvre(db, 'blizzard-general', ['a', 'b', 'c', 'd']);
    expect(['a', 'b', 'c'].reduce((s, id) => s + total(db, id), 0)).toBe(avant);
    // Chacun a reçu une autre game que la sienne.
    expect(new Set(['a', 'b', 'c'].map((id) => total(db, id)))).toEqual(new Set([5, 10, 20]));
    expect(['a', 'b', 'c'].some((id, i) => total(db, id) !== [5, 10, 20][i])).toBe(true);
    // L'immunisé reste hors de la chaîne.
    expect(total(db, 'd')).toBe(30);
  });

  it('« 1 Joker pour tout le monde » s’arrête à la limite de la main', () => {
    const db = base('a', 'b');
    ouvre(db, 'pluie-de-jokers', ['a', 'b']);
    expect(jokersDe(db, 'a')).toHaveLength(1);
    for (let i = 0; i < 6; i += 1) ouvre(db, 'pluie-de-jokers', ['a', 'b']);
    expect(jokersDe(db, 'a')).toHaveLength(JOKERS.max);
  });

  it('« Meilleure game ×1,5 » se cumule avec une carte du Perso, mais une seule fois par game', () => {
    const db = base('a');
    const meilleure = game(db, 'a', 20);
    game(db, 'a', 10);
    // Déjà ×1,2 par une carte du Perso : le ×1,5 s'y ajoute.
    meilleure.applied.push({ id: 'x', cardId: 'vent-porteur', ouvertureId: 'ox', points: 4, at: '2027-01-15T20:00:00.000Z' });
    meilleure.bonusPoints = 4;
    meilleure.score = 24;
    ouvre(db, 'cime-eclatante', ['a']);
    expect(meilleure.score).toBe(36);
    // Une seconde : pas sur la même game, sur la suivante.
    ouvre(db, 'cime-eclatante', ['a']);
    expect(meilleure.score).toBe(36);
    expect(total(db, 'a')).toBe(36 + 15);
  });

  it('« +5 pts par Top 1 » compte les Top 1 depuis la dernière fois que la carte est tombée', () => {
    const db = base('a');
    game(db, 'a', 3, 1);
    game(db, 'a', 3, 1);
    ouvre(db, 'couronnes-de-givre', ['a'], '2027-01-18T00:00:00.000Z');
    expect(pointsHorsGame(db, 'a')).toBe(10);
    // Un nouveau Top 1 après : la carte suivante ne compte que lui.
    const nouveau = game(db, 'a', 3, 1);
    nouveau.createdAt = '2027-01-19T00:00:00.000Z';
    ouvre(db, 'couronnes-de-givre', ['a'], '2027-01-20T00:00:00.000Z');
    expect(pointsHorsGame(db, 'a')).toBe(15);
  });
});

describe('les cartes qui tirent des joueurs', () => {
  it('« Roulette russe » : celui qui ne passe pas la ligne — en tête du tirage — perd sa meilleure game', () => {
    const db = base('a', 'b', 'c');
    for (const id of ['a', 'b', 'c']) {
      game(db, id, 20);
      game(db, id, 5);
    }
    ouvre(db, 'barillet-de-glace', ['b', 'a', 'c']);
    expect(db.games.filter((g) => g.skipped).map((g) => g.playerId)).toEqual(['b']);
  });

  it('« Roulette russe » : un seul des tirés perd sa meilleure game', () => {
    const db = base('a', 'b', 'c', 'd', 'e', 'f');
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
      game(db, id, 20);
      game(db, id, 5);
    }
    ouvre(db, 'barillet-de-glace', ['a', 'b', 'c', 'd', 'e', 'f']);
    const perdues = db.games.filter((g) => g.skipped);
    expect(perdues).toHaveLength(1);
    expect(perdues[0].score).toBe(20);
  });

  it('« Vol de score » prend le total du joueur juste au-dessus, qui garde le sien', () => {
    const db = base('haut', 'bas');
    game(db, 'haut', 40);
    game(db, 'bas', 10);
    ouvre(db, 'voleur-d-hiver', ['bas']);
    expect(total(db, 'bas')).toBe(40);
    expect(total(db, 'haut')).toBe(40);
  });

  it('« Clone meilleure → joueur aléatoire » ajoute la meilleure game de la ligue', () => {
    const db = base('a', 'b');
    game(db, 'a', 33);
    game(db, 'b', 6);
    ouvre(db, 'miroir-des-cimes', ['b']);
    expect(total(db, 'b')).toBe(6 + 33);
    expect(total(db, 'a')).toBe(33);
  });

  it('« Échange meilleure ↔ pire » tombe si celui qui y perdrait est immunisé', () => {
    const db = base('a', 'b');
    game(db, 'a', 30);
    game(db, 'b', 5);
    immunise(db, 'a');
    ouvre(db, 'contre-vent', ['a', 'b']);
    expect(total(db, 'a')).toBe(30);
    expect(total(db, 'b')).toBe(5);
  });
});

describe('les cartes du Finisseur', () => {
  it('« Fusion des 2 pires games » : une game qui vaut leur somme, et un créneau rendu', () => {
    const db = base('a');
    game(db, 'a', 30);
    game(db, 'a', 4);
    game(db, 'a', 6);
    ouvre(db, 'soudure-de-glace', ['a']);
    expect(total(db, 'a')).toBe(40);
    expect(db.games.filter((g) => !g.skipped)).toHaveLength(2);
  });

  it('« Pas de chance » ne change rien', () => {
    const db = base('a');
    game(db, 'a', 10);
    ouvre(db, 'neige-fondue', ['a']);
    expect(total(db, 'a')).toBe(10);
  });

  it('le Troc des Neiges : une fois par joueur, sauf la revanche ; jamais sur un immunisé', () => {
    const db = base('a', 'b', 'c');
    game(db, 'a', 4);
    game(db, 'b', 30);
    game(db, 'c', 25);
    const garde = (id: string, quand: string) => {
      n += 1;
      db.cartesEnAttente.push({
        id: `troc${n}`,
        joueurId: id,
        cardId: 'troc-des-neiges',
        ouvertureId: `ot${n}`,
        creeA: quand,
        consommeeA: null,
        gameId: null,
        resultat: null,
        paireId: null,
      });
      return `troc${n}`;
    };
    const b = db.players.find((p) => p.id === 'b')!;
    const c = db.players.find((p) => p.id === 'c')!;
    const a = db.players.find((p) => p.id === 'a')!;

    // a vise b : sa pire game (4) prend les 30 de la meilleure de b.
    const r = joueEchangeCible(db, garde('a', '2027-01-15T10:00:00.000Z'), b, MAINTENANT);
    expect(typeof r).not.toBe('string');
    expect(total(db, 'a')).toBe(30);
    expect(total(db, 'b')).toBe(4);
    expect(db.cartesEnAttente.some((x) => x.cardId === TROC_SUBI.id && x.joueurId === 'b' && x.paireId === 'a')).toBe(true);

    // Un second Troc pour a : refusé.
    game(db, 'a', 2);
    expect(joueEchangeCible(db, garde('a', '2027-01-16T10:00:00.000Z'), c, MAINTENANT)).toBe('DEJA');

    // Jamais sur un immunisé.
    immunise(db, 'c');
    expect(joueEchangeCible(db, garde('b', '2027-01-17T10:00:00.000Z'), c, MAINTENANT)).toBe('IMMUNISE');

    // b, visé par a, joue le sien sur a : la revanche passe même après un premier Troc.
    game(db, 'b', 1);
    const revanche = joueEchangeCible(db, garde('b', '2027-01-18T10:00:00.000Z'), a, MAINTENANT);
    expect(typeof revanche).not.toBe('string');
  });
});

describe('la Cryogénisation', () => {
  it('se garde, puis fige la meilleure game libre quand on la joue — jamais la pire', () => {
    const db = base('a');
    const meilleure = game(db, 'a', 25);
    const pire = game(db, 'a', 2);
    const o = ouvre(db, 'cryogenisation', ['a']);
    const carte = cartesDe(db, o)[0];
    // Gardée : rien ne s'est passé à l'ouverture.
    expect(carte.consommeeA).toBeNull();
    const r = joueFigeGarde(db, carte.id);
    expect(typeof r).not.toBe('string');
    expect(carte.gameId).toBe(meilleure.id);
    expect(meilleure.applied.map((a) => a.cardId)).toEqual(['cryogenisation']);
    expect(pire.applied).toHaveLength(0);
  });

  it('reste en main s’il n’y a que la pire game à figer', () => {
    const db = base('a');
    game(db, 'a', 3);
    const o = ouvre(db, 'cryogenisation', ['a']);
    const carte = cartesDe(db, o)[0];
    expect(joueFigeGarde(db, carte.id)).toBe('GAMES');
    expect(carte.consommeeA).toBeNull();
  });
});
