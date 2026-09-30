#!/usr/bin/env node
/**
 * Génère l'empreinte scrypt du mot de passe d'administration.
 *
 *   npm run hash-password
 *
 * Le mot de passe se tape deux fois, sans s'afficher : passé en argument, il
 * finirait dans l'historique du terminal. La ligne produite se colle dans
 * Vercel, variable `ADMIN_PASSWORD_HASH`, environnement Production. Le mot de
 * passe en clair ne doit jamais être stocké, ni commité.
 */

import { randomUUID, scrypt } from 'node:crypto';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

const derive = promisify(scrypt);

/** Une question dont la réponse ne s'affiche pas. */
function demandeMasque(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muet = false;
    const ecrire = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (texte) => {
      if (!muet) ecrire(texte);
    };
    rl.question(question, (reponse) => {
      rl.close();
      process.stdout.write('\n');
      resolve(reponse);
    });
    muet = true;
  });
}

let password = process.argv[2];
if (password) {
  console.warn('Attention : un mot de passe passé en argument reste dans l’historique du terminal.');
} else {
  password = await demandeMasque('Mot de passe : ');
  const confirmation = await demandeMasque('Encore une fois : ');
  if (password !== confirmation) {
    console.error('Les deux saisies diffèrent.');
    process.exit(1);
  }
}

// Pas de longueur imposée : c'est le choix de qui l'administre. Seul le vide
// est refusé, et un mot de passe très court est signalé, sans être bloqué.
if (!password) {
  console.error('Mot de passe vide.');
  process.exit(1);
}
if (password.length < 10) {
  console.warn('Note : un mot de passe court se devine plus facilement (cinq essais par quart d’heure et par adresse).');
}

const salt = randomUUID().replace(/-/g, '');
const key = await derive(password, salt, 64);

// Séparateur « : » et non « $ » : les fichiers .env développent les $VAR, ce qui
// couperait l'empreinte en silence.
console.log('\nÀ coller dans Vercel → Settings → Environment Variables, en Production :\n');
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt}:${key.toString('hex')}`);
console.log('');
