import { describe, expect, it } from 'vitest';
import {
  boostersDuGeste,
  dejaVu,
  FRAICHEUR_MS,
  gesteDuMessage,
  ligneDuGeste,
  MEMOIRE_MAX,
  MEMOIRE_MS,
  messageFrais,
  persoEnAttente,
  recitDuGeste,
  retiens,
  roleDuMessage,
  SUBS_PAR_MESSAGE_MAX,
  TYPE_TCHAT,
} from '@/lib/domain/twitchSubs';

/**
 * Les subs qui arrivent de Twitch, par les annonces du tchat : un sub payé
 * compte pour un, une fois et une seule ; un sub Prime ne compte pas.
 */

/** Une annonce du tchat de la chaîne, telle que Twitch l'envoie. */
function annonce(notice: string, partie: Record<string, unknown> | null, autres: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: 'tw-chaine',
    broadcaster_user_login: 'lriaa',
    chatter_user_id: 'tw-alex',
    chatter_user_name: 'Alex',
    chatter_is_anonymous: false,
    notice_type: notice,
    source_broadcaster_user_id: null,
    sub: null,
    resub: null,
    sub_gift: null,
    community_sub_gift: null,
    [notice]: partie,
    ...autres,
  };
}

const vaut = (evenement: Record<string, unknown>) => gesteDuMessage(TYPE_TCHAT, evenement);
const compte = (evenement: Record<string, unknown>) => vaut(evenement)?.nombre ?? 0;

describe('ce que vaut une annonce du tchat', () => {
  it('compte un nouveau sub pour un, quel que soit son niveau', () => {
    for (const [tier, niveau] of [['1000', 1], ['2000', 2], ['3000', 3]] as const) {
      expect(vaut(annonce('sub', { sub_tier: tier, is_prime: false, duration_months: 1 }))).toEqual({
        genre: 'sub',
        nombre: 1,
        niveau,
        twitchId: 'tw-alex',
        pseudo: 'Alex',
        anonyme: false,
      });
    }
  });

  it('ne compte jamais un sub Prime, nouveau ou resub', () => {
    expect(vaut(annonce('sub', { sub_tier: '1000', is_prime: true, duration_months: 1 }))).toBeNull();
    expect(
      vaut(annonce('resub', { sub_tier: '1000', is_prime: true, is_gift: false, cumulative_months: 4 })),
    ).toBeNull();
  });

  it('compte un resub partagé pour un, à son niveau', () => {
    expect(
      vaut(annonce('resub', { sub_tier: '3000', is_prime: false, is_gift: false, cumulative_months: 7 })),
    ).toMatchObject({ genre: 'resub', nombre: 1, niveau: 3, twitchId: 'tw-alex' });
  });

  it('ne compte pas un resub né d’un cadeau : le cadeau a déjà compté', () => {
    expect(
      vaut(annonce('resub', { sub_tier: '1000', is_prime: false, is_gift: true, cumulative_months: 2 })),
    ).toBeNull();
  });

  it('compte un cadeau de masse une fois, par son nombre, jamais par ses destinataires', () => {
    // Cinq subs offerts : une annonce pour celui qui offre, puis une par destinataire.
    const annonces = [
      annonce('community_sub_gift', { id: 'cg1', total: 5, sub_tier: '1000', cumulative_total: 12 }),
      ...Array.from({ length: 5 }, (_, i) =>
        annonce('sub_gift', {
          sub_tier: '1000',
          duration_months: 1,
          recipient_user_id: `tw-r${i}`,
          community_gift_id: 'cg1',
        }),
      ),
    ];
    expect(annonces.reduce((n, e) => n + compte(e), 0)).toBe(5);
    expect(vaut(annonces[0])).toMatchObject({ genre: 'cadeau', nombre: 5, twitchId: 'tw-alex' });
  });

  it('compte un sub offert à quelqu’un en particulier', () => {
    expect(
      vaut(annonce('sub_gift', { sub_tier: '2000', duration_months: 1, recipient_user_id: 'tw-r', community_gift_id: null })),
    ).toMatchObject({ genre: 'cadeau', nombre: 1, niveau: 2 });
  });

  it('compte un cadeau anonyme, sans nommer personne', () => {
    const geste = vaut(
      annonce(
        'community_sub_gift',
        { id: 'cg2', total: 3, sub_tier: '1000', cumulative_total: null },
        { chatter_user_id: '274598607', chatter_user_name: 'AnAnonymousGifter', chatter_is_anonymous: true },
      ),
    );
    expect(geste).toMatchObject({ genre: 'cadeau', nombre: 3, twitchId: null, pseudo: 'Anonyme', anonyme: true });
  });

  it('borne un cadeau de masse et refuse un nombre farfelu', () => {
    const masse = (total: unknown) => compte(annonce('community_sub_gift', { id: 'cg', total, sub_tier: '1000' }));
    expect(masse(1_000_000)).toBe(SUBS_PAR_MESSAGE_MAX);
    expect(masse(0)).toBe(0);
    expect(masse(2.5)).toBe(0);
    expect(masse('5')).toBe(0);
    expect(compte(annonce('community_sub_gift', null))).toBe(0);
  });

  it('ignore les subs d’une autre chaîne, en tchat partagé', () => {
    const ailleurs = { source_broadcaster_user_id: 'tw-autre-chaine' };
    expect(vaut(annonce('sub', { sub_tier: '1000', is_prime: false }, ailleurs))).toBeNull();
    expect(vaut(annonce('shared_chat_sub', { sub_tier: '1000', is_prime: false }, ailleurs))).toBeNull();
    // Venue de la chaîne elle-même, l'annonce compte.
    expect(compte(annonce('sub', { sub_tier: '1000', is_prime: false }, { source_broadcaster_user_id: 'tw-chaine' }))).toBe(1);
  });

  it('ne compte rien de ce qui n’est pas un sub payé', () => {
    for (const notice of [
      'raid',
      'announcement',
      'bits_badge_tier',
      'charity_donation',
      'watch_streak',
      'pay_it_forward',
      'gift_paid_upgrade',
      'prime_paid_upgrade',
      'unknown',
    ]) {
      expect(vaut(annonce(notice, { sub_tier: '3000' }))).toBeNull();
    }
    expect(gesteDuMessage('channel.follow', { user_name: 'A' })).toBeNull();
    expect(gesteDuMessage('channel.cheer', { bits: 500 })).toBeNull();
    expect(gesteDuMessage(TYPE_TCHAT, undefined)).toBeNull();
  });
});

