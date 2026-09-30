import { describe, expect, it } from 'vitest';
import { CAMP_BOT, type Database, type Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { gagnantEchange } from '@/lib/domain/bataille';
import { DUEL, ECONOMY } from '@/lib/domain/rules';
import {
  annuleBataille,
  batailleContreBot,
  batailleslibres,
  BatailleError,
  creeBataille,
  rejointBataille,
  verifieAttente,
  vueBataille,
} from '@/lib/services/batailles';

/**
 * Ce que le service des duels doit garantir, et qui touche à l'argent.
 *
 * La règle qui départage est testée à part, dans `bataille.test.ts` — ici on
 * vérifie les mouvements : qui est débité, quand, combien, et qui repart avec
 * le pot. Ce sont les erreurs de cette catégorie qui coûtent la confiance, pas
 * les erreurs d'affichage.
 */

const MISE = 200;
const DEPART = 5_000;

function joueur(id: string, snowflakes: number): Player {
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
    joinedAt: '2027-01-01T00:00:00.000Z',
    active: true,
    role: 'joueur',
  };
}

function base(soldes: Record<string, number> = { hote: DEPART, autre: DEPART }): Database {
  const db = emptyDatabase();
  for (const [id, solde] of Object.entries(soldes)) db.players.push(joueur(id, solde));
  return db;
}

const solde = (db: Database, id: string) => db.players.find((p) => p.id === id)!.snowflakes;

/** Ce que le grand livre dit qu'un joueur a gagné ou perdu. */
const mouvements = (db: Database, id: string) =>
  db.ledger.filter((l) => l.playerId === id).reduce((s, l) => s + l.delta, 0);

describe('créer un duel', () => {
  it('débite la mise tout de suite, avant tout adversaire', () => {
    /*
     * C'est ce qui rend le lobby honnête : un duel affiché est un duel déjà
     * payé. Débiter à l'entrée de l'adversaire laisserait afficher des mises
     * que l'hôte ne peut plus couvrir.
     */
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);

    expect(b.mise).toBe(MISE);
    expect(solde(db, 'hote')).toBe(DEPART - MISE);
    expect(b.statut).toBe('ATTENTE');
    expect(b.adversaireId).toBeNull();
    expect(b.echanges).toHaveLength(0);
    expect(b.vainqueurId).toBeNull();
  });

  it('refuse une mise hors bornes ou fractionnaire', () => {
    const db = base();
    for (const mise of [0, -50, DUEL.miseMin - 1, DUEL.miseMax + 1, 120.5, Number.NaN]) {
      expect(() => creeBataille(db, 'hote', mise, 1)).toThrow(BatailleError);
    }
    expect(db.batailles).toHaveLength(0);
    expect(solde(db, 'hote')).toBe(DEPART);
    expect(db.ledger).toHaveLength(0);
  });

  it('ne se joue qu’en une manche', () => {
    const db = base();
    for (const manches of [0, 2, 3, 5]) {
      expect(() => creeBataille(db, 'hote', MISE, manches)).toThrow(BatailleError);
    }
    expect(db.batailles).toHaveLength(0);
    expect(solde(db, 'hote')).toBe(DEPART);
  });

  it('refuse un solde insuffisant, et ne laisse aucune trace', () => {
    const db = base({ hote: 10 });
    expect(() => creeBataille(db, 'hote', MISE, 1)).toThrow();
    expect(db.batailles).toHaveLength(0);
    expect(db.ledger).toHaveLength(0);
    expect(solde(db, 'hote')).toBe(10);
  });

  it('n’expose en attente que ce qui attend vraiment', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    expect(batailleslibres(db).map((x) => x.id)).toEqual([b.id]);

    batailleContreBot(db, 'hote', b.id);
    expect(batailleslibres(db)).toHaveLength(0);
  });
});

