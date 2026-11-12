/**
 * Des joueurs fictifs, pour essayer les cartes et les ouvertures en vrai
 * (demandé par l'organisation le 12/11/2026). Le travail est fait par
 * `lib/services/donneesFictives.ts`, le même que le bouton « Données fictives »
 * de la page de test de la modération.
 *
 *   npx vite-node --config vitest.config.ts scripts/fictifs.ts -- essai
 *   npx vite-node --config vitest.config.ts scripts/fictifs.ts -- ajoute
 *   npx vite-node --config vitest.config.ts scripts/fictifs.ts -- retire
 *
 * `essai` fait tout sur une copie de la base, sans rien écrire, et dit ce qui
 * aurait été fait.
 *
 * `DATABASE_URL` est lue dans `.env.local` et n'est jamais affichée.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '@/lib/db/entities';
import { getCard } from '@/lib/domain/catalog';

const ACTEUR = 'donnees-fictives';

function variable(nom: string): string | null {
  if (process.env[nom]) return process.env[nom]!;
  try {
    const env = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    const ligne = env.split(/\r?\n/).find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

async function main() {
  const mode = process.argv.slice(2).find((a) => ['essai', 'ajoute', 'retire'].includes(a));
  if (!mode) throw new Error('Préciser essai, ajoute ou retire.');
  const url = variable('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL manque.');
  process.env.DATABASE_URL = url;

  // Les services se chargent une fois l'adresse posée : le magasin la lit.
  const { getStore } = await import('@/lib/db/store');
  const { carteQuiAttend } = await import('@/lib/services/effects');
  const { ajouteDonneesFictives, estFictif, retireDonneesFictives } = await import('@/lib/services/donneesFictives');

  const store = getStore();
  const avant = await store.read((db) => ({
    joueurs: db.players.length,
    fictifs: db.players.filter(estFictif).length,
    games: db.games.length,
    dus: db.packsDus.filter((d) => !d.ouvertureId).length,
    limite: db.config.maxGamesPerPlayer,
  }));
  console.log('avant', avant);

  if (mode === 'essai') {
    const copie = await store.read((db) => structuredClone(db) as Database);
    console.log('essai (rien n’est écrit)', ajouteDonneesFictives(copie, ACTEUR));
    for (const p of copie.players.filter(estFictif)) {
      const g = copie.games.filter((x) => x.playerId === p.id && !x.skipped);
      const attend = carteQuiAttend(copie, p.id);
      console.log(
        p.pseudo.padEnd(14),
        String(g.length).padStart(2), 'games',
        String(g.reduce((s, x) => s + x.score, 0)).padStart(4), 'pts',
        String(p.snowflakes).padStart(6), '❄',
        attend ? `attend : ${getCard(attend.cardId)?.name}` : '',
      );
    }
  } else if (mode === 'ajoute') {
    console.log('ajouté', await store.transaction((db) => ajouteDonneesFictives(db, ACTEUR)));
  } else {
    console.log('retiré', await store.transaction((db) => retireDonneesFictives(db, ACTEUR)));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
