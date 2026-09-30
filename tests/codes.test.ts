import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { annonceDuCode, etatDuCode, normaliseCode } from '@/lib/domain/codes';
import { ECONOMY } from '@/lib/domain/rules';
import { CodeError, creeCode, desactiveCode, supprimeCode, utiliseCode, vueCodes } from '@/lib/services/codes';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

/**
 * Les codes cadeaux : c'est ainsi que les flocons se donnent. Ce qui compte —
 * le montant, les utilisations, qui a le droit — se décide sur le serveur.
 */
const CHAINE = 'lriaa';

function base(): { db: Database; modo: string; a: string; b: string; streameuse: string } {
  const db = emptyDatabase();
  const compte = (id: string, login: string, role: 'admin' | 'joueur') =>
    rattacheCompteTwitch(db, { id, login, displayName: login, avatarUrl: null, roleChaine: role }).id;
  return {
    db,
    modo: compte('t-modo', 'modo', 'admin'),
    a: compte('t-a', 'alpha', 'joueur'),
    b: compte('t-b', 'beta', 'joueur'),
    streameuse: compte('t-lriaa', CHAINE, 'admin'),
  };
}

const solde = (db: Database, id: string) => db.players.find((p) => p.id === id)!.snowflakes;

function refuse(fn: () => unknown, code: CodeError['code']) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(CodeError);
    expect((e as CodeError).code).toBe(code);
    return;
  }
  throw new Error(`attendu : refus ${code}`);
}

describe('la forme d’un code', () => {
  it('se tape sans se soucier des accents, des espaces, des tirets ni de la casse', () => {
    expect(normaliseCode(' noël-26 ')).toBe('NOEL26');
    expect(normaliseCode('k7m3 pq9x')).toBe('K7M3PQ9X');
  });

  it('dit son état : actif, épuisé, désactivé', () => {
    expect(etatDuCode({ actif: true, utilisationsMax: 2 }, 1)).toBe('actif');
    expect(etatDuCode({ actif: true, utilisationsMax: 2 }, 2)).toBe('epuise');
    expect(etatDuCode({ actif: false, utilisationsMax: 2 }, 0)).toBe('desactive');
  });

  it('s’annonce dans le tchat avec tout ce qu’il faut pour s’en servir', () => {
    expect(annonceDuCode({ code: 'K7M3PQ9X', montant: 100, utilisationsMax: 10 }, 'winter-ligue.com')).toBe(
      '🎁 Code cadeau : K7M3PQ9X — 100 ❄ pour les 10 premiers ! À taper sur winter-ligue.com, derrière le cadeau près de ton solde.',
    );
    expect(annonceDuCode({ code: 'K7M3PQ9X', montant: 50, utilisationsMax: 1 }, 'winter-ligue.com')).toContain(
      'pour le premier',
    );
  });
});

describe('créer un code', () => {
  it('le tire au sort, sans signes ambigus, et jamais deux fois le même', () => {
    const { db, modo } = base();
    const codes = Array.from({ length: 50 }, () => creeCode(db, { montant: 100, utilisationsMax: 5 }, modo).code);
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(new Set(codes).size).toBe(codes.length);
    expect(db.audit.some((a) => a.action === 'CODE_CREE')).toBe(true);
  });

  it('revérifie le montant et les utilisations, quoi qu’ait laissé passer l’écran', () => {
    const { db, modo } = base();
    refuse(() => creeCode(db, { montant: 0, utilisationsMax: 5 }, modo), 'CODE_INVALIDE');
    refuse(() => creeCode(db, { montant: ECONOMY.soldeMax + 1, utilisationsMax: 5 }, modo), 'CODE_INVALIDE');
    refuse(() => creeCode(db, { montant: 10, utilisationsMax: 0 }, modo), 'CODE_INVALIDE');
    refuse(() => creeCode(db, { montant: 2.5, utilisationsMax: 1 }, modo), 'CODE_INVALIDE');
  });
});

