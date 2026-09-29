#!/usr/bin/env node
/**
 * Verse les données locales (`.data/league.json`) dans la base Postgres.
 *
 *   npm run importe-base
 *
 * Lit `DATABASE_URL` dans `.env.local`. À lancer une fois, au moment de passer
 * du fichier à la base. Refuse d'écraser une base qui a déjà des joueurs,
 * sauf avec `--ecrase`.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

async function variable(nom) {
  if (process.env[nom]) return process.env[nom];
  try {
    const env = await readFile(join(process.cwd(), '.env.local'), 'utf8');
    const ligne = env.split(/\r?\n/).find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const url = await variable('DATABASE_URL');
if (!url) {
  console.error('DATABASE_URL manque (dans .env.local ou l’environnement).');
  process.exit(1);
}

const fichier = process.env.LEAGUE_DATA_FILE ?? join(process.cwd(), '.data', 'league.json');
const donnees = JSON.parse(await readFile(fichier, 'utf8'));
const ecrase = process.argv.includes('--ecrase');

const sql = postgres(url, { prepare: false, max: 1 });
try {
  await sql`
    create table if not exists league_state (
      id integer primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`;
  await sql`alter table league_state enable row level security`;

  const [existante] = await sql`select jsonb_array_length(data->'players') as joueurs from league_state where id = 1`;
  if (existante && existante.joueurs > 0 && !ecrase) {
    console.error(`La base contient déjà ${existante.joueurs} joueur(s). Relancer avec --ecrase pour les remplacer.`);
    process.exit(1);
  }

  await sql`
    insert into league_state (id, data) values (1, ${sql.json(donnees)})
    on conflict (id) do update set data = excluded.data, updated_at = now()`;
  const [verif] = await sql`
    select jsonb_array_length(data->'players') as joueurs, jsonb_array_length(data->'games') as games
    from league_state where id = 1`;
  console.log(`Base remplie : ${verif.joueurs} joueurs, ${verif.games} games.`);
} finally {
  await sql.end();
}
