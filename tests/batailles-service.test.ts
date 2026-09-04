import { describe, expect, it } from 'vitest';
import { CAMP_BOT, type Database, type Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { BOOSTERS } from '@/lib/domain/catalog';
import { ECONOMY } from '@/lib/domain/rules';
import { defausseCarte } from '@/lib/services/cards';
import {
  annuleBataille,
  batailleContreBot,
  batailleslibres,
  BatailleError,
  creeBataille,
  rejointBataille,
} from '@/lib/services/batailles';

/**
 * Ce que le service des batailles doit garantir, et qui touche à l'argent.
 *
 * La règle qui départage est testée à part, dans `bataille.test.ts` — ici on
 * vérifie les mouvements : qui est débité, quand, combien, et qui repart avec
 * les cartes. Ce sont les erreurs de cette catégorie qui coûtent la confiance,
 * pas les erreurs d'affichage.
 */

const GIVRE = BOOSTERS[0];
/** Le sachet le plus cher du catalogue : de quoi vérifier un panier mélangé. */
const CHER = BOOSTERS.reduce((a, b) => (b.price > a.price ? b : a));

/** Un panier de `n` fois le même sachet — l'ancienne forme, devenue un cas. */
const paquet = (n: number, id: string = GIVRE.id) => Array.from({ length: n }, () => id);

function joueur(id: string, snowflakes: number): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    snowflakes,
    joinedAt: '2027-01-01T00:00:00.000Z',
    active: true,
    role: 'joueur',
  };
}

function base(soldes: Record<string, number> = { hote: 100_000, autre: 100_000 }): Database {
  const db = emptyDatabase();
  for (const [id, solde] of Object.entries(soldes)) db.players.push(joueur(id, solde));
  return db;
}

const solde = (db: Database, id: string) => db.players.find((p) => p.id === id)!.snowflakes;

describe('créer une bataille', () => {
  it('débite la mise tout de suite, avant tout adversaire', () => {
    /*
     * C'est ce qui rend le lobby honnête : une bataille affichée est une
     * bataille déjà payée. Débiter à l'entrée de l'adversaire laisserait
     * afficher des mises que l'hôte ne peut plus couvrir.
     */
    const db = base();
    const avant = solde(db, 'hote');
    const b = creeBataille(db, 'hote', paquet(3));

    expect(b.mise).toBe(GIVRE.price * 3);
    expect(solde(db, 'hote')).toBe(avant - GIVRE.price * 3);
    expect(b.statut).toBe('ATTENTE');
    expect(b.tirages).toHaveLength(0);
  });

  it('refuse un panier vide ou trop gros', () => {
    const db = base();
    expect(() => creeBataille(db, 'hote', [])).toThrow(BatailleError);
    expect(() => creeBataille(db, 'hote', paquet(6))).toThrow(BatailleError);
    expect(db.batailles).toHaveLength(0);
  });

  it('accepte un panier mélangé, et en additionne les prix', () => {
    /*
     * C'est tout l'intérêt du panier : trois Givre et un Everest ne se jouent
     * pas comme quatre Givre. La mise doit suivre les sachets réellement
     * choisis, sachet par sachet, et non un prix unitaire multiplié.
     */
    const db = base();
    const melange = [GIVRE.id, CHER.id, GIVRE.id];
    const avant = solde(db, 'hote');
    const b = creeBataille(db, 'hote', melange);

    expect(b.boosterIds).toEqual(melange);
    expect(b.manches).toBe(3);
    expect(b.mise).toBe(GIVRE.price * 2 + CHER.price);
    expect(solde(db, 'hote')).toBe(avant - b.mise);
  });

  it('refuse un solde insuffisant, et ne laisse aucune trace', () => {
    const db = base({ hote: 10 });
    expect(() => creeBataille(db, 'hote', paquet(1))).toThrow();
    expect(db.batailles).toHaveLength(0);
    expect(solde(db, 'hote')).toBe(10);
  });

  it('n’expose en attente que ce qui attend vraiment', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(1));
    expect(batailleslibres(db).map((x) => x.id)).toEqual([b.id]);

    batailleContreBot(db, 'hote', b.id);
    expect(batailleslibres(db)).toHaveLength(0);
  });
});

describe('résoudre une bataille', () => {
  it('donne toutes les cartes des deux camps au vainqueur', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(2));
    rejointBataille(db, 'autre', b.id);

    expect(b.statut).toBe('TERMINEE');
    expect(b.tirages).toHaveLength(2);

    const total = b.tirages.reduce((n, t) => n + t.cardIds.length, 0);
    const gagnees = db.cards.filter((c) => c.playerId === b.vainqueurId);
    expect(gagnees).toHaveLength(total);

    // Et le perdant n'a strictement rien : ses cartes n'ont appartenu à personne.
    const perdant = b.vainqueurId === 'hote' ? 'autre' : 'hote';
    expect(db.cards.filter((c) => c.playerId === perdant)).toHaveLength(0);
  });

  it('débite les deux camps de la même mise', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(2));
    rejointBataille(db, 'autre', b.id);
    expect(solde(db, 'hote')).toBe(100_000 - b.mise);
    expect(solde(db, 'autre')).toBe(100_000 - b.mise);
  });

  it('ouvre autant de sachets par camp qu’annoncé', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(3));
    rejointBataille(db, 'autre', b.id);
    const parCamp = 3 * (GIVRE.slots.effet + GIVRE.slots.collection);
    for (const tirage of b.tirages) expect(tirage.cardIds).toHaveLength(parCamp);
  });

  it('refuse de rejoindre sa propre bataille', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(1));
    expect(() => rejointBataille(db, 'hote', b.id)).toThrow(BatailleError);
    expect(b.statut).toBe('ATTENTE');
  });

  it('refuse une bataille déjà jouée', () => {
    const db = base({ hote: 100_000, autre: 100_000, tiers: 100_000 });
    const b = creeBataille(db, 'hote', paquet(1));
    rejointBataille(db, 'autre', b.id);
    expect(() => rejointBataille(db, 'tiers', b.id)).toThrow(BatailleError);
    // Le troisième n'a pas été débité pour une bataille qu'il n'a pas jouée.
    expect(solde(db, 'tiers')).toBe(100_000);
  });
});

