import { describe, expect, it } from 'vitest';
import { destination, type FaitsSession } from '@/lib/domain/aiguillage';

/** Un joueur en règle, sur un site qui a sa base et la connexion simulée. */
const joueur: FaitsSession = {
  connecte: true,
  designeUnJoueur: true,
  compteTrouve: true,
  activision: true,
  baseDurable: true,
  twitch: false,
};

describe('aiguillage des pages de jeu', () => {
  it('laisse entrer un joueur en règle', () => {
    expect(destination(joueur)).toBeNull();
    expect(destination({ ...joueur, twitch: true })).toBeNull();
  });

  it('renvoie un visiteur déconnecté à l’accueil', () => {
    expect(destination({ ...joueur, connecte: false })).toBe('/');
  });

  it('demande le pseudo Activision tant qu’il manque', () => {
    expect(destination({ ...joueur, activision: false })).toBe('/bienvenue');
  });

  it('renvoie se reconnecter quand le compte a disparu', () => {
    expect(destination({ ...joueur, compteTrouve: false })).toBe('/connexion');
  });
});

describe('la session sans joueur', () => {
  const secours: FaitsSession = { ...joueur, designeUnJoueur: false, compteTrouve: false, activision: false };

  it('ne reste jamais sur une page de jeu quand le site a une base', () => {
    // C'est le blocage des duels : la session voyait la page, sans pouvoir
    // miser ni affronter le bot.
    for (const twitch of [false, true]) {
      expect(destination({ ...secours, twitch })).not.toBeNull();
    }
  });

  it('se reconnecte toute seule tant que la connexion est simulée', () => {
    expect(destination({ ...secours, twitch: false })).toBe('/api/auth/twitch/demo');
  });

  it('passe par la page de connexion une fois Twitch branché', () => {
    expect(destination({ ...secours, twitch: true })).toBe('/connexion');
  });

  it('entre quand le site n’a pas de base durable : c’est la seule session qui tienne', () => {
    expect(destination({ ...secours, baseDurable: false })).toBeNull();
    expect(destination({ ...secours, baseDurable: false, twitch: true })).toBeNull();
  });
});
