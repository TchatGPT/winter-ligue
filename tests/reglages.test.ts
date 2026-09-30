import { describe, expect, it } from 'vitest';
import type { Database, Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { cartesDuPack, getCard, momentDe, PACKS } from '@/lib/domain/catalog';
import { ECONOMY, RARITY_WEIGHTS_BASE, WEIGHT_TOTAL } from '@/lib/domain/rules';
import { RARITIES, type Rarity } from '@/lib/domain/types';
import {
  ajusteBoostersPerso,
  cartesEnAttenteDe,
  fileDesPacks,
  ouvrePack,
  PackError,
  reglagePack,
  resolvedPack,
  resolvedPacks,
  verifieFinisseur,
  verifieTable,
} from '@/lib/services/packs';

const base = () => emptyDatabase();
const premier = PACKS[0];

/** Une table qui ne sert qu'une rareté : le tirage devient prévisible. */
function seulement(rarity: Rarity): Record<Rarity, number> {
  return { C: 0, R: 0, UR: 0, L: 0, [rarity]: WEIGHT_TOTAL };
}

function joueur(id: string, snowflakes = 0): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes,
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
  const db = base();
  for (const id of ids) db.players.push(joueur(id));
  return db;
}

describe('réglages de booster', () => {
  it('rend le catalogue tant que rien n’est réglé', () => {
    const db = base();
    for (const p of resolvedPacks(db)) {
      const original = PACKS.find((x) => x.id === p.id)!;
      expect(p.weights).toEqual(original.weights);
    }
  });

  it('applique une table, et seulement au booster réglé', () => {
    const db = base();
    reglagePack(db, premier.id, { ...RARITY_WEIGHTS_BASE, C: 84_000, R: 15_000 });
    const resolu = resolvedPack(db, premier.id)!;
    expect(resolu.weights.C).toBe(84_000);
    expect(resolu.name).toBe(premier.name);
    for (const autre of PACKS.slice(1)) {
      expect(resolvedPack(db, autre.id)!.weights).toEqual(autre.weights);
    }
  });

  it('garde un seul réglage par booster', () => {
    const db = base();
    reglagePack(db, premier.id, seulement('R'));
    reglagePack(db, premier.id, seulement('UR'));
    expect(db.reglagesPacks).toHaveLength(1);
    expect(resolvedPack(db, premier.id)!.weights).toEqual(seulement('UR'));
  });

  it('revient au catalogue quand on remet à zéro', () => {
    const db = base();
    reglagePack(db, premier.id, seulement('R'));
    reglagePack(db, premier.id, null);
    expect(resolvedPack(db, premier.id)!.weights).toEqual(premier.weights);
    // Plus aucune ligne : la présence d'un réglage doit vouloir dire quelque chose.
    expect(db.reglagesPacks).toHaveLength(0);
  });

  it('refuse une table qui ne totalise pas exactement 100 000', () => {
    // C'est l'invariant : `pickWeighted` tire dans cette plage. Une somme
    // fausse rend les taux affichés mensongers sans que personne puisse s'en
    // apercevoir.
    const db = base();
    for (const somme of [WEIGHT_TOTAL - 1, WEIGHT_TOTAL + 1, 0]) {
      const table = { ...RARITY_WEIGHTS_BASE, C: RARITY_WEIGHTS_BASE.C + (somme - WEIGHT_TOTAL) };
      expect(() => reglagePack(db, premier.id, table)).toThrow(PackError);
    }
  });

  it('refuse un poids négatif ou fractionnaire', () => {
    expect(() => verifieTable({ ...RARITY_WEIGHTS_BASE, L: -200, C: 58_400 })).toThrow(PackError);
    expect(() => verifieTable({ ...RARITY_WEIGHTS_BASE, L: 200.5 })).toThrow(PackError);
  });

  it('refuse une table à laquelle il manque une rareté', () => {
    const partielle: Record<string, number> = { ...RARITY_WEIGHTS_BASE };
    delete partielle.L;
    expect(() => verifieTable(partielle)).toThrow(PackError);
  });

  it('refuse un booster inconnu', () => {
    expect(() => reglagePack(base(), 'sachet-fantome', RARITY_WEIGHTS_BASE)).toThrow(PackError);
    expect(resolvedPack(base(), 'sachet-fantome')).toBeNull();
  });

  it('n’écrit rien quand la table est refusée', () => {
    // Une validation qui laisserait une écriture partielle serait pire que pas
    // de validation : le booster sortirait de la transaction à moitié réglé.
    const db = base();
    reglagePack(db, premier.id, seulement('R'));
    expect(() => reglagePack(db, premier.id, { ...RARITY_WEIGHTS_BASE, L: 0 })).toThrow(PackError);
    expect(db.reglagesPacks).toHaveLength(1);
    expect(resolvedPack(db, premier.id)!.weights).toEqual(seulement('R'));
  });

  it('garde une table valide utilisable par le tirage', () => {
    // Le tirage parcourt les raretés dans l'ordre : la table rendue doit les
    // contenir toutes, sans quoi `pickWeighted` sortirait de sa plage.
    const table = verifieTable(RARITY_WEIGHTS_BASE);
    expect(Object.keys(table).sort()).toEqual([...RARITIES].sort());
    expect(RARITIES.reduce((s, r) => s + table[r], 0)).toBe(WEIGHT_TOTAL);
  });
});

