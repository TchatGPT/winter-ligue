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
 * ## L'empreinte
 *
 * Chaque adresse porte l'empreinte de son fichier (`/cartes/luge.webp?v=…`).
 * Le navigateur garde donc l'image un an sans jamais la redemander
 * (`next.config.ts`), et une illustration remplacée sous le même nom change
 * d'adresse : personne ne garde l'ancienne.
 *
 * ## Les vignettes
 *
 * Une carte affichée en 58 px n'a pas besoin de son illustration de 1 000 px :
 * le téléphone la téléchargeait et la décodait quand même, une par carte, au
 * moment où le rail démarrait. Chaque illustration de carte a donc deux
 * vignettes, de 200 et 480 px de large, dans `public/cartes/vignettes/`. Leur
 * nom porte l'empreinte de l'illustration dont elles viennent : une vignette
 * d'une ancienne image ne sert jamais, elle est effacée et refaite. Il faut
 * `sharp` pour les faire (il est là en local) ; sans lui, une vignette qui
 * manque n'est pas indexée, et la carte garde son illustration entière.
 *
 * Lancé avant chaque build, et à relancer après avoir déposé de nouveaux
 * visuels : les vignettes faites en local sont à commiter avec eux.
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'lib', 'domain', 'card-art.generated.ts');
const EXTENSIONS = ['.webp', '.avif', '.png', '.jpg', '.jpeg'];

const SOURCES = [
  { dir: join(process.cwd(), 'public', 'cartes'), base: '/cartes', name: 'CARD_ART', vignettes: true },
  { dir: join(process.cwd(), 'public', 'boosters'), base: '/boosters', name: 'BOOSTER_ART', vignettes: false },
];

const DOSSIER_VIGNETTES = join(process.cwd(), 'public', 'cartes', 'vignettes');
/** Les deux largeurs : une petite carte (une liste, une pile), une moyenne (le rail, un profil). */
const LARGEURS = [200, 480];
/** Une vignette n'a pas besoin de plus : à cette taille, l'œil ne voit pas la différence. */
const QUALITE = 76;

const empreinte = (contenu) => createHash('sha256').update(contenu).digest('hex').slice(0, 10);

/**
 * La largeur d'une image WebP, lue dans son en-tête : l'index doit sortir le
 * même partout, avec ou sans `sharp`. Null pour un autre format.
 */
function largeurWebp(octets) {
  if (octets.length < 30 || octets.toString('ascii', 0, 4) !== 'RIFF' || octets.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const morceau = octets.toString('ascii', 12, 16);
  if (morceau === 'VP8X') return 1 + octets.readUIntLE(24, 3);
  if (morceau === 'VP8L') return 1 + (octets.readUInt32LE(21) & 0x3fff);
  if (morceau === 'VP8 ') return octets.readUInt16LE(26) & 0x3fff;
  return null;
}

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
    if (found.has(id)) continue;
    const octets = await readFile(join(source.dir, file));
    found.set(id, { file, v: empreinte(octets), largeur: largeurWebp(octets), octets });
  }
  return found;
}

/** `sharp`, s'il est là. Il l'est en local ; sur le serveur de build, peut-être pas. */
async function chargeSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    return null;
  }
}

/**
 * Les vignettes des cartes : celles qui existent déjà pour la bonne empreinte,
 * plus celles que `sharp` peut faire. Les vignettes d'anciennes images sont
 * effacées.
 */
async function vignettes(cartes) {
  await mkdir(DOSSIER_VIGNETTES, { recursive: true });
  const presentes = new Set(await readdir(DOSSIER_VIGNETTES));
  const attendues = new Set();
  const faites = [];
  let sharp;
  const resultat = new Map();

  for (const [id, carte] of cartes) {
    // Une vignette ne se tire que d'un WebP dont on connaît la largeur, et
    // plus grand qu'elle.
    if (!carte.largeur) continue;
    const jeu = {};
    for (const largeur of LARGEURS) {
      if (largeur >= carte.largeur) continue;
      const nom = `${id}.${carte.v}.${largeur}.webp`;
      attendues.add(nom);
      if (!presentes.has(nom)) {
        sharp ??= (await chargeSharp()) ?? false;
        if (!sharp) continue;
        await sharp(carte.octets)
          .resize({ width: largeur })
          .webp({ quality: QUALITE, effort: 6 })
          .toFile(join(DOSSIER_VIGNETTES, nom));
        faites.push(nom);
      }
      jeu[largeur] = `/cartes/vignettes/${nom}`;
    }
    if (Object.keys(jeu).length === LARGEURS.length) {
      resultat.set(id, { ...jeu, grande: carte.largeur });
    }
  }

  // Les vignettes d'images remplacées ou retirées : elles ne servent plus.
  for (const nom of presentes) {
    if (/^[\w-]+\.[0-9a-f]{10}\.\d+\.webp$/.test(nom) && !attendues.has(nom)) {
      await unlink(join(DOSSIER_VIGNETTES, nom));
    }
  }
  return { resultat, faites, sansSharp: sharp === false };
}

const indexed = await Promise.all(SOURCES.map(index));
const lesVignettes = await vignettes(indexed[0]);

const blocks = SOURCES.map((source, i) => {
  const entries = [...indexed[i].entries()]
    .map(([id, { file, v }]) => `  '${id}': '${source.base}/${file}?v=${v}',`)
    .join('\n');
  return `export const ${source.name}: Record<string, string> = {\n${entries}\n};`;
});

const lignesVignettes = [...lesVignettes.resultat.entries()]
  .map(([id, jeu]) => {
    const liste = [...LARGEURS.map((l) => `${jeu[l]} ${l}w`), `${adresseCarte(id)} ${jeu.grande}w`];
    return `  '${id}': { petite: '${jeu[LARGEURS[0]]}', moyenne: '${jeu[LARGEURS[1]]}', srcset: '${liste.join(', ')}' },`;
  })
  .join('\n');

function adresseCarte(id) {
  const carte = indexed[0].get(id);
  return `/cartes/${carte.file}?v=${carte.v}`;
}

blocks.push(
  [
    '/**',
    ' * Les vignettes des illustrations de cartes, de 200 et 480 px de large, et le',
    ' * `srcset` qui les propose au navigateur avec l’illustration entière.',
    ' */',
    `export const CARD_VIGNETTES: Record<string, { petite: string; moyenne: string; srcset: string }> = {\n${lignesVignettes}\n};`,
  ].join('\n'),
);

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

await writeFile(OUT, header + blocks.join('\n\n') + '\n', 'utf8');

for (const [i, source] of SOURCES.entries()) {
  const found = indexed[i];
  console.log(
    found.size === 0
      ? `public${source.base}/ : aucun visuel — repli sur le rendu vectoriel.`
      : `public${source.base}/ : ${found.size} visuel(s) — ${[...found.keys()].join(', ')}`,
  );
}
console.log(
  `public/cartes/vignettes/ : ${lesVignettes.resultat.size} carte(s) avec vignettes` +
    (lesVignettes.faites.length ? `, ${lesVignettes.faites.length} vignette(s) faite(s)` : '') +
    (lesVignettes.sansSharp ? ' — sharp absent : les cartes sans vignettes gardent leur illustration entière' : ''),
);
