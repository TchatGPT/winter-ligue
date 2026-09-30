#!/usr/bin/env node
/**
 * Génère l'empreinte scrypt du mot de passe d'administration.
 *
 *   npm run hash-password
 *
 * Le mot de passe se tape deux fois, sans s'afficher : passé en argument, il
 * finirait dans l'historique du terminal. La valeur produite se colle dans
 * Vercel, variable `ADMIN_PASSWORD_HASH`, environnement Production, puis on
 * redéploie. Le mot de passe en clair ne doit jamais être stocké, ni commité.
 *
 * Vérifier qu'un mot de passe correspond à une empreinte, sans rien générer :
 *
 *   npm run hash-password -- --verifie scrypt:…
 */

import { randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
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

// ---------------------------------------------------------------- vérification
const iVerifie = process.argv.indexOf('--verifie');
if (iVerifie !== -1) {
  const empreinte = (process.argv[iVerifie + 1] ?? '')
    .trim()
    .replace(/^ADMIN_PASSWORD_HASH\s*=\s*/, '')
    .replace(/^(["'])(.*)\1$/, '$2');
  const parties = empreinte.split(':');
  if (parties.length !== 3 || parties[0] !== 'scrypt') {
    console.error('Empreinte illisible : elle doit commencer par « scrypt: ».');
    process.exit(1);
  }
  const essai = await demandeMasque('Mot de passe à vérifier : ');
  const attendu = Buffer.from(parties[2], 'hex');
  const obtenu = await derive(essai, parties[1], 64);
  const ok = attendu.length === obtenu.length && timingSafeEqual(attendu, obtenu);
  console.log(
    ok
      ? '✔ Ce mot de passe correspond à cette empreinte.'
      : `✘ Ce mot de passe ne correspond pas à cette empreinte (${essai.length} caractère(s) tapé(s)).`,
  );
  process.exit(ok ? 0 : 1);
}

// ---------------------------------------------------------------- génération
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
console.log(`Mot de passe reçu : ${password.length} caractère(s).`);
if (password.length < 10) {
  console.warn('Note : un mot de passe court se devine plus facilement (cinq essais par quart d’heure et par adresse).');
}

const salt = randomUUID().replace(/-/g, '');
const key = await derive(password, salt, 64);
const empreinte = `scrypt:${salt}:${key.toString('hex')}`;

// Séparateur « : » et non « $ » : les fichiers .env développent les $VAR, ce qui
// couperait l'empreinte en silence.
console.log('\nDans Vercel → Settings → Environment Variables (Production) :');
console.log('  Key   : ADMIN_PASSWORD_HASH');
console.log('  Value : la ligne ci-dessous, seule\n');
console.log(empreinte);
console.log(`\nPuis Redeploy. En cas d’échec, le site affiche « empreinte en service : ${empreinte.slice(0, 13)}… » :`);
console.log('si ce n’est pas ce début-là, Vercel sert une autre valeur.\n');
