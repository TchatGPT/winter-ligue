import { describe, expect, it } from 'vitest';
import type { Database, Game } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { parametresSaison, SESSION_MINUTES } from '@/lib/domain/rules';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { jokersDe } from '@/lib/services/effects';
import { prochaineGamePossible } from '@/lib/services/league';
import { credit } from '@/lib/services/ledger';
import { ajoutePackDu, verifieFinisseur } from '@/lib/services/packs';
import { estResponsableSaison, nouvelleSaison } from '@/lib/services/saisons';

/**
 * Les saisons (12/11/2026) : la Mini Ligue — 38 games, le Finisseur à la 35ᵉ,
 * une game par session passé la 35ᵉ, pas de finale —, puis la saison 2, lancée
 * par une remise à zéro réservée au responsable.
 */

const T0 = Date.parse('2026-12-10T20:00:00.000Z');

function base(numero = 1): { db: Database; id: string } {
  const db = emptyDatabase();
  db.config.numero = numero;
  db.config.maxGamesPerPlayer = parametresSaison(numero).games;
  const p = rattacheCompteTwitch(db, { id: 'tw-a', login: 'alpha', displayName: 'Alpha', avatarUrl: null, roleChaine: 'joueur' });
  return { db, id: p.id };
}

/** `n` games, une toutes les deux heures : chacune dans sa session. */
function joue(db: Database, id: string, n: number, depuis = T0): Game[] {
  const faites: Game[] = [];
  for (let i = 0; i < n; i += 1) {
    const le = new Date(depuis + i * 2 * 3_600_000).toISOString();
    const g: Game = {
      id: `g${db.games.length + 1}`,
      playerId: id,
      kills: 5,
      placement: null,
      bonusPoints: 0,
      skipped: false,
      score: 5,
      note: null,
      playedAt: le,
      createdAt: le,
      applied: [],
    };
    db.games.push(g);
    faites.push(g);
  }
  return faites;
}

describe('la Mini Ligue', () => {
  it('se joue en 38 games, sans finale', () => {
    const s = parametresSaison(1);
    expect(s.games).toBe(38);
    expect(s.finisseurA).toBe(35);
    expect(s.finalistes).toBe(0);
  });

  it('ouvre le Booster Finisseur à la 35ᵉ game, pas avant, et une fois', () => {
    const { db, id } = base(1);
    joue(db, id, 34);
    expect(verifieFinisseur(db, id)).toBeNull();
    joue(db, id, 1, T0 + 100 * 3_600_000);
    expect(verifieFinisseur(db, id)?.packId).toBe('finisseur');
    expect(verifieFinisseur(db, id)).toBeNull();
  });

  it('passé la 35ᵉ, une seule game par session', () => {
    const { db, id } = base(1);
    const jouees = joue(db, id, 35);
    const derniere = Date.parse(jouees.at(-1)!.createdAt);
    // La 36ᵉ, juste après la 35ᵉ : même session, refusée.
    expect(prochaineGamePossible(db, id, new Date(derniere + 10 * 60_000))).not.toBeNull();
    // Une session plus tard : permise.
    expect(prochaineGamePossible(db, id, new Date(derniere + SESSION_MINUTES * 60_000 + 1))).toBeNull();
  });

  it('avant la 35ᵉ, autant de games qu’on veut dans une session', () => {
    const { db, id } = base(1);
    const jouees = joue(db, id, 20);
    expect(prochaineGamePossible(db, id, new Date(Date.parse(jouees.at(-1)!.createdAt) + 60_000))).toBeNull();
  });

  it('en saison 2, pas de règle de session', () => {
    const { db, id } = base(2);
    const jouees = joue(db, id, 50);
    expect(prochaineGamePossible(db, id, new Date(Date.parse(jouees.at(-1)!.createdAt) + 60_000))).toBeNull();
  });
});

describe('lancer une saison', () => {
  it('n’est permis qu’au responsable, lu par son identifiant Twitch', () => {
    const { db, id } = base(1);
    expect(estResponsableSaison(db, id)).toBe(false);
    const jeex = rattacheCompteTwitch(db, { id: '207954362', login: 'jeex3', displayName: 'Jeex3', avatarUrl: null, roleChaine: 'admin' });
    expect(estResponsableSaison(db, jeex.id)).toBe(true);
  });

  it('remet la ligue à zéro, garde les comptes, et règle la saison 2', () => {
    const { db, id } = base(1);
    joue(db, id, 12);
    credit(db, id, 4_000, 'AJUSTEMENT_ADMIN', null);
    ajoutePackDu(db, 'perso', id, 'test');
    db.config.totalSubs = 1_478;
    const joueur = db.players.find((p) => p.id === id)!;
    joueur.creneauxBonus = 2;
    joueur.cadeauSerie = 5;

    const bilan = nouvelleSaison(db, 2, 'jeex', new Date('2027-01-04T10:00:00.000Z'));
    expect(bilan).toMatchObject({ numero: 2, games: 60, supprimees: { games: 12, boosters: 1 } });
    expect(db.games).toHaveLength(0);
    expect(db.packsDus).toHaveLength(0);
    expect(db.config).toMatchObject({ numero: 2, maxGamesPerPlayer: 60, totalSubs: 0, remiseA: '2027-01-04T10:00:00.000Z' });
    expect(db.players).toHaveLength(1);
    expect(joueur.snowflakes).toBe(0);
    expect(joueur.creneauxBonus).toBe(0);
    expect(joueur.cadeauSerie).toBe(0);
    // Les flocons repartent par le grand livre, qui en garde la trace.
    expect(db.ledger.at(-1)).toMatchObject({ delta: -4_000, refId: 'saison-2' });
    // Trois Jokers pour repartir.
    expect(jokersDe(db, id)).toHaveLength(3);
    expect(db.audit.at(-1)?.action).toBe('NOUVELLE_SAISON');
  });
});
