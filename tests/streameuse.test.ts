import { describe, expect, it } from 'vitest';
import { estLaStreameuse } from '@/lib/domain/streameuse';

describe('estLaStreameuse', () => {
  it('la reconnaît par son pseudo Twitch, sans tenir compte de la casse', () => {
    expect(estLaStreameuse({ twitchLogin: 'Lriaa', slug: 'autre' }, 'lriaa')).toBe(true);
  });

  it('la reconnaît par son profil quand le pseudo Twitch manque', () => {
    expect(estLaStreameuse({ twitchLogin: null, slug: 'lriaa' }, 'LRIAA')).toBe(true);
  });

  it('ne confond pas un joueur au nom proche', () => {
    expect(estLaStreameuse({ twitchLogin: 'lriaa_fan', slug: 'lriaa-fan' }, 'lriaa')).toBe(false);
  });

  it('ne reconnaît personne sans chaîne', () => {
    expect(estLaStreameuse({ twitchLogin: 'lriaa', slug: 'lriaa' }, '  ')).toBe(false);
  });
});
