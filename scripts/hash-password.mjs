#!/usr/bin/env node
/**
 * Génère l'empreinte scrypt du mot de passe de modération.
 *
 *   npm run hash-password -- "mon mot de passe"
 *
 * Copier la ligne produite dans `.env.local` (en local) ou dans les variables
 * d'environnement de l'hébergeur. Le mot de passe en clair ne doit jamais être
 * stocké, ni commité.
 */

import { randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);

const password = process.argv[2];

if (!password) {
  console.error('Usage : npm run hash-password -- "mon mot de passe"');
  process.exit(1);
}

if (password.length < 12) {
  console.error('Refusé : au moins 12 caractères, ce mot de passe protège toute la ligue.');
  process.exit(1);
}

const salt = randomUUID().replace(/-/g, '');
const key = await derive(password, salt, 64);

// Séparateur « : » et non « $ » : les fichiers .env développent les $VAR, ce qui
// couperait l'empreinte en silence.
console.log('\nÀ coller dans .env.local :\n');
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt}:${key.toString('hex')}`);
console.log(`AUTH_SECRET=${(randomUUID() + randomUUID()).replace(/-/g, '')}`);
console.log('');
