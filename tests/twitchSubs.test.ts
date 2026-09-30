import { describe, expect, it } from 'vitest';
import {
  dejaVu,
  FRAICHEUR_MS,
  MEMOIRE_MAX,
  MEMOIRE_MS,
  messageFrais,
  recitDuMessage,
  retiens,
  SUBS_PAR_MESSAGE_MAX,
  subsDuMessage,
} from '@/lib/domain/twitchSubs';

/**
 * Les subs qui arrivent de Twitch : chaque sub compte une fois, et une seule.
 */
describe('ce que vaut un message', () => {
  it('compte un nouveau sub et un réabonnement annoncé', () => {
    expect(subsDuMessage('channel.subscribe', { is_gift: false, user_name: 'A' })).toBe(1);
    expect(subsDuMessage('channel.subscription.message', { user_name: 'A' })).toBe(1);
  });

  it('compte un cadeau par son nombre, et jamais ses destinataires en plus', () => {
    // Un cadeau de cinq subs : un message pour celui qui offre, puis un par destinataire.
    const messages: [string, Record<string, unknown>][] = [
      ['channel.subscription.gift', { total: 5, user_name: 'Généreux' }],
      ...Array.from({ length: 5 }, (): [string, Record<string, unknown>] => ['channel.subscribe', { is_gift: true }]),
    ];
    expect(messages.reduce((n, [type, e]) => n + subsDuMessage(type, e), 0)).toBe(5);
  });

  it('borne un cadeau de masse et refuse un nombre farfelu', () => {
    expect(subsDuMessage('channel.subscription.gift', { total: 1_000_000 })).toBe(SUBS_PAR_MESSAGE_MAX);
    expect(subsDuMessage('channel.subscription.gift', { total: 0 })).toBe(0);
    expect(subsDuMessage('channel.subscription.gift', { total: 2.5 })).toBe(0);
    expect(subsDuMessage('channel.subscription.gift', { total: '5' })).toBe(0);
    expect(subsDuMessage('channel.subscription.gift', undefined)).toBe(0);
  });

  it('ne compte rien pour un type qu’il ne connaît pas', () => {
    expect(subsDuMessage('channel.follow', { user_name: 'A' })).toBe(0);
    expect(subsDuMessage('channel.cheer', { bits: 500 })).toBe(0);
  });

  it('raconte le message pour le journal, sans nommer un donateur anonyme', () => {
    expect(recitDuMessage('channel.subscribe', { user_name: 'Alex' }, 1)).toBe('sub de Alex');
    expect(recitDuMessage('channel.subscription.message', { user_name: 'Alex' }, 1)).toBe('réabonnement de Alex');
    expect(recitDuMessage('channel.subscription.gift', { user_name: 'Alex', is_anonymous: true }, 3)).toBe(
      '3 subs offerts par un anonyme',
    );
    expect(recitDuMessage('channel.subscription.gift', { user_name: 'Alex' }, 1)).toBe('1 sub offert par Alex');
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