describe('l’ancien branchement, jusqu’à ce que la streameuse rebranche', () => {
  it('compte encore un nouveau sub et un cadeau, comme avant', () => {
    expect(gesteDuMessage('channel.subscribe', { user_id: 'a', user_name: 'A', tier: '3000', is_gift: false })).toMatchObject({
      genre: 'sub',
      nombre: 1,
      niveau: 3,
    });
    expect(gesteDuMessage('channel.subscribe', { user_id: 'r', is_gift: true })).toBeNull();
    expect(gesteDuMessage('channel.subscription.gift', { user_id: 'a', user_name: 'A', total: 5, tier: '1000' })).toMatchObject({
      genre: 'cadeau',
      nombre: 5,
    });
    expect(gesteDuMessage('channel.subscription.gift', { total: 3, is_anonymous: true })).toMatchObject({
      twitchId: null,
      pseudo: 'Anonyme',
    });
    expect(gesteDuMessage('channel.subscription.message', { user_id: 'a', tier: '1000' })).toBeNull();
  });
});

describe('le niveau 3', () => {
  it('vaut un Booster Perso à qui le paie, et compte pour un au compteur', () => {
    const t3 = vaut(annonce('sub', { sub_tier: '3000', is_prime: false }))!;
    expect(t3.nombre).toBe(1);
    expect(boostersDuGeste(t3)).toBe(1);
    // Trois T3 offerts d'un coup : trois Boosters Perso pour celui qui offre.
    expect(boostersDuGeste(vaut(annonce('community_sub_gift', { id: 'cg', total: 3, sub_tier: '3000' }))!)).toBe(3);
    expect(boostersDuGeste(vaut(annonce('sub', { sub_tier: '1000', is_prime: false }))!)).toBe(0);
    expect(boostersDuGeste({ niveau: 3, nombre: 2, anonyme: true })).toBe(0);
  });

  it('se dit au journal, sans nommer un donateur anonyme', () => {
    expect(recitDuGeste(vaut(annonce('sub', { sub_tier: '3000', is_prime: false }))!)).toBe(
      'sub T3 de Alex · vaut 1 Booster Perso',
    );
    expect(recitDuGeste(vaut(annonce('resub', { sub_tier: '1000', is_prime: false, is_gift: false }))!)).toBe(
      'resub T1 de Alex',
    );
    expect(
      recitDuGeste({ genre: 'cadeau', nombre: 5, niveau: 1, twitchId: null, pseudo: 'Anonyme', anonyme: true }),
    ).toBe('5 subs T1 offerts par un anonyme');
    expect(
      recitDuGeste({ genre: 'cadeau', nombre: 2, niveau: 3, twitchId: 'x', pseudo: 'Xavier', anonyme: false }),
    ).toBe('2 subs T3 offerts par Xavier · vaut 2 Boosters Perso');
  });
});

describe('la fraîcheur d’un message', () => {
  const maintenant = Date.parse('2026-12-01T20:00:00.000Z');

  it('accepte un message récent, horodaté à la nanoseconde comme Twitch le fait', () => {
    expect(messageFrais('2026-12-01T19:59:30.123456789Z', maintenant)).toBe(true);
  });

  it('ignore un message de plus de dix minutes, ou venu du futur', () => {
    expect(messageFrais(new Date(maintenant - FRAICHEUR_MS - 1000).toISOString(), maintenant)).toBe(false);
    expect(messageFrais(new Date(maintenant + FRAICHEUR_MS + 1000).toISOString(), maintenant)).toBe(false);
  });

  it('ignore un horodatage illisible', () => {
    expect(messageFrais('hier soir', maintenant)).toBe(false);
    expect(messageFrais('', maintenant)).toBe(false);
  });
});

