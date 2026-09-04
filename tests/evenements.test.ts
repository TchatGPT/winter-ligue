import { describe, expect, it } from 'vitest';
import { type Database, type Player } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { BOOSTERS } from '@/lib/domain/catalog';
import {
  EVENEMENTS_SUBS,
  FACTEURS_EVENEMENTS,
  evenementsDeclenches,
  facteurEvenement,
} from '@/lib/domain/rules';
import { prixSansEvenement, resolvedBooster, resolvedBoosters } from '@/lib/services/boosters';
import {
  declencheEvenements,
  evenementsActifs,
  facteurCartes,
  facteurGain,
  facteurPrix,
} from '@/lib/services/evenements';
import { addSubs } from '@/lib/services/subs';

/**
 * Ce que les évènements de subs doivent garantir.
 *
 * Ils changent les règles pour tout le monde, pendant une fenêtre : ce qui est
 * testé ici, c'est le déclenchement (à quel palier, combien de fois), la
 * fenêtre (quand elle commence, quand elle finit, comment deux fenêtres du
 * même genre s'enchaînent) et l'absence de cumul — la seule façon pour un
 * évènement de coûter plus qu'annoncé.
 */

const T0 = new Date('2027-01-10T20:00:00.000Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

const braderie = EVENEMENTS_SUBS.find((e) => e.kind === 'BOOSTERS_MOITIE')!;
const avalanche = EVENEMENTS_SUBS.find((e) => e.kind === 'FLOCONS_DOUBLES')!;

function joueur(id: string): Player {
  return {
    id,
    slug: id,
    pseudo: id,
    twitchId: null,
    twitchLogin: null,
    avatarUrl: null,
    snowflakes: 0,
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
    }
  });

  it('a un facteur qui va dans le sens annoncé pour chaque genre', () => {
    expect(FACTEURS_EVENEMENTS.BOOSTERS_MOITIE).toBeLessThan(1);
    expect(FACTEURS_EVENEMENTS.FLOCONS_DOUBLES).toBe(2);
    expect(FACTEURS_EVENEMENTS.CARTES_RENFORCEES).toBeGreaterThan(1);
  });
});

describe('evenementsDeclenches', () => {
  it('ne déclenche rien tant qu’aucun palier n’est franchi', () => {
    expect(evenementsDeclenches(0, braderie.every - 1)).toEqual([]);
    expect(evenementsDeclenches(braderie.every, braderie.every + 1)).toEqual([]);
  });

  it('déclenche exactement au franchissement, et une fois par franchissement', () => {
    const un = evenementsDeclenches(braderie.every - 1, braderie.every);
    expect(un.filter((e) => e.kind === 'BOOSTERS_MOITIE')).toHaveLength(1);

    // +120 subs d'un coup sur un palier de 50 : deux franchissements.
    const deux = evenementsDeclenches(0, braderie.every * 2 + 20);
    expect(deux.filter((e) => e.kind === 'BOOSTERS_MOITIE')).toHaveLength(2);
  });

  it('déclenche tous les genres dont le palier est franchi', () => {
    const grand = Math.max(...EVENEMENTS_SUBS.map((e) => e.every));
    const tous = evenementsDeclenches(0, grand);
    for (const e of EVENEMENTS_SUBS) {
      expect(tous.filter((d) => d === e).length).toBe(Math.floor(grand / e.every));
    }
  });
});

describe('facteurEvenement', () => {
  it('vaut 1 sans évènement du genre', () => {
    expect(facteurEvenement('BOOSTERS_MOITIE', [])).toBe(1);
    expect(facteurEvenement('BOOSTERS_MOITIE', ['FLOCONS_DOUBLES'])).toBe(1);
  });

  it('ne cumule pas deux évènements du même genre', () => {
    /*
     * C'est la règle qui protège le prix annoncé : deux braderies ne font pas
     * des sachets à un quart du prix, ce qu'aucun palier ne promet.
     */
    expect(facteurEvenement('BOOSTERS_MOITIE', ['BOOSTERS_MOITIE', 'BOOSTERS_MOITIE'])).toBe(
      FACTEURS_EVENEMENTS.BOOSTERS_MOITIE,
    );
    expect(facteurEvenement('FLOCONS_DOUBLES', ['FLOCONS_DOUBLES', 'FLOCONS_DOUBLES'])).toBe(2);
  });
});

