import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Le live de la chaîne, tel que le hero l'annonce. Twitch est simulé : on
 * vérifie ce qu'on en tire, et surtout qu'on n'annonce rien quand il se tait.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // Le module garde la réponse une minute en mémoire : chaque test repart à neuf.
  vi.resetModules();
});

async function etat(reponse: unknown, statut = 200) {
  vi.stubEnv('TWITCH_CLIENT_ID', 'client');
  vi.stubEnv('TWITCH_CLIENT_SECRET', 'secret');
  vi.stubEnv('TWITCH_BROADCASTER_LOGIN', 'lriaa');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) =>
      String(url).includes('/oauth2/token')
        ? new Response(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }))
        : new Response(JSON.stringify(reponse), { status: statut }),
    ),
  );
  const { etatDuDirect } = await import('@/lib/services/twitchDirect');
  return etatDuDirect();
}

describe('le live de la chaîne', () => {
  it('dit en direct, avec le titre et les spectateurs', async () => {
    expect(
      await etat({
        data: [{ type: 'live', user_name: 'Lriaa', title: 'Ligue ce soir', game_name: 'Warzone', viewer_count: 321 }],
      }),
    ).toEqual({ enDirect: true, nom: 'Lriaa', titre: 'Ligue ce soir', jeu: 'Warzone', spectateurs: 321 });
  });

  it('dit hors ligne quand Twitch ne renvoie aucun live', async () => {
    expect(await etat({ data: [] })).toEqual({
      enDirect: false,
      nom: 'Lriaa',
      titre: null,
      jeu: null,
      spectateurs: null,
    });
  });

  it('ne dit rien quand Twitch refuse', async () => {
    expect(await etat({ message: 'erreur' }, 500)).toBeNull();
  });

  it('ne dit rien quand Twitch n’est pas configuré', async () => {
    vi.stubEnv('TWITCH_CLIENT_ID', '');
    vi.stubEnv('TWITCH_CLIENT_SECRET', '');
    const { etatDuDirect } = await import('@/lib/services/twitchDirect');
    expect(await etatDuDirect()).toBeNull();
  });
});