describe('ouvrir un booster', () => {
  it('tire avec la table réglée, pas avec celle du catalogue', () => {
    // Afficher les taux réglés en tirant aux taux du catalogue : l'écran et le
    // serveur raconteraient deux choses différentes.
    const db = ligue('a');
    reglagePack(db, 'perso', seulement('L'));
    for (let i = 0; i < 25; i += 1) {
      const o = ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: `k${i}` }, 'modo');
      expect(o.rarity).toBe('L');
    }
  });

  it('ne donne à un joueur que des cartes de son booster, toutes des bonus', () => {
    const db = ligue('a');
    const permises = cartesDuPack('perso').map((c) => c.id);
    for (let i = 0; i < 200; i += 1) {
      const o = ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: `k${i}` }, 'modo');
      expect(permises).toContain(o.cardId);
      expect(getCard(o.cardId)!.nature).toBe('bonus');
      expect(o.beneficiaires).toEqual(['a']);
    }
  });

  it('rend la même ouverture quand la requête est rejouée', () => {
    const db = ligue('a');
    const demande = { packId: 'perso' as const, joueurId: 'a', idempotencyKey: 'meme-cle' };
    const une = ouvrePack(db, demande, 'modo');
    const deux = ouvrePack(db, demande, 'modo');
    expect(deux.id).toBe(une.id);
    expect(db.ouvertures).toHaveLength(1);
    expect(db.cartesEnAttente).toHaveLength(1);
  });

  it('pose la carte sur la prochaine game, sans toucher au solde', () => {
    // Des super rares du Booster Perso se règlent dans l'instant — un créneau,
    // une immunité. Tirées au sort, elles faisaient échouer ce test une fois
    // sur trois : on rouvre, sur une base neuve, jusqu'à tirer une carte qui
    // attend la prochaine game.
    for (let essai = 0; essai < 400; essai += 1) {
      const db = ligue('a');
      reglagePack(db, 'perso', seulement('R'));
      const o = ouvrePack(db, { packId: 'perso', joueurId: 'a', idempotencyKey: `k${essai}` }, 'modo');
      if (momentDe(getCard(o.cardId)!.effect) !== 'PROCHAINE') continue;

      expect(cartesEnAttenteDe(db, 'a')).toHaveLength(1);
      expect(db.players[0].snowflakes).toBe(0);
      expect(db.ledger).toHaveLength(0);
      return;
    }
    throw new Error('aucune carte « prochaine game » en 400 ouvertures : le pool du Booster Perso a changé');
  });

  it('crédite une carte de flocons dans l’instant, par le grand livre', () => {
    // Le tirage est au sort, et les ultra rares du Booster Commu ne sont pas
    // toutes des flocons : on rouvre, sur une base neuve, jusqu'à en tirer une.
    for (let essai = 0; essai < 400; essai += 1) {
      const db = ligue('a');
      reglagePack(db, 'commu', seulement('UR'));
      const o = ouvrePack(db, { packId: 'commu', idempotencyKey: `k${essai}` }, 'modo');
      const effet = getCard(o.cardId)!.effect;
      if (effet.kind !== 'snowflakes') continue;

      expect(db.players[0].snowflakes).toBe(effet.value);
      expect(db.ledger).toHaveLength(1);
      expect(db.ledger[0].reason).toBe('CARTE');
      expect(cartesEnAttenteDe(db, 'a')).toHaveLength(0);
      return;
    }
    throw new Error('aucune carte de flocons en 400 ouvertures : le pool du Booster Commu a changé');
  });

  it('pousse les raretés avec le solde, sans dépenser un flocon', () => {
    const db = base();
    db.players.push(joueur('riche', ECONOMY.soldeMax), joueur('pauvre', 0));
    const riche = ouvrePack(db, { packId: 'perso', joueurId: 'riche', idempotencyKey: 'r' }, 'modo');
    const pauvre = ouvrePack(db, { packId: 'perso', joueurId: 'pauvre', idempotencyKey: 'p' }, 'modo');
    expect(riche.chance).toBe(1);
    expect(pauvre.chance).toBe(0);
    expect(db.ledger.every((l) => l.delta >= 0)).toBe(true);
  });

  it('n’applique aucune chance à un booster collectif', () => {
    const db = base();
    db.players.push(joueur('a', ECONOMY.soldeMax), joueur('b', ECONOMY.soldeMax));
    for (let i = 0; i < 20; i += 1) {
      const o = ouvrePack(db, { packId: 'folie', idempotencyKey: `k${i}` }, 'modo');
      expect(o.chance).toBe(0);
      expect(o.joueurId).toBeNull();
    }
  });

  it('exige un joueur actif pour un booster personnel', () => {
    const db = ligue('a');
    db.players.push({ ...joueur('parti'), active: false });
    expect(() => ouvrePack(db, { packId: 'perso', idempotencyKey: 'k1' }, 'modo')).toThrow(PackError);
    expect(() =>
      ouvrePack(db, { packId: 'perso', joueurId: 'parti', idempotencyKey: 'k2' }, 'modo'),
    ).toThrow(PackError);
    expect(() =>
      ouvrePack(db, { packId: 'perso', joueurId: 'inconnu', idempotencyKey: 'k3' }, 'modo'),
    ).toThrow(PackError);
    expect(db.ouvertures).toHaveLength(0);
  });

  it('tire deux joueurs distincts pour une carte à deux', () => {
    const db = ligue('a', 'b', 'c');
    // Au Booster Commu, les rares comptent le Chassé-Croisé.
    reglagePack(db, 'commu', seulement('R'));
    let paires = 0;
    for (let i = 0; i < 60; i += 1) {
      const o = ouvrePack(db, { packId: 'commu', idempotencyKey: `k${i}` }, 'modo');
      if (getCard(o.cardId)!.cible !== 'DEUX') continue;
      paires += 1;
      expect(o.beneficiaires).toHaveLength(2);
      expect(new Set(o.beneficiaires).size).toBe(2);
      const cartes = db.cartesEnAttente.filter((c) => c.ouvertureId === o.id);
      expect(cartes).toHaveLength(2);
      expect(cartes[0].paireId).not.toBeNull();
      expect(cartes[0].paireId).toBe(cartes[1].paireId);
    }
    expect(paires).toBeGreaterThan(0);
  });

  it('n’envoie un malus de tête que sur le premier du classement', () => {
    const db = ligue('meneur', 'suiveur');
    db.games.push({
      id: 'g1',
      playerId: 'meneur',
      kills: 20,
      placement: 1,
      bonusPoints: 0,
      skipped: false,
      score: 40,
      note: null,
      playedAt: '2027-01-15T20:00:00.000Z',
      createdAt: '2027-01-15T20:00:00.000Z',
      applied: [],
    });
    reglagePack(db, 'folie', seulement('UR'));
    let vus = 0;
    for (let i = 0; i < 60; i += 1) {
      const o = ouvrePack(db, { packId: 'folie', idempotencyKey: `k${i}` }, 'modo');
      if (getCard(o.cardId)!.cible !== 'TETE') continue;
      vus += 1;
      expect(o.beneficiaires).toEqual(['meneur']);
    }
    expect(vus).toBeGreaterThan(0);
  });
});

