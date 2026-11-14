import { describe, expect, it } from 'vitest';
import type { Database, Game, OuverturePack, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { scoreGame } from '@/lib/domain/scoring';
import { choisitGamesRoue, regleCartesSansAttendre } from '@/lib/services/effects';
import { tirageDe, vueOuverture } from '@/lib/services/packs';

/**
 * Le troisième tirage d'une ouverture (12/11/2026) : la game, ou les games,
 * qu'une carte des roues touche. Le serveur les choisit à l'ouverture,
 * l'écran les déroule, et la carte, révélée, frappe celles-là — pas d'autres.
 */

const MAINTENANT = new Date('2027-01-20T12:00:00.000Z');

function joueur(id: string): Player {
  return {
    id,
    slug: id,
    pseudo: id.toUpperCase(),
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

let n = 0;

function game(db: Database, playerId: string, kills: number): Game {
  n += 1;
  const le = new Date(Date.parse('2027-01-10T20:00:00.000Z') + n * 60_000).toISOString();
  const g: Game = {
    id: `g${n}`,
    playerId,
    kills,
    placement: null,
    bonusPoints: 0,
    skipped: false,
    score: scoreGame({ kills, placement: null, bonusPoints: 0 }).total,
    note: null,
    playedAt: le,
    createdAt: le,
    applied: [],
  };
  db.games.push(g);
  return g;
}

/** Une ligue de joueurs, chacun avec dix games de 1 à 10 kills. */
function ligue(...ids: string[]): Database {
  const db = emptyDatabase();
  for (const id of ids) {
    db.players.push(joueur(id));
    for (let k = 1; k <= 10; k += 1) game(db, id, k);
  }
  return db;
}

/** Ouvre la carte comme `ouvrePack` : les games tirées, puis la carte posée — pas encore révélée. */
function ouvre(db: Database, cardId: string, ids: string[], pour: string | null = null): OuverturePack {
  n += 1;
  const card = getCard(cardId)!;
  const joueurs = ids.map((id) => db.players.find((p) => p.id === id)!);
  const o: OuverturePack = {
    id: `o${n}`,
    packId: card.packs[0],
    cardId,
    rarity: card.rarity,
    joueurId: pour,
    beneficiaires: ids,
    chance: 0,
    ouvertPar: 'modo',
    openedAt: '2027-01-20T11:00:00.000Z',
    idempotencyKey: `o${n}`,
    annonceeA: null,
    games: choisitGamesRoue(db, card, joueurs),
  };
  db.ouvertures.push(o);
  ids.forEach((id, i) =>
    db.cartesEnAttente.push({
      id: `${o.id}-${i}`,
      joueurId: id,
      cardId,
      ouvertureId: o.id,
      creeA: o.openedAt,
      consommeeA: null,
      gameId: null,
      resultat: null,
      paireId: null,
    }),
  );
  return o;
}

/** La carte apparaît à l'écran : elle se règle. */
function revele(db: Database, o: OuverturePack) {
  o.annonceeA = '2027-01-20T11:01:00.000Z';
  regleCartesSansAttendre(db, o.beneficiaires[0], MAINTENANT);
}

const touchee = (db: Database, cardId: string, playerId: string) =>
  db.games.filter((g) => g.playerId === playerId && g.applied.some((a) => a.cardId === cardId));

describe('le tirage des games', () => {
  it('« Tonnerre de Neige » tire une game par joueur, et la carte frappe celle-là', () => {
    for (let essai = 0; essai < 6; essai += 1) {
      const db = ligue('a', 'b', 'c');
      const o = ouvre(db, 'triple-echo', ['a', 'b', 'c']);
      expect(o.games).toMatchObject({ hasard: true, lien: null });
      expect(o.games!.parJoueur).toHaveLength(3);
      const visees = o.games!.parJoueur.map((e) => e!.visees[0].id);
      o.games!.parJoueur.forEach((e) => {
        expect(e!.parmi.map((g) => g.id)).toContain(e!.visees[0].id);
        expect(e!.parmi).toHaveLength(10);
      });
      revele(db, o);
      ['a', 'b', 'c'].forEach((id, i) => expect(touchee(db, 'triple-echo', id).map((g) => g.id)).toEqual([visees[i]]));
    }
  });

  it('« Vents Croisés » échange les deux games tirées, et seulement elles', () => {
    for (let essai = 0; essai < 6; essai += 1) {
      const db = ligue('a', 'b');
      const o = ouvre(db, 'neige-melee', ['a', 'b']);
      expect(o.games).toMatchObject({ hasard: true, lien: 'echange' });
      const [ga, gb] = o.games!.parJoueur.map((e) => db.games.find((g) => g.id === e!.visees[0].id)!);
      const [sa, sb] = [ga.score, gb.score];
      revele(db, o);
      if (sa !== sb) {
        expect(ga.score).toBe(sb);
        expect(gb.score).toBe(sa);
      }
    }
  });

  it('« Brouillard Givrant » ne tire jamais la pire ni la meilleure game', () => {
    for (let essai = 0; essai < 20; essai += 1) {
      const db = ligue('a', 'b', 'c');
      const o = ouvre(db, 'givre-errant', ['a', 'b', 'c']);
      for (const e of o.games!.parJoueur) {
        const scores = e!.parmi.map((g) => g.score);
        expect(scores).toHaveLength(8);
        expect(e!.visees[0].numero).toBeGreaterThan(1);
        expect(e!.visees[0].numero).toBeLessThan(10);
      }
      revele(db, o);
      o.games!.parJoueur.forEach((e, i) =>
        expect(touchee(db, 'givre-errant', ['a', 'b', 'c'][i]).map((g) => g.id)).toEqual([e!.visees[0].id]),
      );
    }
  });

  it('« Inversion Polaire » désigne ses games sans hasard : la meilleure du premier, la pire du second', () => {
    const db = ligue('a', 'b');
    const o = ouvre(db, 'contre-vent', ['a', 'b']);
    expect(o.games).toMatchObject({ hasard: false, lien: 'echange' });
    expect(o.games!.parJoueur[0]).toMatchObject({ libelle: 'sa meilleure game', visees: [{ numero: 10 }] });
    expect(o.games!.parJoueur[1]).toMatchObject({ libelle: 'sa pire game', visees: [{ numero: 1 }] });
  });

  it('« Inversion Polaire » prend la meilleure game même si une carte l’a doublée — pas une game figée (13/11/2026)', () => {
    const db = ligue('a', 'b');
    const top = db.games.filter((g) => g.playerId === 'a').sort((x, y) => y.score - x.score)[0];
    top.applied.push({ id: 'x2', cardId: 'congere', ouvertureId: 'o', points: 5, at: top.createdAt });
    top.score += 5;
    let o = ouvre(db, 'contre-vent', ['a', 'b']);
    expect(o.games!.parJoueur[0]!.visees[0].id).toBe(top.id);
    // Figée, elle est protégée : c'est la suivante qui part.
    top.applied.push({ id: 'f', cardId: 'cryogenisation', ouvertureId: 'o', points: 0, at: top.createdAt });
    o = ouvre(db, 'contre-vent', ['a', 'b']);
    expect(o.games!.parJoueur[0]!.visees[0].id).not.toBe(top.id);
  });

  it('une carte pour toute la ligue ne déroule pas de games', () => {
    const db = ligue('a', 'b', 'c', 'd');
    expect(choisitGamesRoue(db, getCard('cime-eclatante')!, db.players)).toBeNull();
    // Ni une carte qui ne prend pas de game.
    expect(choisitGamesRoue(db, getCard('voleur-d-hiver')!, db.players.slice(0, 1))).toBeNull();
  });

  it('la Roulette russe montre la meilleure game du seul perdant', () => {
    const db = ligue('a', 'b', 'c', 'd', 'e', 'f');
    const o = ouvre(db, 'barillet-de-glace', ['c', 'a', 'b', 'd', 'e', 'f']);
    expect(o.games!.parJoueur[0]).toMatchObject({ pseudo: 'C', visees: [{ numero: 10 }] });
    expect(o.games!.parJoueur.slice(1).every((e) => e === null)).toBe(true);
  });

  it('un Finisseur ouvert pour un joueur ne déroule que ses games, sans identifiant', () => {
    const db = ligue('a');
    const o = ouvre(db, 'soudure-de-glace', ['a'], 'a');
    const tirage = tirageDe(db, o);
    expect(tirage).toMatchObject({ sansJoueurs: true, gagnants: ['A'], games: { hasard: false, lien: 'fusion' } });
    expect(tirage!.games!.parJoueur[0]!.visees.map((g) => g.numero)).toEqual([1, 2]);
    expect(JSON.stringify(tirage)).not.toMatch(/"id"|joueurId/);
  });
});

describe('le compte rendu d’une ouverture', () => {
  it('« Vents Croisés » : qui a échangé quelle game, et ce que chacun y gagne ou y perd', () => {
    const db = ligue('a', 'b');
    // Les games de B valent toutes plus que celles de A : l'un gagne, l'autre perd.
    for (const g of db.games.filter((x) => x.playerId === 'b')) {
      g.kills += 10;
      g.score = scoreGame({ kills: g.kills, placement: null, bonusPoints: 0 }).total;
    }
    const o = ouvre(db, 'neige-melee', ['a', 'b']);
    const [ea, eb] = o.games!.parJoueur;
    const ga = db.games.find((g) => g.id === ea!.visees[0].id)!;
    const gb = db.games.find((g) => g.id === eb!.visees[0].id)!;
    const [sa, sb] = [ga.score, gb.score];
    revele(db, o);
    const vue = vueOuverture(db, o);
    const de = (pseudo: string) => vue.effets.find((e) => e.pseudo === pseudo)!;
    expect(de('A').bilan).toBe(sb - sa);
    expect(de('B').bilan).toBe(sa - sb);
    expect(de('A').resultat).toContain(`échange sa game ${ea!.visees[0].numero} (`);
    expect(de('A').resultat).toContain(`la game ${eb!.visees[0].numero} de B`);
    const gagnant = sb > sa ? 'A' : 'B';
    expect(de(gagnant).sens).toBe('gain');
    expect(de(gagnant === 'A' ? 'B' : 'A').sens).toBe('perte');
    // Celui qui gagne en tête.
    expect(vue.effets[0].pseudo).toBe(gagnant);
  });

  it('« Tonnerre de Neige » : trois gains, la game doublée nommée', () => {
    const db = ligue('a', 'b', 'c');
    const o = ouvre(db, 'triple-echo', ['a', 'b', 'c']);
    revele(db, o);
    const vue = vueOuverture(db, o);
    expect(vue.effets).toHaveLength(3);
    vue.effets.forEach((e) => {
      expect(e.sens).toBe('gain');
      expect(e.bilan).toBeGreaterThan(0);
      expect(e.resultat).toMatch(/tirée au sort, la game \d+ \(\d+ pts\), ×2/);
    });
  });

  it('« Fonte des Neiges » : la pire game rendue est un gain, pas une perte', () => {
    const db = ligue('a', 'b');
    const o = ouvre(db, 'deneigement', ['a', 'b']);
    revele(db, o);
    const vue = vueOuverture(db, o);
    expect(vue.effets.every((e) => e.bilan === 0 && e.sens === 'gain')).toBe(true);
  });
});
