import { describe, expect, it } from 'vitest';
import { type Database, type Game, type Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import {
  CARD_IMPACT_CAP,
  EVENEMENTS_SUBS,
  FACTEURS_EVENEMENTS,
  GAME_LIMITS,
  evenementsDeclenches,
  facteurEvenement,
  prochainEvenement,
} from '@/lib/domain/rules';
import { appliqueCartesEnAttente } from '@/lib/services/effects';
import {
  declencheEvenements,
  evenementsActifs,
  facteurCartes,
  facteurGain,
} from '@/lib/services/evenements';
import { addSubs } from '@/lib/services/subs';

/**
 * Ce que les évènements de subs doivent garantir.
 *
 * Ils changent les règles pour tout le monde, pendant une fenêtre : ce qui est
 * testé ici, c'est le déclenchement (à quel palier, combien de fois), la
 * fenêtre (quand elle commence, quand elle finit, comment deux fenêtres du
 * même genre s'enchaînent) et l'absence de cumul — la seule façon pour un
 * évènement de donner plus qu'annoncé.
 */

const T0 = new Date('2027-01-10T20:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

const avalanche = EVENEMENTS_SUBS.find((e) => e.label === 'Avalanche')!;
const blizzard = EVENEMENTS_SUBS.find((e) => e.label === 'Blizzard')!;

function joueur(id: string): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    activisionId: null,
    snowflakes: 0,
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

describe('la table des évènements', () => {
  it('a des paliers positifs, des durées courtes et un libellé', () => {
    for (const e of EVENEMENTS_SUBS) {
      expect(e.every).toBeGreaterThan(0);
      expect(e.dureeMinutes).toBeGreaterThan(0);
      // Un évènement de plus de quatre heures serait un réglage, pas un évènement.
      expect(e.dureeMinutes).toBeLessThanOrEqual(240);
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.resume.length).toBeGreaterThan(0);
    }
  });

  it('a un facteur qui va dans le sens annoncé pour chaque genre', () => {
    expect(FACTEURS_EVENEMENTS.FLOCONS_DOUBLES).toBe(2);
    expect(FACTEURS_EVENEMENTS.CARTES_RENFORCEES).toBeGreaterThan(1);
    for (const e of EVENEMENTS_SUBS) expect(FACTEURS_EVENEMENTS[e.kind]).toBeGreaterThan(1);
  });

  it('ne change que les règles : aucun évènement ne verse ni ne désigne', () => {
    for (const e of EVENEMENTS_SUBS) {
      expect(e).not.toHaveProperty('amount');
      expect(e).not.toHaveProperty('playerId');
      expect(e).not.toHaveProperty('joueurId');
    }
  });
});

describe('evenementsDeclenches', () => {
  it('ne déclenche rien tant qu’aucun palier n’est franchi', () => {
    expect(evenementsDeclenches(0, avalanche.every - 1)).toEqual([]);
    expect(evenementsDeclenches(avalanche.every, avalanche.every + 1)).toEqual([]);
  });

  it('déclenche exactement au franchissement, et une fois par franchissement', () => {
    const un = evenementsDeclenches(avalanche.every - 1, avalanche.every);
    expect(un.filter((e) => e === avalanche)).toHaveLength(1);

    // Deux paliers franchis d'un coup : deux déclenchements.
    const deux = evenementsDeclenches(0, avalanche.every * 2 + 20);
    expect(deux.filter((e) => e === avalanche)).toHaveLength(2);
  });

  it('déclenche tous les genres dont le palier est franchi', () => {
    const grand = Math.max(...EVENEMENTS_SUBS.map((e) => e.every));
    const tous = evenementsDeclenches(0, grand);
    for (const e of EVENEMENTS_SUBS) {
      expect(tous.filter((d) => d === e).length).toBe(Math.floor(grand / e.every));
    }
  });

  it('annonce le palier le plus proche', () => {
    const prochain = prochainEvenement(avalanche.every - 10)!;
    expect(prochain.evenement).toBe(avalanche);
    expect(prochain.remaining).toBe(10);
  });
});

describe('facteurEvenement', () => {
  it('vaut 1 sans évènement du genre', () => {
    expect(facteurEvenement('FLOCONS_DOUBLES', [])).toBe(1);
    expect(facteurEvenement('FLOCONS_DOUBLES', ['CARTES_RENFORCEES'])).toBe(1);
  });

  it('ne cumule pas deux évènements du même genre', () => {
    /*
     * C'est la règle qui protège ce qui est annoncé : deux Avalanches ne font
     * pas des flocons quadruplés, ce qu'aucun palier ne promet.
     */
    expect(facteurEvenement('FLOCONS_DOUBLES', ['FLOCONS_DOUBLES', 'FLOCONS_DOUBLES'])).toBe(2);
    expect(
      facteurEvenement('CARTES_RENFORCEES', ['CARTES_RENFORCEES', 'CARTES_RENFORCEES']),
    ).toBe(FACTEURS_EVENEMENTS.CARTES_RENFORCEES);
  });
});

describe('declencheEvenements', () => {
  it('ouvre une fenêtre maintenant, de la durée annoncée', () => {
    const db = emptyDatabase();
    const crees = declencheEvenements(db, avalanche.every - 1, avalanche.every, T0);
    expect(crees).toHaveLength(1);
    expect(crees[0].kind).toBe('FLOCONS_DOUBLES');
    expect(crees[0].label).toBe(avalanche.label);
    expect(crees[0].startsAt).toBe(T0.toISOString());
    expect(crees[0].endsAt).toBe(minutes(avalanche.dureeMinutes).toISOString());
    expect(crees[0].declencheA).toBe(avalanche.every);
    expect(db.evenements).toHaveLength(1);
  });

  it('enchaîne deux fenêtres du même genre au lieu de les superposer', () => {
    /*
     * Sinon deux franchissements feraient exactement le même effet qu'un seul,
     * et le chat aurait payé le second pour rien.
     */
    const db = emptyDatabase();
    const crees = declencheEvenements(db, avalanche.every - 1, avalanche.every * 2, T0);
    const flocons = crees.filter((e) => e.kind === 'FLOCONS_DOUBLES');
    expect(flocons).toHaveLength(2);
    expect(flocons[0].startsAt).toBe(T0.toISOString());
    expect(flocons[1].startsAt).toBe(flocons[0].endsAt);
    expect(flocons[1].endsAt).toBe(minutes(avalanche.dureeMinutes * 2).toISOString());

    // À l'instant du déclenchement, une seule est active ; le facteur est
    // celui du genre, pas son carré.
    expect(evenementsActifs(db, T0).filter((e) => e.kind === 'FLOCONS_DOUBLES')).toHaveLength(1);
    expect(facteurGain(db, T0)).toBe(2);
    // Et la seconde prend le relais quand la première finit.
    expect(facteurGain(db, minutes(avalanche.dureeMinutes + 1))).toBe(2);
    expect(facteurGain(db, minutes(avalanche.dureeMinutes * 2 + 1))).toBe(1);
  });

  it('ne fait rien entre deux paliers', () => {
    const db = emptyDatabase();
    expect(declencheEvenements(db, 1, 2, T0)).toEqual([]);
    expect(db.evenements).toHaveLength(0);
  });
});

function avec(
  kind: (typeof EVENEMENTS_SUBS)[number]['kind'],
  debut: Date,
  duree: number,
): Database {
  const db = emptyDatabase();
  db.evenements.push({
    id: 'e1',
    kind,
    label: 'test',
    description: 'test',
    startsAt: debut.toISOString(),
    endsAt: new Date(debut.getTime() + duree * 60_000).toISOString(),
    declencheA: 0,
  });
  return db;
}

describe('evenementsActifs et les facteurs', () => {
  it('vaut 1 partout sans évènement', () => {
    const db = emptyDatabase();
    expect(facteurGain(db, T0)).toBe(1);
    expect(facteurCartes(db, T0)).toBe(1);
  });

  it('s’applique pendant la fenêtre, et plus après', () => {
    const db = avec('FLOCONS_DOUBLES', T0, 60);
    expect(facteurGain(db, minutes(-1))).toBe(1);
    expect(facteurGain(db, T0)).toBe(2);
    expect(facteurGain(db, minutes(59))).toBe(2);
    expect(facteurGain(db, minutes(60))).toBe(1);
    expect(evenementsActifs(db, minutes(60))).toEqual([]);
  });

  it('un genre ne touche pas les autres', () => {
    const db = avec('CARTES_RENFORCEES', T0, 60);
    expect(facteurCartes(db, T0)).toBe(FACTEURS_EVENEMENTS.CARTES_RENFORCEES);
    expect(facteurGain(db, T0)).toBe(1);
  });
});

describe('les cartes pendant un blizzard', () => {
  /** Une game saisie maintenant, avec une carte posée dessus. */
  function partie(db: Database, cardId: string, kills: number): Game {
    db.players.push(joueur('a'));
    db.cartesEnAttente.push({
      id: 'c1',
      joueurId: 'a',
      cardId,
      ouvertureId: 'o1',
      creeA: '2027-01-10T19:00:00.000Z',
      consommeeA: null,
      gameId: null,
      resultat: null,
      paireId: null,
    });
    const game: Game = {
      id: 'g1',
      playerId: 'a',
      kills,
      placement: null,
      bonusPoints: 0,
      skipped: false,
      score: kills,
      note: null,
      playedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      applied: [],
    };
    db.games.push(game);
    appliqueCartesEnAttente(db, game);
    return game;
  }

  const enCours = () => avec('CARTES_RENFORCEES', new Date(Date.now() - 60_000), 60);

  /** Ce qu'une carte à valeur simple annonce, lu dans le catalogue. */
  const annonce = (cardId: string): number => {
    const e = getCard(cardId)!.effect;
    if (e.kind !== 'bonus_points' && e.kind !== 'malus_points') throw new Error(`${cardId} a changé de genre`);
    return e.value;
  };

  it('majore un bonus du facteur annoncé', () => {
    const calme = partie(emptyDatabase(), 'second-souffle', 5);
    const renforcee = partie(enCours(), 'second-souffle', 5);
    expect(calme.bonusPoints).toBe(annonce('second-souffle'));
    expect(renforcee.bonusPoints).toBe(
      Math.round(annonce('second-souffle') * FACTEURS_EVENEMENTS.CARTES_RENFORCEES),
    );
  });

  it('majore un malus dans son sens : il retire davantage', () => {
    const renforcee = partie(enCours(), 'contre-courant', 20);
    expect(renforcee.bonusPoints).toBe(
      -Math.round(annonce('contre-courant') * FACTEURS_EVENEMENTS.CARTES_RENFORCEES),
    );
  });

  it('reste sous les bornes d’une game, même sur la carte la plus forte', () => {
    const renforcee = partie(enCours(), 'etoile-du-nord', 5);
    expect(renforcee.bonusPoints).toBe(
      Math.round(CARD_IMPACT_CAP * FACTEURS_EVENEMENTS.CARTES_RENFORCEES),
    );
    expect(renforcee.bonusPoints).toBeLessThanOrEqual(GAME_LIMITS.maxBonusPoints);
  });
});

describe('addSubs déclenche les évènements', () => {
  it('ouvre les fenêtres dans la même saisie que les flocons de palier', () => {
    const db = emptyDatabase();
    db.players.push(joueur('a'), joueur('b'));
    const r = addSubs(db, avalanche.every, 'test');
    expect(r.totalSubs).toBe(avalanche.every);
    expect(r.evenements.map((e) => e.label)).toContain(avalanche.label);
    expect(db.evenements.some((e) => e.kind === 'FLOCONS_DOUBLES')).toBe(true);
    expect(facteurGain(db)).toBe(2);
    // Un sub de plus n'ouvre rien : le palier suivant n'est pas atteint.
    const r2 = addSubs(db, 1, 'test');
    expect(r2.evenements).toEqual([]);
  });

  it('ne verse rien de plus à personne — les évènements ne sont pas des crédits', () => {
    const db = emptyDatabase();
    db.players.push(joueur('a'), joueur('b'));
    const r = addSubs(db, blizzard.every, 'test');
    const a = db.players.find((p) => p.id === 'a')!.snowflakes;
    const b = db.players.find((p) => p.id === 'b')!.snowflakes;
    expect(a).toBe(b);
    // Chacun a touché les flocons des paliers, et rien d'autre.
    expect(a).toBe(r.snowflakesEach);
    // Un évènement n'a pas de bénéficiaire : aucune ligne de grand livre ne
    // le mentionne.
    expect(db.ledger.every((l) => l.reason === 'SUBS_TWITCH')).toBe(true);
  });

  it('laisse de côté les joueurs inactifs', () => {
    const db = emptyDatabase();
    db.players.push(joueur('a'), { ...joueur('parti'), active: false });
    const r = addSubs(db, 5, 'test');
    expect(r.recipients).toBe(1);
    expect(db.players.find((p) => p.id === 'parti')!.snowflakes).toBe(0);
  });

  it('met les boosters collectifs en file, sans les ouvrir', () => {
    const db = emptyDatabase();
    db.players.push(joueur('a'));
    const r = addSubs(db, 50, 'test');
    expect(r.packs).toEqual(['commu']);
    expect(db.packsDus).toHaveLength(1);
    expect(db.packsDus[0].joueurId).toBeNull();
    expect(db.packsDus[0].ouvertureId).toBeNull();
    expect(db.ouvertures).toHaveLength(0);
  });
});