describe('résoudre un duel', () => {
  it('verse le pot entier au vainqueur, et rien au perdant', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    rejointBataille(db, 'autre', b.id);

    expect(b.statut).toBe('TERMINEE');
    expect(b.adversaireId).toBe('autre');
    expect(['hote', 'autre']).toContain(b.vainqueurId);

    const perdant = b.vainqueurId === 'hote' ? 'autre' : 'hote';
    expect(solde(db, b.vainqueurId!)).toBe(DEPART + MISE);
    expect(solde(db, perdant)).toBe(DEPART - MISE);
  });

  it('ne crée ni ne détruit de flocons entre deux joueurs', () => {
    // Le site ne prend rien au passage : ce que l'un perd, l'autre le gagne.
    const db = base();
    for (let i = 0; i < 20; i += 1) {
      const b = creeBataille(db, 'hote', DUEL.miseMin, 1);
      rejointBataille(db, 'autre', b.id);
    }
    expect(solde(db, 'hote') + solde(db, 'autre')).toBe(DEPART * 2);
  });

  it('donne le duel à celui que les lancers désignent', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    rejointBataille(db, 'autre', b.id);

    // Le dernier échange est le seul décisif ; ceux d'avant sont des égalités.
    expect(b.echanges.length).toBeGreaterThan(0);
    const decisif = gagnantEchange(b.echanges[b.echanges.length - 1]);
    expect(decisif).not.toBeNull();
    expect(b.vainqueurId).toBe(decisif === 'hote' ? 'hote' : 'autre');
    for (const e of b.echanges.slice(0, -1)) expect(gagnantEchange(e)).toBeNull();

    const vue = vueBataille(db, b);
    expect(vue.ancien).toBe(false);
    expect(vue.camps.map((c) => c.manches).sort()).toEqual([0, 1]);
  });

  it('écrit chaque mouvement au grand livre', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    rejointBataille(db, 'autre', b.id);

    expect(mouvements(db, 'hote')).toBe(solde(db, 'hote') - DEPART);
    expect(mouvements(db, 'autre')).toBe(solde(db, 'autre') - DEPART);
    expect(db.ledger.filter((l) => l.reason === 'MISE_BATAILLE')).toHaveLength(2);
    expect(db.ledger.filter((l) => l.reason === 'GAIN_BATAILLE')).toHaveLength(1);
  });

  it('refuse l’adversaire qui ne peut pas suivre la mise', () => {
    const db = base({ hote: DEPART, autre: MISE - 1 });
    const b = creeBataille(db, 'hote', MISE, 1);
    expect(() => rejointBataille(db, 'autre', b.id)).toThrow();
    expect(solde(db, 'autre')).toBe(MISE - 1);
    expect(b.echanges).toHaveLength(0);
    expect(b.vainqueurId).toBeNull();
  });

  it('refuse de rejoindre son propre duel', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    expect(() => rejointBataille(db, 'hote', b.id)).toThrow(BatailleError);
    expect(b.statut).toBe('ATTENTE');
    expect(solde(db, 'hote')).toBe(DEPART - MISE);
  });

  it('refuse un duel déjà joué', () => {
    const db = base({ hote: DEPART, autre: DEPART, tiers: DEPART });
    const b = creeBataille(db, 'hote', MISE, 1);
    rejointBataille(db, 'autre', b.id);
    expect(() => rejointBataille(db, 'tiers', b.id)).toThrow(BatailleError);
    // Le troisième n'a pas été débité pour un duel qu'il n'a pas joué.
    expect(solde(db, 'tiers')).toBe(DEPART);
  });

  it('refuse un duel qui n’existe pas', () => {
    const db = base();
    expect(() => rejointBataille(db, 'autre', 'fantome')).toThrow(BatailleError);
    expect(() => batailleContreBot(db, 'hote', 'fantome')).toThrow(BatailleError);
    expect(() => annuleBataille(db, 'hote', 'fantome')).toThrow(BatailleError);
  });

  it('ne dépasse jamais le plafond de flocons', () => {
    // Ce qui déborde est perdu, et le grand livre écrit ce qui a été versé.
    const db = base({ hote: ECONOMY.soldeMax, autre: ECONOMY.soldeMax });
    const b = creeBataille(db, 'hote', DUEL.miseMax, 1);
    rejointBataille(db, 'autre', b.id);
    expect(solde(db, b.vainqueurId!)).toBe(ECONOMY.soldeMax);
    for (const id of ['hote', 'autre']) {
      expect(mouvements(db, id)).toBe(solde(db, id) - ECONOMY.soldeMax);
    }
  });
});

