import { afterEach, describe, expect, it } from 'vitest';
import { empreinteAdmin, etatMotDePasse } from '@/lib/auth/empreinte';

/**
 * L'empreinte collée dans Vercel : la ligne entière que sort le script, des
 * guillemets, des espaces. Toutes ces formes doivent redonner l'empreinte seule.
 */
const EMPREINTE = `scrypt:0123456789abcdef0123456789abcdef:${'ab'.repeat(64)}`;

describe('empreinte du mot de passe d’administration', () => {
  const avant = process.env.ADMIN_PASSWORD_HASH;
  afterEach(() => {
    if (avant === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = avant;
  });

  it('reprend l’empreinte seule, quelle que soit la façon de la coller', () => {
    for (const collee of [
      EMPREINTE,
      `  ${EMPREINTE}\n`,
      `ADMIN_PASSWORD_HASH=${EMPREINTE}`,
      `ADMIN_PASSWORD_HASH = "${EMPREINTE}"`,
      `'${EMPREINTE}'`,
    ]) {
      process.env.ADMIN_PASSWORD_HASH = collee;
      expect(empreinteAdmin()).toBe(EMPREINTE);
      expect(etatMotDePasse()).toBe('pret');
    }
  });

  it('dit quand la porte n’est pas posée', () => {
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(etatMotDePasse()).toBe('absent');
    process.env.ADMIN_PASSWORD_HASH = '   ';
    expect(etatMotDePasse()).toBe('absent');
  });

  it('dit quand elle est posée de travers', () => {
    process.env.ADMIN_PASSWORD_HASH = 'mon-mot-de-passe-en-clair';
    expect(etatMotDePasse()).toBe('mal-forme');
    process.env.ADMIN_PASSWORD_HASH = 'scrypt$abc$def';
    expect(etatMotDePasse()).toBe('mal-forme');
  });
});