describe('la file des boosters', () => {
  it('règle le compteur de Boosters Perso d’un joueur : + en met un en file, − retire le dernier', () => {
    const db = ligue('a');
    expect(ajusteBoostersPerso(db, 'a', 'plus', 'modo').boostersPerso).toBe(1);
    expect(ajusteBoostersPerso(db, 'a', 'plus', 'modo').boostersPerso).toBe(2);
    expect(ajusteBoostersPerso(db, 'a', 'moins', 'modo').boostersPerso).toBe(1);

    const file = fileDesPacks(db);
    expect(file).toHaveLength(1);
    expect(file.every((p) => p.packId === 'perso' && p.joueurId === 'a')).toBe(true);
    // Mis en file, jamais ouverts automatiquement.
    expect(db.ouvertures).toHaveLength(0);
    expect(db.audit.filter((e) => e.action.startsWith('BOOSTER_PERSO_'))).toHaveLength(3);
  });

  it('ne descend pas sous zéro, et refuse un joueur inconnu', () => {
    const db = ligue('a');
    expect(() => ajusteBoostersPerso(db, 'a', 'moins', 'modo')).toThrow(PackError);
    expect(() => ajusteBoostersPerso(db, 'inconnu', 'plus', 'modo')).toThrow(PackError);
    expect(db.packsDus).toHaveLength(0);
  });

  it('sort un booster de la file quand il est ouvert, une seule fois', () => {
    const db = ligue('a');
    ajusteBoostersPerso(db, 'a', 'plus', 'modo');
    const [du] = fileDesPacks(db);

    const o = ouvrePack(db, { packDuId: du.id, idempotencyKey: 'k1' }, 'modo');
    expect(o.packId).toBe('perso');
    expect(o.joueurId).toBe('a');
    expect(fileDesPacks(db)).toHaveLength(0);
    expect(() => ouvrePack(db, { packDuId: du.id, idempotencyKey: 'k2' }, 'modo')).toThrow(PackError);
    expect(db.ouvertures).toHaveLength(1);
  });

  it('doit le Booster Finisseur à la dernière game, et pas deux fois', () => {
    const db = ligue('a');
    db.config.maxGamesPerPlayer = 3;
    const saisit = (n: number) =>
      db.games.push({
        id: `g${n}`,
        playerId: 'a',
        kills: 1,
        placement: null,
        bonusPoints: 0,
        skipped: false,
        score: 1,
        note: null,
        playedAt: `2027-01-1${n}T20:00:00.000Z`,
        createdAt: `2027-01-1${n}T20:00:00.000Z`,
        applied: [],
      });

    saisit(1);
    saisit(2);
    expect(verifieFinisseur(db, 'a')).toBeNull();
    saisit(3);
    expect(verifieFinisseur(db, 'a')?.packId).toBe('finisseur');
    expect(verifieFinisseur(db, 'a')).toBeNull();
    expect(db.packsDus).toHaveLength(1);
  });
});