describe('utiliser un code', () => {
  it('verse le montant du code, au grand livre, une fois par joueur', () => {
    const { db, modo, a } = base();
    const { code } = creeCode(db, { montant: 150, utilisationsMax: 5 }, modo);
    const avant = solde(db, a);

    // Tapé en minuscules, avec un tiret au milieu : c'est le même code.
    const r = utiliseCode(db, a, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`, CHAINE);
    expect(r).toMatchObject({ code, montant: 150, recu: 150 });
    expect(solde(db, a)).toBe(avant + 150);
    expect(db.ledger.filter((l) => l.reason === 'CODE_CADEAU' && l.playerId === a)).toHaveLength(1);

    refuse(() => utiliseCode(db, a, code, CHAINE), 'DEJA_UTILISE');
    expect(solde(db, a)).toBe(avant + 150);
  });

  it('ne sert pas plus que prévu', () => {
    const { db, modo, a, b } = base();
    const { code } = creeCode(db, { montant: 100, utilisationsMax: 1 }, modo);
    utiliseCode(db, a, code, CHAINE);
    refuse(() => utiliseCode(db, b, code, CHAINE), 'CODE_EPUISE');
    expect(vueCodes(db)[0]).toMatchObject({ utilisations: 1, utilisationsMax: 1, etat: 'epuise' });
  });

  it('ne sert ni à celui qui l’a créé, ni à la streameuse', () => {
    const { db, modo, streameuse } = base();
    const { code } = creeCode(db, { montant: 100, utilisationsMax: 10 }, modo);
    refuse(() => utiliseCode(db, modo, code, CHAINE), 'SON_CODE');
    refuse(() => utiliseCode(db, streameuse, code, CHAINE), 'STREAMEUSE');
  });

  it('refuse un code inconnu ou désactivé', () => {
    const { db, modo, a } = base();
    refuse(() => utiliseCode(db, a, 'NEXISTEPAS', CHAINE), 'CODE_INCONNU');
    refuse(() => utiliseCode(db, a, '', CHAINE), 'CODE_INCONNU');
    const cree = creeCode(db, { montant: 100, utilisationsMax: 10 }, modo);
    desactiveCode(db, cree.id, modo);
    refuse(() => utiliseCode(db, a, cree.code, CHAINE), 'CODE_INCONNU');
  });

  it('s’arrête au plafond du solde, comme tout crédit', () => {
    const { db, modo, a } = base();
    const { code } = creeCode(db, { montant: ECONOMY.soldeMax, utilisationsMax: 1 }, modo);
    const avant = solde(db, a);
    const r = utiliseCode(db, a, code, CHAINE);
    expect(solde(db, a)).toBe(ECONOMY.soldeMax);
    expect(r.recu).toBe(ECONOMY.soldeMax - avant);
  });
});

describe('supprimer un code', () => {
  it('le retire pour de bon, sans reprendre ce qu’il a versé', () => {
    const { db, modo, a } = base();
    const cree = creeCode(db, { montant: 100, utilisationsMax: 5 }, modo);
    utiliseCode(db, a, cree.code, CHAINE);
    const apres = solde(db, a);

    expect(supprimeCode(db, cree.id, modo)).toEqual({ code: cree.code, utilisations: 1 });
    expect(db.codesCadeaux).toHaveLength(0);
    expect(vueCodes(db)).toHaveLength(0);
    // Le crédit reste au grand livre, et le solde ne bouge pas.
    expect(db.ledger.some((l) => l.reason === 'CODE_CADEAU' && l.refId === cree.id)).toBe(true);
    expect(solde(db, a)).toBe(apres);
    expect(db.audit.some((e) => e.action === 'CODE_SUPPRIME')).toBe(true);
    // Supprimé, il ne sert plus.
    refuse(() => utiliseCode(db, a, cree.code, CHAINE), 'CODE_INCONNU');
  });

  it('refuse un code qui n’existe pas', () => {
    const { db, modo } = base();
    refuse(() => supprimeCode(db, 'inconnu', modo), 'CODE_INCONNU');
  });
});
