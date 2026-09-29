import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { CARDS, PACKS } from '@/lib/domain/catalog';

/**
 * Le schéma `winter` : la base, lisible depuis Supabase.
 *
 * Le site range toute la ligue dans une seule ligne JSON (`league_state`),
 * ce qui garde les écritures simples et transactionnelles, mais rend la
 * table illisible dans l'éditeur de Supabase. Ce schéma en donne une vue à
 * plat, une par collection — joueurs, games, boosters à ouvrir, ouvertures,
 * cartes en attente, flocons, duels, subs, journal — plus le catalogue des
 * cartes et des boosters, recopié depuis le code.
 *
 * Tout ici est en lecture seule et dérivé : le code et `league_state` restent
 * la source de vérité. Les vues sont `security_invoker` et le schéma n'est
 * accordé à aucun rôle de l'API publique : seul le rôle serveur les lit.
 *
 * Le schéma n'est recréé que si son empreinte change (nouvelle carte, vue
 * modifiée) : un démarrage à froid ordinaire ne coûte qu'une lecture.
 */

/** Le nom d'un joueur à partir de son identifiant, dans le document. */
const nom = (champ: string) =>
  `(select j->>'pseudo' from jsonb_array_elements(s.data->'players') j where j->>'id' = ${champ})`;

const VUE = (nomVue: string, corps: string) =>
  `create or replace view winter.${nomVue} with (security_invoker = true) as ${corps}`;

const VUES: string[] = [
  VUE(
    'joueurs',
    `select p->>'pseudo' as pseudo, p->>'role' as role, p->>'twitchLogin' as twitch,
       p->>'activisionId' as activision, (p->>'snowflakes')::int as flocons,
       (p->>'subsOfferts')::int as subs_offerts, (p->>'active')::boolean as actif,
       (p->>'joinedAt')::timestamptz as inscrit_le, p->>'slug' as slug, p->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'players') p where s.id = 1`,
  ),
  VUE(
    'games',
    `select (g->>'playedAt')::timestamptz as joue_le, ${nom("g->>'playerId'")} as joueur,
       (g->>'kills')::int as kills, (g->>'placement')::int as top,
       (g->>'bonusPoints')::numeric as bonus_cartes, (g->>'score')::numeric as score,
       (g->>'skipped')::boolean as ignoree, g->>'note' as note, g->>'id' as id, g->>'playerId' as joueur_id
     from public.league_state s, jsonb_array_elements(s.data->'games') g where s.id = 1`,
  ),
  VUE(
    'boosters_a_ouvrir',
    `select (b->>'creeA')::timestamptz as cree_le, b->>'packId' as booster,
       ${nom("b->>'joueurId'")} as joueur, b->>'raison' as raison, b->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'packsDus') b
     where s.id = 1 and b->>'ouvertureId' is null`,
  ),
  VUE(
    'ouvertures',
    `select (o->>'openedAt')::timestamptz as ouvert_le, o->>'packId' as booster, o->>'cardId' as carte,
       o->>'rarity' as rarete, ${nom("o->>'joueurId'")} as joueur, (o->>'chance')::numeric as chance,
       o->>'ouvertPar' as ouvert_par, o->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'ouvertures') o where s.id = 1`,
  ),
  VUE(
    'cartes_en_attente',
    `select ${nom("c->>'joueurId'")} as joueur, c->>'cardId' as carte,
       (c->>'creeA')::timestamptz as recue_le, (c->>'consommeeA')::timestamptz as consommee_le,
       c->>'resultat' as resultat, c->>'gameId' as game_id, c->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'cartesEnAttente') c where s.id = 1`,
  ),
  VUE(
    'flocons',
    `select (l->>'createdAt')::timestamptz as le, ${nom("l->>'playerId'")} as joueur,
       (l->>'delta')::int as delta, (l->>'balanceAfter')::int as solde, l->>'reason' as motif,
       l->>'refId' as reference, l->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'ledger') l where s.id = 1`,
  ),
  VUE(
    'duels',
    `select (b->>'creeeA')::timestamptz as cree_le, b->>'statut' as statut, (b->>'manches')::int as manches,
       (b->>'mise')::int as mise, ${nom("b->>'hoteId'")} as hote, ${nom("b->>'adversaireId'")} as adversaire,
       ${nom("b->>'vainqueurId'")} as vainqueur, (b->>'resolueA')::timestamptz as resolu_le, b->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'batailles') b where s.id = 1`,
  ),
  VUE(
    'subs',
    `select (e->>'at')::timestamptz as le, (e->>'delta')::int as ajout, (e->>'totalAfter')::int as total,
       e->'milestones' as paliers, (e->>'snowflakesEach')::int as flocons_chacun, e->'packs' as boosters,
       (e->>'recipients')::int as beneficiaires, e->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'subEvents') e where s.id = 1`,
  ),
  VUE(
    'journal',
    `select (a->>'at')::timestamptz as le, a->>'actor' as acteur, a->>'action' as action,
       a->>'targetId' as cible, a->>'detail' as detail, a->>'id' as id
     from public.league_state s, jsonb_array_elements(s.data->'audit') a where s.id = 1`,
  ),
  VUE(
    'saison',
    `select (s.data->>'version')::int as version_schema, (s.data->'config'->>'totalSubs')::int as subs_total,
       (s.data->'config'->>'maxGamesPerPlayer')::int as games_max_par_joueur,
       (s.data->'config'->>'seasonStartsAt')::timestamptz as debut, (s.data->'config'->>'seasonEndsAt')::timestamptz as fin,
       s.updated_at as derniere_ecriture
     from public.league_state s where s.id = 1`,
  ),
];