describe('le bot', () => {
  it('ne mise rien, ne gagne rien, et ne triche pas', () => {
    /*
     * Quand le bot gagne, le pot disparaît — c'est ce que le joueur a accepté
     * en misant. Aucun flocon ne doit se retrouver au nom du bot.
     */
    const parties = 60;
    const db = base({ hote: DEPART });
    let botGagnant = 0;

    for (let i = 0; i < parties; i += 1) {
      const b = creeBataille(db, 'hote', DUEL.miseMin, 1);
      batailleContreBot(db, 'hote', b.id);
      expect(b.adversaireId).toBe(CAMP_BOT);
      if (b.vainqueurId === CAMP_BOT) botGagnant += 1;
    }

    expect(db.ledger.some((l) => l.playerId === CAMP_BOT)).toBe(false);
    // Une fois sur deux la mise est perdue, une fois sur deux elle est doublée.
    expect(solde(db, 'hote')).toBe(DEPART + DUEL.miseMin * (parties - 2 * botGagnant));
    // Il lance comme le joueur, donc il gagne à peu près une fois sur deux. Les
    // bornes sont larges : c'est un garde-fou contre un bot truqué, pas un test
    // statistique fin.
    expect(botGagnant).toBeGreaterThan(10);
    expect(botGagnant).toBeLessThan(50);
  });

  it('n’est lançable que par l’hôte', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    expect(() => batailleContreBot(db, 'autre', b.id)).toThrow(BatailleError);
    expect(b.statut).toBe('ATTENTE');
  });
});

describe('annuler', () => {
  it('rend la mise et ferme le duel', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    annuleBataille(db, 'hote', b.id);

    expect(b.statut).toBe('ANNULEE');
    expect(solde(db, 'hote')).toBe(DEPART);
    expect(batailleslibres(db)).toHaveLength(0);
  });

  it('ne rend la mise qu’une fois', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    annuleBataille(db, 'hote', b.id);
    expect(() => annuleBataille(db, 'hote', b.id)).toThrow(BatailleError);
    expect(solde(db, 'hote')).toBe(DEPART);
  });

  it('n’est ouvert qu’à l’hôte, et seulement avant le duel', () => {
    const db = base();
    const b = creeBataille(db, 'hote', MISE, 1);
    expect(() => annuleBataille(db, 'autre', b.id)).toThrow(BatailleError);

    rejointBataille(db, 'autre', b.id);
    expect(() => annuleBataille(db, 'hote', b.id)).toThrow(BatailleError);
  });
});

describe('les duels en attente', () => {
  it('sont bornés par joueur : chacun est annoncé sur le stream', () => {
    const db = base();
    for (let i = 0; i < DUEL.enAttenteMax; i += 1) {
      verifieAttente(db, 'hote');
      creeBataille(db, 'hote', MISE, 1);
    }
    expect(() => verifieAttente(db, 'hote')).toThrow(BatailleError);
    // Un autre joueur n'en pâtit pas.
    expect(() => verifieAttente(db, 'autre')).not.toThrow();
  });

  it('libèrent une place quand l’un d’eux est annulé', () => {
    const db = base();
    const premiers = Array.from({ length: DUEL.enAttenteMax }, () => creeBataille(db, 'hote', MISE, 1));
    annuleBataille(db, 'hote', premiers[0].id);
    expect(() => verifieAttente(db, 'hote')).not.toThrow();
  });
});