describe('la mémoire des messages comptés', () => {
  const maintenant = Date.parse('2026-12-01T20:00:00.000Z');

  it('reconnaît un message déjà compté', () => {
    const vus = retiens([], 'm1', maintenant);
    expect(dejaVu(vus, 'm1')).toBe(true);
    expect(dejaVu(vus, 'm2')).toBe(false);
  });

  it('oublie ce qui a plus d’une heure, bien après la fraîcheur', () => {
    const vieux = retiens([], 'ancien', maintenant - MEMOIRE_MS - 1000);
    const vus = retiens(vieux, 'recent', maintenant);
    expect(dejaVu(vus, 'ancien')).toBe(false);
    expect(dejaVu(vus, 'recent')).toBe(true);
    expect(MEMOIRE_MS).toBeGreaterThan(FRAICHEUR_MS);
  });

  it('reste bornée, en gardant les plus récents', () => {
    let vus = retiens([], 'm0', maintenant);
    for (let i = 1; i <= MEMOIRE_MAX + 10; i += 1) vus = retiens(vus, `m${i}`, maintenant);
    expect(vus).toHaveLength(MEMOIRE_MAX);
    expect(dejaVu(vus, `m${MEMOIRE_MAX + 10}`)).toBe(true);
    expect(dejaVu(vus, 'm0')).toBe(false);
  });
});

describe('le registre des subs', () => {
  const maintenant = Date.parse('2026-12-01T20:00:00.000Z');

  it('note qui a payé, combien, quand, et à quel niveau', () => {
    const geste = vaut(annonce('resub', { sub_tier: '3000', is_prime: false, is_gift: false }))!;
    expect(ligneDuGeste({ id: 'm1', maintenant }, geste)).toEqual({
      id: 'm1',
      le: '2026-12-01T20:00:00.000Z',
      genre: 'resub',
      twitchId: 'tw-alex',
      pseudo: 'Alex',
      nombre: 1,
      niveau: 3,
    });
  });

  it('retrouve les Boosters Perso qui attendent les non-inscrits : un par T3, un tous les cinq subs offerts', () => {
    const ligne = (id: string, le: string, genre: 'sub' | 'resub' | 'cadeau', twitchId: string | null, pseudo: string, nombre: number, niveau: number) => ({
      id,
      le,
      genre,
      twitchId,
      pseudo,
      nombre,
      niveau,
    });
    const registre = [
      ligne('a', '2026-12-01T20:00:00.000Z', 'cadeau', 'x', 'Xavier', 5, 1),
      ligne('b', '2026-12-02T20:00:00.000Z', 'cadeau', 'x', 'Xavier_', 10, 2),
      ligne('c', '2026-12-01T21:00:00.000Z', 'cadeau', 'i', 'Inscrit', 20, 1),
      ligne('d', '2026-12-01T22:00:00.000Z', 'sub', 'y', 'Yann', 1, 3),
      ligne('e', '2026-12-01T23:00:00.000Z', 'cadeau', null, 'Anonyme', 50, 3),
      ligne('f', '2026-12-02T08:00:00.000Z', 'cadeau', 'z', 'Zoé', 2, 3),
      ligne('g', '2026-12-02T09:00:00.000Z', 'cadeau', 'z', 'Zoé', 4, 1),
      ligne('h', '2026-12-02T10:00:00.000Z', 'sub', 'w', 'Wanda', 1, 1),
      ligne('j', '2026-12-02T11:00:00.000Z', 'resub', 'y', 'Yann', 1, 3),
    ];
    expect(persoEnAttente(registre, new Set(['i']))).toEqual([
      { twitchId: 'x', pseudo: 'Xavier_', offerts: 15, niveau3: 0, boosters: 3, dernier: '2026-12-02T20:00:00.000Z' },
      // À Boosters égaux, qui a payé le plus de subs passe devant.
      { twitchId: 'z', pseudo: 'Zoé', offerts: 4, niveau3: 2, boosters: 2, dernier: '2026-12-02T09:00:00.000Z' },
      { twitchId: 'y', pseudo: 'Yann', offerts: 0, niveau3: 2, boosters: 2, dernier: '2026-12-02T11:00:00.000Z' },
    ]);
  });
});

describe('les messages de modération', () => {
  it('fait administrer un modérateur ajouté et jouer un modérateur retiré', () => {
    expect(roleDuMessage('channel.moderator.add')).toBe('admin');
    expect(roleDuMessage('channel.moderator.remove')).toBe('joueur');
    expect(roleDuMessage(TYPE_TCHAT)).toBeNull();
  });

  it('ne compte jamais un message de modération comme un sub', () => {
    expect(gesteDuMessage('channel.moderator.add', { user_name: 'A' })).toBeNull();
  });
});
