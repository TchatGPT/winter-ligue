import { describe, expect, it } from 'vitest';
import { roleConfirme, type EtatCompte } from '@/lib/domain/revocation';

const MAINTENANT = Math.floor(Date.parse('2026-10-01T20:00:00Z') / 1000);
const joueur: EtatCompte = { role: 'joueur', actif: true, sessionsDepuis: null };

describe('une session face à la base', () => {
  it('prend le rôle de la base, pas celui du jeton', () => {
    expect(roleConfirme({ iat: MAINTENANT }, joueur)).toBe('joueur');
    expect(roleConfirme({ iat: MAINTENANT }, { ...joueur, role: 'moderateur' })).toBe('moderateur');
  });

  it('ne survit pas à un compte disparu ou désactivé', () => {
    expect(roleConfirme({ iat: MAINTENANT }, null)).toBeNull();
    expect(roleConfirme({ iat: MAINTENANT }, { ...joueur, actif: false })).toBeNull();
  });

  it('est révoquée par une déconnexion postérieure', () => {
    const deconnexion = '2026-10-01T21:00:00.000Z';
    expect(roleConfirme({ iat: MAINTENANT }, { ...joueur, sessionsDepuis: deconnexion })).toBeNull();
  });

  it('vaut si elle a été ouverte après la déconnexion', () => {
    const deconnexion = '2026-10-01T19:00:00.000Z';
    expect(roleConfirme({ iat: MAINTENANT }, { ...joueur, sessionsDepuis: deconnexion })).toBe('joueur');
    // Ouverte dans la seconde même de la déconnexion : elle vaut.
    expect(roleConfirme({ iat: MAINTENANT }, { ...joueur, sessionsDepuis: '2026-10-01T20:00:00.400Z' })).toBe('joueur');
  });

  it('refuse dans le doute, sur une date illisible', () => {
    expect(roleConfirme({ iat: MAINTENANT }, { ...joueur, sessionsDepuis: 'n’importe quoi' })).toBeNull();
  });
});
