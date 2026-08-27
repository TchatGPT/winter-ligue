#!/usr/bin/env node
/**
 * Recense les illustrations présentes dans `public/cartes/` et écrit l'index
 * que le site consulte avant de demander une image.
 *
 *   npm run cartes
 *
 * Sans cet index, une carte sans visuel déclencherait une requête vouée à un
 * 404 à chaque affichage : bruit dans la console, requête inutile, et une
 * icône d'image cassée le temps que le repli se déclenche. Ici, le site sait
 * d'avance ce qui existe.
 *
 * À relancer après avoir déposé de nouvelles illustrations.
 */

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'cartes');
const OUT = join(process.cwd(), 'lib', 'domain', 'card-art.generated.ts');
const EXTENSIONS = ['.webp', '.avif', '.png', '.jpg', '.jpeg'];

let files = [];
try {
  files = await readdir(DIR);
} catch {
  // Le dossier peut ne pas exister au premier lancement : ce n'est pas une erreur.
}

/** Associe un identifiant de carte au fichier trouvé pour elle. */
const found = new Map();
for (const file of files.sort()) {
  const dot = file.lastIndexOf('.');
  if (dot <= 0) continue;
  const ext = file.slice(dot).toLowerCase();
  if (!EXTENSIONS.includes(ext)) continue;

  const id = file.slice(0, dot);
  // Le premier format rencontré gagne : l'ordre d'EXTENSIONS n'intervient pas,
  // c'est l'ordre alphabétique qui tranche, donc .avif avant .webp.
  if (!found.has(id)) found.set(id, file);
}

const entries = [...found.entries()]
  .map(([id, file]) => `  '${id}': '/cartes/${file}',`)
  .join('\n');

const contents = `/**
 * Index des illustrations disponibles — FICHIER GÉNÉRÉ, ne pas éditer.
 *
 * Produit par \`npm run cartes\`, qui lit \`public/cartes/\`. Relancer la commande
 * après avoir ajouté ou retiré un visuel.
 */

export const CARD_ART: Record<string, string> = {
${entries}
};
`;

await writeFile(OUT, contents, 'utf8');
console.log(
  found.size === 0
    ? 'Aucune illustration dans public/cartes/ — les cartes utiliseront leur glyphe.'
    : `${found.size} illustration(s) indexée(s) : ${[...found.keys()].join(', ')}`,
);