describe('le bot', () => {
  it('ne mise rien et ne collectionne rien', () => {
    /*
     * Quand le bot gagne, les cartes des deux camps disparaissent — c'est ce que
     * le joueur a accepté en misant. Aucun exemplaire ne doit se retrouver au
     * nom du bot, sans quoi une carte fantôme circulerait dans la base.
     */
    const db = base({ hote: 1_000_000 });
    let botGagnant = 0;

    for (let i = 0; i < 60; i += 1) {
      const b = creeBataille(db, 'hote', paquet(1));
      batailleContreBot(db, 'hote', b.id);
      if (b.vainqueurId === CAMP_BOT) botGagnant += 1;
    }

    expect(db.cards.some((c) => c.playerId === CAMP_BOT)).toBe(false);
    // Il tire aux mêmes taux, donc il gagne à peu près une fois sur deux. Les
    // bornes sont larges : c'est un garde-fou contre un bot truqué, pas un test
    // statistique fin.
    expect(botGagnant).toBeGreaterThan(10);
    expect(botGagnant).toBeLessThan(50);
  });

  it('n’est lançable que par l’hôte', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(1));
    expect(() => batailleContreBot(db, 'autre', b.id)).toThrow(BatailleError);
  });
});

describe('annuler', () => {
  it('rend la mise et ferme la bataille', () => {
    const db = base();
    const avant = solde(db, 'hote');
    const b = creeBataille(db, 'hote', paquet(4));
    annuleBataille(db, 'hote', b.id);

    expect(b.statut).toBe('ANNULEE');
    expect(solde(db, 'hote')).toBe(avant);
  });

  it('n’est ouvert qu’à l’hôte, et seulement avant le tirage', () => {
    const db = base();
    const b = creeBataille(db, 'hote', paquet(1));
    expect(() => annuleBataille(db, 'autre', b.id)).toThrow(BatailleError);

    rejointBataille(db, 'autre', b.id);
    expect(() => annuleBataille(db, 'hote', b.id)).toThrow(BatailleError);
  });
});

describe('la défausse', () => {
  it('détruit l’exemplaire et rend un flocon', () => {
    const db = base({ hote: 0 });
    db.cards.push({
      id: 'ex-1',
      playerId: 'hote',
      cardId: GIVRE.id,
      obtainedAt: '2027-01-01T00:00:00.000Z',
      source: 'BOOSTER',
      consumed: false,
      consumedAt: null,
      consumedOnGameId: null,
      consumedOnPlayerId: null,
      listingId: null,
      consumeKey: null,
    });

    const { gain, balance } = defausseCarte(db, 'hote', 'ex-1');
    expect(gain).toBe(ECONOMY.defausse);
    expect(balance).toBe(ECONOMY.defausse);
    expect(db.cards).toHaveLength(0);
  });

  it('refuse une carte en vente, et ne la détruit pas', () => {
    /*
     * Une carte sous séquestre est adossée à une vente active : la détruire
     * laisserait la vente pointer vers un exemplaire qui n'existe plus, et
     * l'adjudication tomberait dans le vide.
     */
    const db = base({ hote: 0 });
    db.cards.push({
      id: 'ex-2',
      playerId: 'hote',
      cardId: GIVRE.id,
      obtainedAt: '2027-01-01T00:00:00.000Z',
      source: 'BOOSTER',
      consumed: false,
      consumedAt: null,
      consumedOnGameId: null,
      consumedOnPlayerId: null,
      listingId: 'vente-1',
      consumeKey: null,
    });

    expect(() => defausseCarte(db, 'hote', 'ex-2')).toThrow();
    expect(db.cards).toHaveLength(1);
    expect(solde(db, 'hote')).toBe(0);
  });

  it('refuse la carte d’un autre', () => {
    const db = base({ hote: 0, autre: 0 });
    db.cards.push({
      id: 'ex-3',
      playerId: 'autre',
      cardId: GIVRE.id,
      obtainedAt: '2027-01-01T00:00:00.000Z',
      source: 'BOOSTER',
      consumed: false,
      consumedAt: null,
      consumedOnGameId: null,
      consumedOnPlayerId: null,
      listingId: null,
      consumeKey: null,
    });

    expect(() => defausseCarte(db, 'hote', 'ex-3')).toThrow();
    expect(db.cards).toHaveLength(1);
  });
});
