import { describe, expect, it } from 'vitest';
import { emptyDatabase } from '@/lib/db/store';
import { PREFIXE_OUVERTURE_TEST, parametresSaison } from '@/lib/domain/rules';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { ajouteDonneesFictives, estFictif, nombreDeFictifs, retireDonneesFictives } from '@/lib/services/donneesFictives';
import { credit } from '@/lib/services/ledger';

/**
 * Les données fictives de la page de test (12/11/2026) : une ligue qui a déjà
 * vécu, faite par les services du site, sans rien toucher des vrais joueurs,
 * et qui se retire entièrement.
 */
function ligue() {
  const db = emptyDatabase();
  db.config.numero = 1;
  db.config.maxGamesPerPlayer = parametresSaison(1).games;
  db.config.totalSubs = 37;
  const vrai = rattacheCompteTwitch(db, { id: 'tw-vrai', login: 'vrai', displayName: 'Vrai', avatarUrl: null, roleChaine: 'joueur' });
  credit(db, vrai.id, 1_234, 'AJUSTEMENT_ADMIN', null);
  return { db, vrai };
}

const MAINTENANT = new Date('2026-11-12T12:00:00.000Z');

describe('les données fictives', () => {
  it('font vivre une ligue : games, Jokers, subs, ouvertures, duels, cartes', () => {
    const { db, vrai } = ligue();
    const cartesDuVrai = db.cartesEnAttente.filter((c) => c.joueurId === vrai.id).length;
    const bilan = ajouteDonneesFictives(db, 'testeur', MAINTENANT);
    expect(bilan.joueurs).toBe(24);
    expect(bilan.games).toBeGreaterThan(200);
    expect(bilan.subs).toBeGreaterThan(0);
    expect(bilan.ouverts).toBeGreaterThan(0);
    expect(bilan.boosters).toBeGreaterThan(0);
    expect(bilan.duels).toBeGreaterThan(0);
    expect(nombreDeFictifs(db)).toBe(24);
    expect(db.config.totalSubs).toBe(37 + bilan.subs);
    // Des Jokers déjà servis, des cartes déjà consommées.
    expect(db.games.some((g) => g.skipped)).toBe(true);
    expect(db.cartesEnAttente.some((c) => c.consommeeA !== null && c.gameId !== null)).toBe(true);
    // Les plus avancés s'arrêtent juste avant le Booster Finisseur.
    const parJoueur = db.players.filter(estFictif).map((p) => db.games.filter((g) => g.playerId === p.id).length);
    expect(Math.max(...parJoueur)).toBe(parametresSaison(1).finisseurA - 1);
    // Les ouvertures sont de test : ni overlay, ni tchat.
    expect(db.ouvertures.every((o) => o.idempotencyKey.startsWith(PREFIXE_OUVERTURE_TEST))).toBe(true);
    // Le vrai joueur n'a rien reçu, et il est toujours actif.
    expect(vrai.active).toBe(true);
    expect(vrai.snowflakes).toBe(1_234);
    expect(db.cartesEnAttente.filter((c) => c.joueurId === vrai.id)).toHaveLength(cartesDuVrai);
    expect(db.ouvertures.every((o) => !o.beneficiaires.includes(vrai.id))).toBe(true);
  });

  it('se refont à neuf, et se retirent entièrement', () => {
    const { db, vrai } = ligue();
    ajouteDonneesFictives(db, 'testeur', MAINTENANT);
    ajouteDonneesFictives(db, 'testeur', MAINTENANT);
    expect(nombreDeFictifs(db)).toBe(24);
    const retire = retireDonneesFictives(db, 'testeur');
    expect(retire.joueurs).toBe(24);
    expect(db.players).toHaveLength(1);
    expect(db.games).toHaveLength(0);
    expect(db.batailles).toHaveLength(0);
    expect(db.ouvertures).toHaveLength(0);
    expect(db.packsDus).toHaveLength(0);
    expect(db.evenements).toHaveLength(0);
    expect(db.subEvents).toHaveLength(0);
    expect(db.config.totalSubs).toBe(37);
    expect(db.cartesEnAttente.every((c) => c.joueurId === vrai.id)).toBe(true);
    expect(db.ledger.every((l) => l.playerId === vrai.id)).toBe(true);
    expect(db.players[0].snowflakes).toBe(1_234);
    expect(db.audit.at(-1)?.action).toBe('DONNEES_FICTIVES_RETIREES');
  });
});