describe('declencheEvenements', () => {
  it('ouvre une fenêtre maintenant, de la durée annoncée', () => {
    const db = emptyDatabase();
    const crees = declencheEvenements(db, braderie.every - 1, braderie.every, T0);
    expect(crees).toHaveLength(1);
    expect(crees[0].kind).toBe('BOOSTERS_MOITIE');
    expect(crees[0].startsAt).toBe(T0.toISOString());
    expect(crees[0].endsAt).toBe(minutes(braderie.dureeMinutes).toISOString());
    expect(crees[0].declencheA).toBe(braderie.every);
    expect(db.evenements).toHaveLength(1);
  });

  it('enchaîne deux fenêtres du même genre au lieu de les superposer', () => {
    /*
     * Sinon deux franchissements feraient exactement le même effet qu'un seul,
     * et le chat aurait payé le second pour rien.
     */
    const db = emptyDatabase();
    const crees = declencheEvenements(db, 0, braderie.every * 2, T0);
    const bras = crees.filter((e) => e.kind === 'BOOSTERS_MOITIE');
    expect(bras).toHaveLength(2);
    expect(bras[0].startsAt).toBe(T0.toISOString());
    expect(bras[1].startsAt).toBe(bras[0].endsAt);
    expect(bras[1].endsAt).toBe(minutes(braderie.dureeMinutes * 2).toISOString());

    // À l'instant du déclenchement, une seule est active ; le facteur est
    // celui du genre, pas son carré.
    expect(evenementsActifs(db, T0).filter((e) => e.kind === 'BOOSTERS_MOITIE')).toHaveLength(1);
    expect(facteurPrix(db, T0)).toBe(FACTEURS_EVENEMENTS.BOOSTERS_MOITIE);
    // Et la seconde prend le relais quand la première finit.
    expect(facteurPrix(db, minutes(braderie.dureeMinutes + 1))).toBe(
      FACTEURS_EVENEMENTS.BOOSTERS_MOITIE,
    );
    expect(facteurPrix(db, minutes(braderie.dureeMinutes * 2 + 1))).toBe(1);
  });

  it('ne fait rien entre deux paliers', () => {
    const db = emptyDatabase();
    expect(declencheEvenements(db, 1, 2, T0)).toEqual([]);
    expect(db.evenements).toHaveLength(0);
  });
});

describe('evenementsActifs et les facteurs', () => {
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

  it('vaut 1 partout sans évènement', () => {
    const db = emptyDatabase();
    expect(facteurPrix(db, T0)).toBe(1);
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
    expect(facteurPrix(db, T0)).toBe(1);
    expect(facteurGain(db, T0)).toBe(1);
  });
});

describe('le prix des sachets pendant une braderie', () => {
  it('resolvedBooster rend le prix du jour, prixSansEvenement l’ancien', () => {
    /*
     * C'est le seul point où la braderie s'applique : boutique, affrontements
     * et affichage lisent tous `resolvedBooster`. Un test ici couvre les trois.
     */
    const db = emptyDatabase();
    declencheEvenements(db, 0, braderie.every, new Date());
    for (const b of BOOSTERS) {
      const jour = resolvedBooster(db, b.id)!;
      const avant = prixSansEvenement(db, b.id)!;
      expect(avant).toBe(b.price);
      expect(jour.price).toBe(
        Math.max(1, Math.round(b.price * FACTEURS_EVENEMENTS.BOOSTERS_MOITIE)),
      );
      expect(jour.price).toBeLessThan(avant);
    }
    // Et la liste dit la même chose que l'unité.
    for (const b of resolvedBoosters(db)) {
      expect(b.price).toBe(resolvedBooster(db, b.id)!.price);
    }
  });

  it('respecte un prix réglé par l’administration avant de le réduire', () => {
    const db = emptyDatabase();
    const cible = BOOSTERS[0];
    db.boosterSettings.push({ boosterId: cible.id, price: 300, updatedAt: T0.toISOString() });
    expect(resolvedBooster(db, cible.id)!.price).toBe(300);
    declencheEvenements(db, 0, braderie.every, new Date());
    expect(prixSansEvenement(db, cible.id)).toBe(300);
    expect(resolvedBooster(db, cible.id)!.price).toBe(150);
  });

  it('ne descend jamais sous un flocon', () => {
    const db = emptyDatabase();
    db.boosterSettings.push({ boosterId: BOOSTERS[0].id, price: 1, updatedAt: T0.toISOString() });
    declencheEvenements(db, 0, braderie.every, new Date());
    expect(resolvedBooster(db, BOOSTERS[0].id)!.price).toBe(1);
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
    addSubs(db, braderie.every, 'test');
    const a = db.players.find((p) => p.id === 'a')!.snowflakes;
    const b = db.players.find((p) => p.id === 'b')!.snowflakes;
    expect(a).toBe(b);
    // Un évènement n'a pas de bénéficiaire : aucune ligne de grand livre ne
    // le mentionne.
    expect(db.ledger.every((l) => !/EVENEMENT/i.test(l.reason))).toBe(true);
  });
});
