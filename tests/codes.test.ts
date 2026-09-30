import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { codeValide, etatDuCode, normaliseCode } from '@/lib/domain/codes';
import { ECONOMY } from '@/lib/domain/rules';
import { CodeError, creeCode, desactiveCode, utiliseCode, vueCodes } from '@/lib/services/codes';
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

  it('tient en quatre à vingt-quatre lettres ou chiffres', () => {
    expect(codeValide('NOEL')).toBe(true);
    expect(codeValide('NOE')).toBe(false);
    expect(codeValide('A'.repeat(25))).toBe(false);
  });

  it('dit son état : actif, épuisé, désactivé', () => {
    expect(etatDuCode({ actif: true, utilisationsMax: 2 }, 1)).toBe('actif');
    expect(etatDuCode({ actif: true, utilisationsMax: 2 }, 2)).toBe('epuise');
    expect(etatDuCode({ actif: false, utilisationsMax: 2 }, 0)).toBe('desactive');
  });
});

describe('créer un code', () => {
  it('tire au sort un code sans signes ambigus quand aucun n’est choisi', () => {
    const { db, modo } = base();
    const code = creeCode(db, { montant: 100, utilisationsMax: 5 }, modo);
    expect(code.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(db.audit.some((a) => a.action === 'CODE_CREE')).toBe(true);
  });

  it('garde le texte choisi, normalisé, et refuse un doublon', () => {
    const { db, modo } = base();
    expect(creeCode(db, { code: 'noël 26', montant: 100, utilisationsMax: 5 }, modo).code).toBe('NOEL26');
    refuse(() => creeCode(db, { code: 'NOEL-26', montant: 50, utilisationsMax: 1 }, modo), 'CODE_PRIS');
  });

  it('revérifie le montant et les utilisations, quoi qu’ait laissé passer l’écran', () => {
    const { db, modo } = base();
    refuse(() => creeCode(db, { montant: 0, utilisationsMax: 5 }, modo), 'CODE_INVALIDE');
    refuse(() => creeCode(db, { montant: ECONOMY.soldeMax + 1, utilisationsMax: 5 }, modo), 'CODE_INVALIDE');
    refuse(() => creeCode(db, { montant: 10, utilisationsMax: 0 }, modo), 'CODE_INVALIDE');
    refuse(() => creeCode(db, { code: 'X!', montant: 10, utilisationsMax: 1 }, modo), 'CODE_INVALIDE');
  });
});

describe('utiliser un code', () => {
  it('verse le montant du code, au grand livre, une fois par joueur', () => {
    const { db, modo, a } = base();
    creeCode(db, { code: 'NOEL26', montant: 150, utilisationsMax: 5 }, modo);
    const avant = solde(db, a);

    const r = utiliseCode(db, a, 'noel-26', CHAINE);
    expect(r).toMatchObject({ code: 'NOEL26', montant: 150, recu: 150 });
    expect(solde(db, a)).toBe(avant + 150);
    expect(db.ledger.filter((l) => l.reason === 'CODE_CADEAU' && l.playerId === a)).toHaveLength(1);

    refuse(() => utiliseCode(db, a, 'NOEL26', CHAINE), 'DEJA_UTILISE');
    expect(solde(db, a)).toBe(avant + 150);
  });

  it('ne sert pas plus que prévu', () => {
    const { db, modo, a, b } = base();
    creeCode(db, { code: 'UNSEUL', montant: 100, utilisationsMax: 1 }, modo);
    utiliseCode(db, a, 'UNSEUL', CHAINE);
    refuse(() => utiliseCode(db, b, 'UNSEUL', CHAINE), 'CODE_EPUISE');
    expect(vueCodes(db)[0]).toMatchObject({ utilisations: 1, utilisationsMax: 1, etat: 'epuise' });
  });

  it('ne sert ni à celui qui l’a créé, ni à la streameuse', () => {
    const { db, modo, streameuse } = base();
    creeCode(db, { code: 'MODOS', montant: 100, utilisationsMax: 10 }, modo);
    refuse(() => utiliseCode(db, modo, 'MODOS', CHAINE), 'SON_CODE');
    refuse(() => utiliseCode(db, streameuse, 'MODOS', CHAINE), 'STREAMEUSE');
  });

  it('refuse un code inconnu ou désactivé', () => {
    const { db, modo, a } = base();
    refuse(() => utiliseCode(db, a, 'NEXISTEPAS', CHAINE), 'CODE_INCONNU');
    refuse(() => utiliseCode(db, a, '', CHAINE), 'CODE_INCONNU');
    const code = creeCode(db, { code: 'FERME', montant: 100, utilisationsMax: 10 }, modo);
    desactiveCode(db, code.id, modo);
    refuse(() => utiliseCode(db, a, 'FERME', CHAINE), 'CODE_INCONNU');
  });

  it('s’arrête au plafond du solde, comme tout crédit', () => {
    const { db, modo, a } = base();
    creeCode(db, { code: 'GROS', montant: ECONOMY.soldeMax, utilisationsMax: 1 }, modo);
    const avant = solde(db, a);
    const r = utiliseCode(db, a, 'GROS', CHAINE);
    expect(solde(db, a)).toBe(ECONOMY.soldeMax);
    expect(r.recu).toBe(ECONOMY.soldeMax - avant);
  });
});
