import { describe, expect, it, vi } from 'vitest';
import type { Database, OuverturePack } from '@/lib/db/entities';
import type { FluxOverlay } from '@/lib/db/store';
import { emptyDatabase } from '@/lib/db/store';
import { CARDS, joueursTires } from '@/lib/domain/catalog';
import { CARTES_RETIREES } from './stubs/cartes-retirees';
import { construitBandeJoueurs } from '@/lib/spin/bande';
import { RANG_GAGNANT, TUILES } from '@/lib/spin/courbe';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { vueBoosters } from '@/lib/services/overlay';
import { tirageDe } from '@/lib/services/packs';

// Le catalogue n'a plus qu'une carte par rareté : les cartes retirées restent
// trouvables par `getCard`, pour exercer chaque genre d'effet.
vi.mock('@/lib/domain/catalog', async (vrai) =>
  (await import('./stubs/cartes-retirees')).avecCartesRetirees(await vrai()),
);

/**
 * Le second tirage d'un booster de la ligue : sur qui tombe la carte, quand
 * elle tombe sur des joueurs tirés au sort. Le serveur tire, l'écran déroule.
 */

/** Un tirage déterministe, pour des bandes reproductibles. */
function graine(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const carteDeCible = (cible: string) =>
  [...CARDS, ...CARTES_RETIREES].find((c) => c.cible === cible && c.packs.includes('commu'))!;

describe('combien de joueurs une carte fait tirer', () => {
  it('un pour un joueur au hasard, deux pour un face-à-face, aucun sinon', () => {
    expect(joueursTires('HASARD')).toBe(1);
    expect(joueursTires('DEUX')).toBe(2);
    expect(joueursTires('TOUS')).toBe(0);
    expect(joueursTires('TETE')).toBe(0);
    expect(joueursTires('QUEUE')).toBe(0);
  });
});

describe('la bande du rail des joueurs', () => {
  const JOUEURS = ['Intel', 'Boréal', 'Givre_', 'NordKill', 'Yeti77'];

  it('pose le joueur tiré sous le repère, et ne s’en sert jamais de leurre', () => {
    for (let n = 1; n <= 20; n += 1) {
      const bande = construitBandeJoueurs(JOUEURS, 'Givre_', graine(n));
      expect(bande).toHaveLength(TUILES);
      expect(bande[RANG_GAGNANT]).toBe('Givre_');
      expect(bande.filter((j) => j === 'Givre_')).toHaveLength(1);
    }
  });

  it('ne montre jamais deux fois le même pseudo de suite', () => {
    for (let n = 1; n <= 20; n += 1) {
      const bande = construitBandeJoueurs(JOUEURS, 'Intel', graine(n));
      for (let i = 1; i < bande.length; i += 1) expect(bande[i]).not.toBe(bande[i - 1]);
    }
  });

  it('tient avec un seul joueur en lice', () => {
    const bande = construitBandeJoueurs(['Seul'], 'Seul', graine(1));
    expect(bande).toHaveLength(TUILES);
    expect(new Set(bande)).toEqual(new Set(['Seul']));
  });
});

describe('le tirage que renvoie le serveur', () => {
  function base(): Database {
    const db = emptyDatabase();
    for (const [id, login] of [
      ['tw-a', 'alpha'],
      ['tw-b', 'bravo'],
      ['tw-l', 'lriaa'],
    ]) {
      rattacheCompteTwitch(db, { id, login, displayName: login, avatarUrl: null, roleChaine: 'joueur' });
    }
    return db;
  }
  const idDe = (db: Database, login: string) => db.players.find((p) => p.twitchLogin === login)!.id;
  const ouverture = (db: Database, cardId: string, beneficiaires: string[], joueurId: string | null = null): OuverturePack => ({
    id: 'o1',
    packId: joueurId ? 'perso' : 'commu',
    cardId,
    rarity: 'C',
    joueurId,
    beneficiaires,
    chance: 0,
    ouvertPar: 'admin',
    openedAt: '2026-12-01T20:00:00.000Z',
    idempotencyKey: 'k1',
  });

  it('donne le joueur tiré, et fait défiler les joueurs en lice — jamais la streameuse', () => {
    const db = base();
    const tirage = tirageDe(db, ouverture(db, carteDeCible('HASARD').id, [idDe(db, 'bravo')]));
    expect(tirage).toEqual({ gagnants: ['bravo'], joueurs: expect.arrayContaining(['alpha', 'bravo']) });
    expect(tirage?.joueurs).not.toContain('lriaa');
  });

  it('garde l’ordre du tirage pour deux joueurs face à face', () => {
    const db = base();
    const tirage = tirageDe(db, ouverture(db, carteDeCible('DEUX').id, [idDe(db, 'bravo'), idDe(db, 'alpha')]));
    expect(tirage?.gagnants).toEqual(['bravo', 'alpha']);
  });

  it('ne tire personne pour une carte qui vise la tête, la queue ou tout le monde, ni pour un Booster Perso', () => {
    const db = base();
    expect(tirageDe(db, ouverture(db, carteDeCible('TETE').id, [idDe(db, 'alpha')]))).toBeNull();
    expect(tirageDe(db, ouverture(db, carteDeCible('QUEUE').id, [idDe(db, 'alpha')]))).toBeNull();
    const perso = CARDS.find((c) => c.packs.includes('perso'))!;
    expect(tirageDe(db, ouverture(db, perso.id, [idDe(db, 'alpha')], idDe(db, 'alpha')))).toBeNull();
  });
});

describe('le tirage que voit l’overlay', () => {
  const flux = (cardId: string, beneficiaires: string[], joueur: string | null = null): FluxOverlay => ({
    maintenant: '2026-12-01T20:00:01.000Z',
    generation: 1,
    totalSubs: 50,
    ouvertures: [
      {
        id: 'o1',
        packId: joueur ? 'perso' : 'commu',
        cardId,
        openedAt: '2026-12-01T20:00:00.000Z',
        joueur,
        beneficiaires,
        nbBeneficiaires: beneficiaires.length,
      },
    ],
    joueurs: [
      { pseudo: 'Alpha', slug: 'alpha', twitchLogin: 'alpha' },
      { pseudo: 'Bravo', slug: 'bravo', twitchLogin: 'bravo' },
      { pseudo: 'Lriaa', slug: 'lriaa', twitchLogin: 'lriaa' },
    ],
    duels: [],
    evenements: [],
  });

  it('déroule le joueur tiré parmi les joueurs en lice, sans la streameuse', () => {
    const [vue] = vueBoosters(flux(carteDeCible('HASARD').id, ['Bravo']));
    expect(vue.tirage).toEqual({ gagnants: ['Bravo'], joueurs: ['Alpha', 'Bravo'] });
  });

  it('ne déroule rien quand personne n’est tiré au sort', () => {
    expect(vueBoosters(flux(carteDeCible('TETE').id, ['Alpha']))[0].tirage).toBeNull();
    const perso = CARDS.find((c) => c.packs.includes('perso'))!;
    expect(vueBoosters(flux(perso.id, ['Alpha'], 'Alpha'))[0].tirage).toBeNull();
  });
});
