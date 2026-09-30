import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { rattacheCompteTwitch } from '@/lib/services/comptes';
import { ajouteSubsTwitch, remetSubsAZero } from '@/lib/services/subs';

/**
 * Les subs qui arrivent de Twitch, une fois dans la base : ce qu'ils font au
 * compteur de la saison, et ce qu'ils valent — ou non — à un joueur.
 */
const MAINTENANT = Date.parse('2026-12-01T20:00:00.000Z');
let numero = 0;

function base(): Database {
  const db = emptyDatabase();
  rattacheCompteTwitch(db, {
    id: 'tw-joueur',
    login: 'genereux',
    displayName: 'Généreux',
    avatarUrl: null,
    roleChaine: 'joueur',
  });
  return db;
}

function message(type: string, evenement: Record<string, unknown>, id = `m${++numero}`) {
  return {
    id,
    type,
    evenement: { broadcaster_user_id: 'tw-chaine', broadcaster_user_login: 'lriaa', ...evenement },
    maintenant: MAINTENANT,
  };
}

const joueur = (db: Database) => db.players.find((p) => p.twitchId === 'tw-joueur')!;
const boostersPerso = (db: Database) => db.packsDus.filter((p) => p.packId === 'perso' && p.joueurId !== null);

describe('les subs de Twitch, au compteur de la saison', () => {
  it('s’inscrivent au registre des subs, un par message compté', () => {
    const db = base();
    ajouteSubsTwitch(db, message('channel.subscription.gift', { user_id: 'tw-x', user_name: 'X', total: 5, tier: '1000' }));
    ajouteSubsTwitch(db, message('channel.subscribe', { user_id: 'tw-x', is_gift: true }));
    expect(db.subsTwitch).toHaveLength(1);
    expect(db.subsTwitch[0]).toMatchObject({ genre: 'cadeau', twitchId: 'tw-x', pseudo: 'X', nombre: 5 });
  });

  it('comptent chacun une seule fois, sans les réabonnements', () => {
    const db = base();
    const sub = message('channel.subscribe', { user_id: 'x', tier: '1000', is_gift: false });
    ajouteSubsTwitch(db, sub);
    ajouteSubsTwitch(db, sub); // renvoyé par Twitch
    ajouteSubsTwitch(db, message('channel.subscription.message', { user_id: 'x', tier: '1000' }));
    expect(db.config.totalSubs).toBe(1);
  });
});

describe('ce qu’un sub vaut à un joueur', () => {
  it('rien : les Boosters Perso se règlent à la main, quel que soit le sub', () => {
    const db = base();
    ajouteSubsTwitch(db, message('channel.subscription.gift', { user_id: 'tw-joueur', total: 10, tier: '1000' }));
    ajouteSubsTwitch(db, message('channel.subscribe', { user_id: 'tw-joueur', tier: '3000', is_gift: false }));
    expect(db.config.totalSubs).toBe(11);
    expect(joueur(db).subsOfferts).toBe(0);
    expect(boostersPerso(db)).toHaveLength(0);
  });
});

describe('la remise à zéro du compteur', () => {
  it('repart de zéro sans rien reprendre de ce qui a été versé', () => {
    const db = base();
    ajouteSubsTwitch(db, message('channel.subscription.gift', { user_id: 'tw-joueur', total: 10, tier: '1000' }));
    const solde = joueur(db).snowflakes;

    expect(remetSubsAZero(db, 'un-admin')).toEqual({ avant: 10 });
    expect(db.config.totalSubs).toBe(0);
    expect(db.subEvents).toHaveLength(0);
    expect(joueur(db).snowflakes).toBe(solde);
    expect(db.audit.some((a) => a.action === 'SUBS_REMIS_A_ZERO')).toBe(true);
  });
});
