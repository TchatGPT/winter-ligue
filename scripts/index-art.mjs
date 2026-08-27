#!/usr/bin/env node
/**
 * Recense les illustrations présentes dans `public/` et écrit l'index que le
 * site consulte avant de demander une image.
 *
 *   npm run cartes
 *
 * Deux dossiers sont couverts : `public/cartes/` pour les cartes, et
 * `public/boosters/` pour l'impression des sachets.
 *
 * Sans cet index, une carte ou un sachet sans visuel déclencherait une requête
 * vouée à un 404 à chaque affichage : bruit dans la console, requête inutile,
 * et une image cassée le temps que le repli se déclenche. Ici, le site sait
 * d'avance ce qui existe.
 *
 * À relancer après avoir déposé de nouveaux visuels.
 */

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'lib', 'domain', 'card-art.generated.ts');
const EXTENSIONS = ['.webp', '.avif', '.png', '.jpg', '.jpeg'];

const SOURCES = [
  { dir: join(process.cwd(), 'public', 'cartes'), base: '/cartes', name: 'CARD_ART' },
  { dir: join(process.cwd(), 'public', 'boosters'), base: '/boosters', name: 'BOOSTER_ART' },
];

/** Fichiers d'un dossier, indexés par identifiant. */
async function index(source) {
  let files = [];
  try {
    files = await readdir(source.dir);
  } catch {
    // Le dossier peut ne pas exister au premier lancement : ce n'est pas une erreur.
  }

  const found = new Map();
  for (const file of files.sort()) {
    const dot = file.lastIndexOf('.');
    if (dot <= 0) continue;
    if (!EXTENSIONS.includes(file.slice(dot).toLowerCase())) continue;

    const id = file.slice(0, dot);
    // Le premier format rencontré gagne, dans l'ordre alphabétique : .avif
    // passe donc avant .webp.
    if (!found.has(id)) found.set(id, file);
  }
  return found;
}

const indexed = await Promise.all(SOURCES.map(index));

const blocks = SOURCES.map((source, i) => {
  const entries = [...indexed[i].entries()]
    .map(([id, file]) => `  '${id}': '${source.base}/${file}',`)
    .join('\n');
  return `export const ${source.name}: Record<string, string> = {\n${entries}\n};`;
}).join('\n\n');

const header = [
  '/**',
  ' * Index des illustrations disponibles — FICHIER GÉNÉRÉ, ne pas éditer.',
  ' *',
  ' * Produit par `npm run cartes`, qui lit `public/cartes/` et',
  ' * `public/boosters/`. Relancer la commande après avoir ajouté ou retiré un',
  ' * visuel.',
  ' */',
  '',
  '',
].join('\n');

await writeFile(OUT, header + blocks + '\n', 'utf8');

for (const [i, source] of SOURCES.entries()) {
  const found = indexed[i];
  console.log(
    found.size === 0
      ? `public${source.base}/ : aucun visuel — repli sur le rendu vectoriel.`
      : `public${source.base}/ : ${found.size} visuel(s) — ${[...found.keys()].join(', ')}`,
  );
}
