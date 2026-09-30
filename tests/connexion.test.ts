import { afterEach, describe, expect, it, vi } from 'vitest';
import { cheminInterne, createState, verifyState } from '@/lib/auth/twitch';

/**
 * Le `state` de la connexion Twitch : signé, daté, lié au navigateur.
 *
 * C'est lui qui empêche de faire entrer quelqu'un sur le compte d'un autre
 * (« login CSRF ») et de détourner le retour vers un autre site.
 */
describe('state OAuth', () => {
  afterEach(() => vi.useRealTimers());

  it('revient valide avec le nonce de son départ', () => {
    const { state, nonce } = createState('/duels');
    expect(verifyState(state, nonce)).toEqual({ valid: true, returnTo: '/duels' });
  });

  it('refuse un state sans le nonce de ce navigateur', () => {
    const { state } = createState('/');
    const autre = createState('/');
    expect(verifyState(state, undefined).valid).toBe(false);
    expect(verifyState(state, autre.nonce).valid).toBe(false);
  });

  it('refuse un state retouché', () => {
    const { state, nonce } = createState('/');
    const [charge, signature] = state.split('.');
    const faux = Buffer.from(JSON.stringify({ n: nonce, r: '/admin', e: 9_999_999_999 })).toString('base64url');
    expect(verifyState(`${faux}.${signature}`, nonce).valid).toBe(false);
    expect(verifyState(`${charge}.${signature.slice(0, -2)}xx`, nonce).valid).toBe(false);
    expect(verifyState('nimporte-quoi', nonce).valid).toBe(false);
    expect(verifyState(null, nonce).valid).toBe(false);
  });

  it('expire au bout de dix minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T20:00:00Z'));
    const { state, nonce } = createState('/');
    vi.setSystemTime(new Date('2026-10-01T20:09:00Z'));
    expect(verifyState(state, nonce).valid).toBe(true);
    vi.setSystemTime(new Date('2026-10-01T20:10:01Z'));
    expect(verifyState(state, nonce).valid).toBe(false);
  });
});

describe('chemin de retour', () => {
  it('garde un chemin du site', () => {
    expect(cheminInterne('/joueurs/lriaa')).toBe('/joueurs/lriaa');
    expect(cheminInterne('/duels?onglet=resultats')).toBe('/duels?onglet=resultats');
  });

  it('ramène tout le reste à l’accueil', () => {
    for (const piege of [
      'https://ailleurs.fr',
      '//ailleurs.fr',
      '/\\ailleurs.fr',
      'javascript:alert(1)',
      '/ligne\r\nSet-Cookie: x=1',
      '',
      null,
      undefined,
      `/${'a'.repeat(300)}`,
    ]) {
      expect(cheminInterne(piege)).toBe('/');
    }
  });

  it('ne laisse pas un state porter un retour vers un autre site', () => {
    const { state, nonce } = createState('//ailleurs.fr');
    expect(verifyState(state, nonce).returnTo).toBe('/');
  });
});
