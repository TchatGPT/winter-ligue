import { describe, expect, it } from 'vitest';
import { emptyDatabase } from '@/lib/db/store';
import { parametresSaison } from '@/lib/domain/rules';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { ajouteDonneesFictives, estFictif, nombreDeFictifs, retireDonneesFictives } from '@/lib/services/donneesFictives';
import { credit } from '@/lib/services/ledger';

/**
 * Les données fictives de la page de test (12/11/2026) : elles s'ajoutent une
 * fois, se retirent entièrement, et ne touchent pas aux vrais joueurs.
 */
function ligue() {
  const db = emptyDatabase();
  db.config.numero = 1;
  db.config.maxGamesPerPlayer = parametresSaison(1).games;
  const vrai = rattacheCompteTwitch(db, { id: 'tw-vrai', login: 'vrai', displayName: 'Vrai', avatarUrl: null, roleChaine: 'joueur' });
  credit(db, vrai.id, 1_234, 'AJUSTEMENT_ADMIN', null);
  return { db, vrai };
}

describe('les données fictives', () => {
  it('ajoutent 24 joueurs, leurs games, leurs cartes et 7 boosters, une seule fois', () => {
    const { db } = ligue();
    const bilan = ajouteDonneesFictives(db, 'testeur', new Date('2026-11-12T12:00:00.000Z'));
    expect(bilan).toMatchObject({ joueurs: 24, boosters: 7 });
    expect(bilan.games).toBeGreaterThan(200);
    expect(nombreDeFictifs(db)).toBe(24);
    // Les plus avancés s'arrêtent juste avant le Booster Finisseur.
    const parJoueur = db.players.filter(estFictif).map((p) => db.games.filter((g) => g.playerId === p.id).length);
    expect(Math.max(...parJoueur)).toBe(parametresSaison(1).finisseurA - 1);
    expect(() => ajouteDonneesFictives(db, 'testeur')).toThrow(/déjà là/);
  });

  it('se retirent entièrement, sans toucher aux vrais joueurs', () => {
    const { db, vrai } = ligue();
    ajouteDonneesFictives(db, 'testeur');
    const retire = retireDonneesFictives(db, 'testeur');
    expect(retire.joueurs).toBe(24);
    expect(db.players).toHaveLength(1);
    expect(db.games).toHaveLength(0);
    expect(db.cartesEnAttente.filter((c) => c.joueurId !== vrai.id)).toHaveLength(0);
    expect(db.packsDus).toHaveLength(0);
    expect(db.ledger.every((l) => l.playerId === vrai.id)).toBe(true);
    expect(db.players[0].snowflakes).toBe(1_234);
    expect(db.audit.at(-1)?.action).toBe('DONNEES_FICTIVES_RETIREES');
  });
});
