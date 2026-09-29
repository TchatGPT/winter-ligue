import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { CARDS, PACKS } from '@/lib/domain/catalog';

/**
 * Le catalogue, recopié dans la base : les cartes et les boosters.
 *
 * Le code reste la source de vérité (`lib/domain/catalog.ts`) ; ces deux
 * tables en sont une copie, pour qu'on les lise et qu'on les relie aux
 * autres depuis Supabase (`ouvertures.carte_id`, `boosters_a_ouvrir.booster_id`…).
 * Les taux réglés par l'administration sont dans `reglages_boosters`.
 *
 * La copie n'est refaite que si le catalogue change : son empreinte est
 * gardée en commentaire de la table `cartes`.
 */

const CARTES = CARDS.map((carte) => ({
  id: carte.id,
  nom: carte.name,
  sous_titre: carte.subtitle,
  rarete: carte.rarity,
  nature: carte.nature,
  puissance: carte.power,
  description: carte.description,
  boosters: [...carte.packs],
  effet: carte.effect,
}));

const BOOSTERS = PACKS.map((p) => ({
  id: p.id,
  nom: p.name,
  accroche: p.tagline,
  declencheur: p.declencheur,
  portee: p.portee,
  pour_qui: p.pourQui,
  taux_catalogue: p.weights,
}));

const EMPREINTE = createHash('sha256')
  .update(JSON.stringify({ CARTES, BOOSTERS, v: 2 }))
  .digest('hex')
  .slice(0, 16);

export async function synchroniseCatalogue(sql: postgres.Sql): Promise<void> {
  const [actuel] = await sql<{ empreinte: string | null }[]>`
    select obj_description(to_regclass('public.cartes'), 'pg_class') as empreinte`;
  if (actuel?.empreinte === EMPREINTE) return;

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(724243)`;
    // La première version exposait des vues dans un schéma à part : elles
    // sont remplacées par les vraies tables.
    await tx`drop schema if exists winter cascade`;
    await tx`
      create table if not exists cartes (
        id text primary key, nom text not null, sous_titre text, rarete text not null,
        nature text not null, puissance integer, description text, boosters text[], effet jsonb
      )`;
    await tx`
      create table if not exists boosters (
        id text primary key, nom text not null, accroche text, declencheur text,
        portee text, pour_qui text, taux_catalogue jsonb
      )`;
    await tx`delete from cartes`;
    await tx`
      insert into cartes
      select * from jsonb_to_recordset(${tx.json(CARTES as unknown as postgres.JSONValue)}) as x(
        id text, nom text, sous_titre text, rarete text, nature text, puissance integer,
        description text, boosters text[], effet jsonb)`;
    await tx`delete from boosters`;
    await tx`
      insert into boosters
      select * from jsonb_to_recordset(${tx.json(BOOSTERS as unknown as postgres.JSONValue)}) as x(
        id text, nom text, accroche text, declencheur text, portee text, pour_qui text, taux_catalogue jsonb)`;
    await tx.unsafe(`comment on table cartes is '${EMPREINTE}'`);
  });
}
