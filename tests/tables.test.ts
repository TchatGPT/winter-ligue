import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { COLLECTIONS, empreintes } from '@/lib/db/tables';

function base(): Database {
  return {
    version: 2,
    config: { maxGamesPerPlayer: 60, totalSubs: 0, seasonStartsAt: '2026-12-01T00:00:00.000Z', seasonEndsAt: '2027-03-01T00:00:00.000Z', overlayGeneration: 1, twitchVus: [] },
    players: [
      {
        id: 'p1', slug: 'boreal', pseudo: 'Boreal', twitchId: null, twitchLogin: null, avatarUrl: null,
        activisionId: null, snowflakes: 100, subsOfferts: 0, creneauxBonus: 0, immuniseJusqua: null, joinedAt: '2026-09-01T00:00:00.000Z', active: true, role: 'joueur', sessionsDepuis: null, roleManuel: false,
      },
    ],
    games: [], packsDus: [], ouvertures: [], cartesEnAttente: [], ledger: [], subEvents: [],
    audit: [], reglagesPacks: [], batailles: [], evenements: [], codesCadeaux: [],
  };
}

describe('empreintes', () => {
  it('voit un champ renommé changer — le solde de flocons', () => {
    // Le bug qu'elle couvre : l'empreinte lisait les noms de colonnes
    // (« flocons ») sur l'objet, qui porte « snowflakes » : le changement de
    // solde était invisible, et jamais réécrit.
    const db = base();
    const avant = empreintes(db);
    db.players[0].snowflakes += 200;
    const apres = empreintes(db);
    expect(apres.get('joueurs')!.get('p1')).not.toBe(avant.get('joueurs')!.get('p1'));
  });

  it('ne voit rien quand rien ne change', () => {
    const db = base();
    expect(empreintes(db).get('joueurs')!.get('p1')).toBe(empreintes(db).get('joueurs')!.get('p1'));
  });

  it('voit la configuration changer', () => {
    const db = base();
    const avant = empreintes(db);
    db.config.totalSubs = 5;
    expect(empreintes(db).get('saison')!.get('1')).not.toBe(avant.get('saison')!.get('1'));
  });

  it('décrit chaque champ de chaque collection une seule fois', () => {
    for (const col of COLLECTIONS) {
      const champs = col.colonnes.map((c) => c.champ);
      const colonnes = col.colonnes.map((c) => c.col);
      expect(new Set(champs).size).toBe(champs.length);
      expect(new Set(colonnes).size).toBe(colonnes.length);
      expect(champs).toContain(col.idChamp);
    }
  });
});
