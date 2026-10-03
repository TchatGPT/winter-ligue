import { describe, expect, it } from 'vitest';
import type { Database } from '@/lib/db/entities';
import { emptyDatabase } from '@/lib/db/store';
import { TYPE_TCHAT } from '@/lib/domain/twitchSubs';
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

/** Une annonce du tchat de la chaîne, par `qui`. */
function annonce(notice: string, partie: Record<string, unknown>, qui = 'tw-joueur', id = `m${++numero}`) {
  return {
    id,
    type: TYPE_TCHAT,
    evenement: {
      broadcaster_user_id: 'tw-chaine',
      broadcaster_user_login: 'lriaa',
      chatter_user_id: qui,
      chatter_user_name: qui === 'tw-joueur' ? 'Généreux' : 'X',
      chatter_is_anonymous: false,
      notice_type: notice,
      source_broadcaster_user_id: null,
      [notice]: partie,
    },
    maintenant: MAINTENANT,
  };
}

const sub = (tier: string, prime = false) => ({ sub_tier: tier, is_prime: prime, duration_months: 1 });
const resub = (tier: string, prime = false) => ({
  sub_tier: tier,
  is_prime: prime,
  is_gift: false,
  cumulative_months: 3,
});

const joueur = (db: Database) => db.players.find((p) => p.twitchId === 'tw-joueur')!;
const boostersPerso = (db: Database) => db.packsDus.filter((p) => p.packId === 'perso' && p.joueurId !== null);

describe('les subs de Twitch, au compteur de la saison', () => {
  it('s’inscrivent au registre des subs, un par message compté', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('community_sub_gift', { id: 'cg', total: 5, sub_tier: '1000' }, 'tw-x'));
    ajouteSubsTwitch(
      db,
      annonce('sub_gift', { sub_tier: '1000', recipient_user_id: 'r', community_gift_id: 'cg' }, 'tw-x'),
    );
    expect(db.config.totalSubs).toBe(5);
    expect(db.subsTwitch).toHaveLength(1);
    expect(db.subsTwitch[0]).toMatchObject({ genre: 'cadeau', twitchId: 'tw-x', pseudo: 'X', nombre: 5, niveau: 1 });
  });

  it('comptent chacun une seule fois, resubs compris, sans les Prime', () => {
    const db = base();
    const nouveau = annonce('sub', sub('1000'), 'tw-x');
    ajouteSubsTwitch(db, nouveau);
    ajouteSubsTwitch(db, nouveau); // renvoyé par Twitch
    ajouteSubsTwitch(db, annonce('resub', resub('2000'), 'tw-x'));
    ajouteSubsTwitch(db, annonce('sub', sub('1000', true), 'tw-x'));
    ajouteSubsTwitch(db, annonce('resub', resub('1000', true), 'tw-x'));
    expect(db.config.totalSubs).toBe(2);
    expect(db.subsTwitch.map((l) => l.genre)).toEqual(['sub', 'resub']);
  });

  it('comptent encore par l’ancien branchement, tant que la streameuse n’a pas rebranché', () => {
    const db = base();
    ajouteSubsTwitch(db, {
      id: 'ancien',
      type: 'channel.subscribe',
      evenement: { user_id: 'tw-x', user_name: 'X', tier: '1000', is_gift: false },
      maintenant: MAINTENANT,
    });
    expect(db.config.totalSubs).toBe(1);
  });
});

describe('ce qu’un sub vaut à un joueur', () => {
  it('un T3 compte pour un et met d’office un Booster Perso en file pour qui l’a payé', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('sub', sub('3000')));
    expect(db.config.totalSubs).toBe(1);
    expect(boostersPerso(db)).toHaveLength(1);
    expect(boostersPerso(db)[0].joueurId).toBe(joueur(db).id);
    expect(db.subsTwitch.at(-1)).toMatchObject({ genre: 'sub', twitchId: 'tw-joueur', niveau: 3 });
    expect(db.audit.at(-1)).toMatchObject({ action: 'BOOSTER_PERSO_GAGNE', targetId: joueur(db).id });
  });

  it('cinq subs offerts en valent un, et les cadeaux s’additionnent sur la saison', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('community_sub_gift', { id: 'cg1', total: 10, sub_tier: '1000' }));
    expect(boostersPerso(db)).toHaveLength(2);
    ajouteSubsTwitch(db, annonce('community_sub_gift', { id: 'cg2', total: 3, sub_tier: '2000' }));
    expect(boostersPerso(db)).toHaveLength(2);
    ajouteSubsTwitch(db, annonce('community_sub_gift', { id: 'cg3', total: 2, sub_tier: '1000' }));
    expect(boostersPerso(db)).toHaveLength(3);
    expect(joueur(db).subsOfferts).toBe(15);
  });

  it('un sub T3 offert en vaut un chacun, sans compter dans les cinq', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('community_sub_gift', { id: 'cg', total: 2, sub_tier: '3000' }));
    expect(boostersPerso(db)).toHaveLength(2);
    expect(joueur(db).subsOfferts).toBe(0);
  });

  it('un sub T1 pour soi, un resub ou un Prime ne valent rien à personne', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('sub', sub('1000')));
    ajouteSubsTwitch(db, annonce('resub', resub('2000')));
    ajouteSubsTwitch(db, annonce('sub', sub('3000', true)));
    expect(boostersPerso(db)).toHaveLength(0);
  });

  it('ne verse rien à quelqu’un qui n’a pas de compte, ni pour un cadeau anonyme', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('sub', sub('3000'), 'tw-inconnu'));
    ajouteSubsTwitch(db, {
      ...annonce('community_sub_gift', { id: 'cg', total: 5, sub_tier: '1000' }),
      evenement: {
        ...annonce('community_sub_gift', { id: 'cg', total: 5, sub_tier: '1000' }).evenement,
        chatter_is_anonymous: true,
      },
    });
    expect(boostersPerso(db)).toHaveLength(0);
    expect(db.config.totalSubs).toBe(6);
  });

  it('ne verse rien à la streameuse', () => {
    const db = base();
    rattacheCompteTwitch(db, {
      id: 'tw-chaine',
      login: 'lriaa',
      displayName: 'Lriaa',
      avatarUrl: null,
      roleChaine: 'admin',
    });
    ajouteSubsTwitch(db, annonce('sub', sub('3000'), 'tw-chaine'));
    expect(boostersPerso(db)).toHaveLength(0);
  });
});

describe('la remise à zéro du compteur', () => {
  it('repart de zéro sans rien reprendre de ce qui a été versé', () => {
    const db = base();
    ajouteSubsTwitch(db, annonce('community_sub_gift', { id: 'cg', total: 10, sub_tier: '1000' }));
    const solde = joueur(db).snowflakes;

    expect(remetSubsAZero(db, 'un-admin')).toEqual({ avant: 10 });
    expect(db.config.totalSubs).toBe(0);
    expect(db.subEvents).toHaveLength(0);
    expect(joueur(db).snowflakes).toBe(solde);
    expect(db.audit.some((a) => a.action === 'SUBS_REMIS_A_ZERO')).toBe(true);
  });
});