const CARTES = CARDS.map((c) => ({
  id: c.id,
  nom: c.name,
  sous_titre: c.subtitle,
  rarete: c.rarity,
  nature: c.nature,
  puissance: c.power,
  description: c.description,
  boosters: [...c.packs],
  effet: c.effect,
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

/** L'empreinte de tout ce que ce fichier crée : si elle ne change pas, rien à refaire. */
const EMPREINTE = createHash('sha256')
  .update(JSON.stringify({ VUES, CARTES, BOOSTERS, v: 1 }))
  .digest('hex')
  .slice(0, 16);

/**
 * Crée ou met à jour le schéma de lecture. À appeler une fois par instance ;
 * les erreurs sont avalées par l'appelant, car ce schéma n'est qu'un confort.
 */
export async function prepareLecture(sql: postgres.Sql): Promise<void> {
  const [actuel] = await sql<{ empreinte: string | null }[]>`
    select obj_description(oid, 'pg_namespace') as empreinte from pg_namespace where nspname = 'winter'`;
  if (actuel?.empreinte === EMPREINTE) return;

  await sql.begin(async (tx) => {
    // Deux instances qui démarrent ensemble ne recréent pas les vues en même temps.
    await tx`select pg_advisory_xact_lock(724242)`;
    await tx`create schema if not exists winter`;
    await tx`revoke all on schema winter from public`;
    await tx.unsafe(`
      do $$ begin
        if exists (select 1 from pg_roles where rolname = 'anon') then
          revoke all on schema winter from anon, authenticated;
          revoke all on all tables in schema winter from anon, authenticated;
        end if;
      end $$`);

    await tx`
      create table if not exists winter.cartes (
        id text primary key, nom text not null, sous_titre text, rarete text not null,
        nature text not null, puissance int, description text, boosters text[], effet jsonb
      )`;
    await tx`
      create table if not exists winter.boosters (
        id text primary key, nom text not null, accroche text, declencheur text,
        portee text, pour_qui text, taux_catalogue jsonb
      )`;
    await tx`alter table winter.cartes enable row level security`;
    await tx`alter table winter.boosters enable row level security`;

    await tx`delete from winter.cartes`;
    await tx`
      insert into winter.cartes
      select * from jsonb_to_recordset(${tx.json(CARTES as unknown as postgres.JSONValue)}) as x(
        id text, nom text, sous_titre text, rarete text, nature text, puissance int,
        description text, boosters text[], effet jsonb)`;
    await tx`delete from winter.boosters`;
    await tx`
      insert into winter.boosters
      select * from jsonb_to_recordset(${tx.json(BOOSTERS as unknown as postgres.JSONValue)}) as x(
        id text, nom text, accroche text, declencheur text, portee text, pour_qui text, taux_catalogue jsonb)`;

    for (const vue of VUES) await tx.unsafe(vue);

    await tx.unsafe(`comment on schema winter is '${EMPREINTE}'`);
  });
}
