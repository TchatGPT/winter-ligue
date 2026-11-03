import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { cartesDuPack, getCard, momentDe, PACKS } from '@/lib/domain/catalog';
import {
  donneCarteDeTest,
  estOuvertureDeTest,
  estTesteur,
  retireCarteDeTest,
  vueTestCartes,
} from '@/lib/services/cartesDeTest';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { carteQuiAttend } from '@/lib/services/effects';
import { PackError } from '@/lib/services/packs';

/**
 * La page de test : un testeur (`TESTEURS_CARTES`) se donne la carte de son
 * choix, sur son propre compte ; personne d'autre.
 */

let n = 0;
const cle = () => `0b9e6a52-6f5e-4c55-9d0a-${String(++n).padStart(12, '0')}`;

function base(): { db: Database; testeur: string; autre: string } {
  const db = emptyDatabase();
  const profil = (id: string, login: string) => ({ id, login, displayName: login, avatarUrl: null, roleChaine: 'admin' as const });
  const testeur = rattacheCompteTwitch(db, profil('207954362', 'Jeex3')).id;
  const autre = rattacheCompteTwitch(db, profil('tw-m', 'unmodo')).id;
  return { db, testeur, autre };
}

const nonConsommees = (db: Database, id: string, cardId: string) =>
  db.cartesEnAttente.filter((c) => c.joueurId === id && c.cardId === cardId && c.consommeeA === null);

