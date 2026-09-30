import { afterEach, describe, expect, it } from 'vitest';
import { empreinteAdmin, etatMotDePasse, motDePasseEnClair } from '@/lib/auth/empreinte';

/**
 * Le mot de passe d'administration tel qu'on le colle dans Vercel : la ligne
 * entière que sort le script, des guillemets, toute la sortie, ou le mot de
 * passe lui-même. Chacune de ces formes doit ouvrir la porte.
 */
const EMPREINTE = `scrypt:0123456789abcdef0123456789abcdef:${'ab'.repeat(64)}`;

describe('mot de passe d’administration', () => {
  const avant = process.env.ADMIN_PASSWORD_HASH;
  const avantClair = process.env.ADMIN_PASSWORD;
  afterEach(() => {
    if (avant === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = avant;
    if (avantClair === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = avantClair;
  });

  it('retrouve l’empreinte, quelle que soit la façon de la coller', () => {
    delete process.env.ADMIN_PASSWORD;
    for (const collee of [
      EMPREINTE,
      `  ${EMPREINTE}  `,
      `ADMIN_PASSWORD_HASH=${EMPREINTE}`,
      `ADMIN_PASSWORD_HASH = "${EMPREINTE}"`,
      `'${EMPREINTE}'`,
      `Mot de passe reçu : 9 caractère(s).  Key : ADMIN_PASSWORD_HASH  Value : ${EMPREINTE}  Puis Redeploy.`,
    ]) {
      process.env.ADMIN_PASSWORD_HASH = collee;
      expect(empreinteAdmin()).toBe(EMPREINTE);
      expect(motDePasseEnClair()).toBeNull();
      expect(etatMotDePasse()).toBe('pret');
    }
  });

  it('prend pour le mot de passe une valeur qui n’est pas une empreinte', () => {
    delete process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD_HASH = '  monmotdepasse  ';
    expect(empreinteAdmin()).toBeNull();
    expect(motDePasseEnClair()).toBe('monmotdepasse');
    expect(etatMotDePasse()).toBe('pret');
  });

  it('s’ouvre par ADMIN_PASSWORD, empreinte ou pas', () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_PASSWORD = '  motdepasse   ';
    expect(motDePasseEnClair()).toBe('motdepasse');
    expect(etatMotDePasse()).toBe('pret');
  });

  it('dit quand la porte n’est pas posée', () => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(etatMotDePasse()).toBe('absent');
    process.env.ADMIN_PASSWORD_HASH = '   ';
    expect(etatMotDePasse()).toBe('absent');
  });

  it('dit quand une empreinte est tronquée : on ne devine pas ce qui manque', () => {
    delete process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD_HASH = 'scrypt:500c07ab:12ef';
    expect(etatMotDePasse()).toBe('mal-forme');
    expect(motDePasseEnClair()).toBeNull();
  });
});
