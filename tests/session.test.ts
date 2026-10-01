import { describe, expect, it } from 'vitest';
import {
  createToken,
  echeanceProlongee,
  prolonge,
  SESSION_MAX_SECONDS,
  SESSION_TTL_SECONDS,
  verifyToken,
} from '@/lib/auth/jeton';
import { roleConfirme } from '@/lib/domain/revocation';

/**
 * Une session dure trente jours depuis la dernière visite, et six mois au plus
 * depuis la connexion. La prolonger ne déplace jamais sa date d'émission : une
 * déconnexion la révoque toujours.
 */
const JOUR = 24 * 60 * 60;

describe('l’échéance d’une session revisitée', () => {
  it('repart pour trente jours quand la dernière prolongation date de plus d’un jour', () => {
    const iat = 1_000_000;
    const maintenant = iat + 3 * JOUR;
    expect(echeanceProlongee({ iat, exp: iat + SESSION_TTL_SECONDS }, maintenant)).toBe(maintenant + SESSION_TTL_SECONDS);
  });

  it('ne change rien moins d’un jour après la dernière prolongation', () => {
    const iat = 1_000_000;
    expect(echeanceProlongee({ iat, exp: iat + SESSION_TTL_SECONDS }, iat + 3600)).toBeNull();
  });

  it('s’arrête six mois après la connexion', () => {
    const iat = 1_000_000;
    const fin = iat + SESSION_MAX_SECONDS;
    expect(echeanceProlongee({ iat, exp: fin - 20 * JOUR }, fin - 10 * JOUR)).toBe(fin);
    expect(echeanceProlongee({ iat, exp: fin }, fin - JOUR)).toBeNull();
  });
});

describe('le jeton prolongé', () => {
  it('garde le joueur, le rôle, l’identifiant et la date d’émission', () => {
    // Émis il y a dix jours pour vingt jours : il lui en reste dix.
    const ancien = createToken('j1', 'joueur', SESSION_TTL_SECONDS - 20 * JOUR);
    const avant = verifyToken(ancien)!;
    const resultat = prolonge(ancien)!;
    const apres = verifyToken(resultat.jeton)!;
    expect(apres).toMatchObject({ sub: 'j1', role: 'joueur', sid: avant.sid, iat: avant.iat });
    expect(apres.exp).toBeGreaterThan(avant.exp);
    expect(resultat.maxAge).toBeGreaterThan(SESSION_TTL_SECONDS - 60);
  });

  it('reste révoqué par une déconnexion antérieure à la prolongation', () => {
    const ancien = createToken('j1', 'joueur', 5 * JOUR);
    const apres = verifyToken(prolonge(ancien)!.jeton)!;
    const deconnexion = new Date((apres.iat + 1) * 1000).toISOString();
    expect(roleConfirme(apres, { role: 'joueur', actif: true, sessionsDepuis: deconnexion })).toBeNull();
  });

  it('refuse un jeton altéré ou absent', () => {
    const jeton = createToken('j1', 'admin', 5 * JOUR);
    expect(prolonge(`${jeton}x`)).toBeNull();
    expect(prolonge(undefined)).toBeNull();
  });
});