describe('la page de test des cartes', () => {
  it('n’ouvre qu’aux testeurs, lus en base par leur identifiant Twitch', () => {
    const { db, testeur, autre } = base();
    expect(estTesteur(db, testeur)).toBe(true);
    expect(estTesteur(db, autre)).toBe(false);
    // Reprendre le pseudo d'un testeur ne donne rien : c'est l'identifiant qui compte.
    const imposteur = rattacheCompteTwitch(db, {
      id: 'tw-x',
      login: 'jeex3',
      displayName: 'jeex3',
      avatarUrl: null,
      roleChaine: 'admin',
    }).id;
    expect(estTesteur(db, imposteur)).toBe(false);
    expect(estTesteur(db, null)).toBe(false);
    expect(vueTestCartes(db, autre)).toBeNull();
    expect(() => donneCarteDeTest(db, autre, { packId: 'perso', cardId: 'vent-porteur', cle: cle() }, 'x')).toThrow(
      PackError,
    );
    expect(db.ouvertures).toHaveLength(0);
  });

  it('pose la carte comme une ouverture déjà révélée, et le journal la garde', () => {
    const { db, testeur } = base();
    const r = donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'vent-porteur', cle: cle() }, 'sub-j');
    expect(r.carte).toBe('Vent Porteur');
    const o = db.ouvertures.at(-1)!;
    expect(o).toMatchObject({ packId: 'perso', cardId: 'vent-porteur', joueurId: testeur, beneficiaires: [testeur] });
    expect(o.annonceeA).toBeTruthy();
    expect(carteQuiAttend(db, testeur)?.cardId).toBe('vent-porteur');
    expect(db.audit.at(-1)).toMatchObject({ action: 'CARTE_TEST', targetId: testeur, actor: 'sub-j' });
  });

  it('refuse une carte qui ne sort pas de ce booster', () => {
    const { db, testeur } = base();
    expect(() => donneCarteDeTest(db, testeur, { packId: 'commu', cardId: 'joker-givre', cle: cle() }, 'x')).toThrow(
      /ne sort pas du Booster Commu/,
    );
  });

  it('règle tout de suite ce qui n’attend pas : des flocons, sans attendre l’écran', () => {
    const { db, testeur } = base();
    const r = donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'bocal-de-givre', cle: cle() }, 'x');
    expect(db.players.find((p) => p.id === testeur)!.snowflakes).toBe(40);
    expect(r.resultat).toMatch(/40/);
  });

  it('pas de stock : une carte qui attend une game bloque la suivante, pas une gardée', () => {
    const { db, testeur } = base();
    donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'vent-porteur', cle: cle() }, 'x');
    expect(() => donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'souffle-polaire', cle: cle() }, 'x')).toThrow(
      /déjà une carte qui attend/,
    );
    // Les trois Jokers de départ, plus un.
    donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'joker-givre', cle: cle() }, 'x');
    expect(nonConsommees(db, testeur, 'joker-givre')).toHaveLength(4);
    // Retirée, la place se libère.
    expect(retireCarteDeTest(db, testeur, 'x').carte).toBe('Vent Porteur');
    expect(carteQuiAttend(db, testeur)).toBeNull();
    donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'souffle-polaire', cle: cle() }, 'x');
    expect(carteQuiAttend(db, testeur)?.cardId).toBe('souffle-polaire');
  });

  it('ne retire qu’une carte de test, jamais une carte d’un vrai booster', () => {
    const { db, testeur } = base();
    // Une vraie carte de la ligue, tombée d'un booster ouvert à l'antenne.
    const maintenant = new Date().toISOString();
    db.ouvertures.push({
      id: 'o-vraie',
      packId: 'perso',
      cardId: 'vent-porteur',
      rarity: 'C',
      joueurId: null,
      beneficiaires: [testeur],
      chance: 0,
      ouvertPar: 'modo',
      openedAt: maintenant,
      idempotencyKey: 'vraie-cle',
      annonceeA: maintenant,
    });
    db.cartesEnAttente.push({
      id: 'c-vraie',
      joueurId: testeur,
      cardId: 'vent-porteur',
      ouvertureId: 'o-vraie',
      creeA: maintenant,
      consommeeA: null,
      gameId: null,
      resultat: null,
      paireId: null,
    });
    expect(() => retireCarteDeTest(db, testeur, 'x')).toThrow(/vrai booster/);
    expect(carteQuiAttend(db, testeur)?.id).toBe('c-vraie');
    expect(vueTestCartes(db, testeur)!.enAttenteRetirable).toBe(false);
  });

  it('marque ses ouvertures : l’overlay du live ne les joue pas', () => {
    const { db, testeur } = base();
    donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'bocal-de-givre', cle: cle() }, 'x');
    expect(estOuvertureDeTest(db.ouvertures.at(-1)!)).toBe(true);
  });

  it('une même clé ne donne qu’une carte', () => {
    const { db, testeur } = base();
    const k = cle();
    donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'bocal-de-givre', cle: k }, 'x');
    donneCarteDeTest(db, testeur, { packId: 'perso', cardId: 'bocal-de-givre', cle: k }, 'x');
    expect(db.ouvertures).toHaveLength(1);
    expect(db.players.find((p) => p.id === testeur)!.snowflakes).toBe(40);
  });

  it('peut donner chaque carte de chaque booster', () => {
    for (const pack of PACKS) {
      for (const carte of cartesDuPack(pack.id)) {
        const { db, testeur } = base();
        expect(() => donneCarteDeTest(db, testeur, { packId: pack.id, cardId: carte.id, cle: cle() }, 'x')).not.toThrow();
        // La carte posée est celle de l'ouverture ; une Pluie de Jokers pose ses Jokers après elle.
        const o = db.ouvertures.at(-1)!;
        expect(o.cardId).toBe(carte.id);
        const posee = db.cartesEnAttente.find((c) => c.ouvertureId === o.id && c.cardId === carte.id)!;
        if (momentDe(getCard(carte.id)!.effect) === 'PROCHAINE') expect(posee.consommeeA).toBeNull();
      }
    }
  });

  it('montre chaque booster et ses cartes, et ce qu’il garde', () => {
    const { db, testeur } = base();
    const vue = vueTestCartes(db, testeur)!;
    expect(vue.boosters.map((b) => b.id)).toEqual(PACKS.map((p) => p.id));
    for (const b of vue.boosters) expect(b.cartes).toHaveLength(cartesDuPack(b.id).length);
    expect(vue.gardees).toEqual([{ nom: 'Joker Givré', nombre: 3 }]);
    expect(vue.enAttente).toBeNull();
  });
});
