import { describe, expect, it } from 'vitest';
import { destination, type FaitsSession } from '@/lib/domain/aiguillage';

/** Un joueur en règle. */
const joueur: FaitsSession = {
  connecte: true,
  compteTrouve: true,
};

describe('aiguillage des pages de jeu', () => {
  it('laisse entrer un joueur en règle', () => {
    expect(destination(joueur)).toBeNull();
  });

  it('renvoie un visiteur déconnecté à l’accueil', () => {
    expect(destination({ ...joueur, connecte: false })).toBe('/');
  });

  it('renvoie se reconnecter quand le compte a disparu', () => {
    expect(destination({ ...joueur, compteTrouve: false })).toBe('/connexion');
  });
});
