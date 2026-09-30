import type postgres from 'postgres';
import type { Database, LeagueConfig } from './entities';

/**
 * La structure de la base : une table par type de donnée.
 *
 * Le code du jeu travaille sur un objet `Database` en mémoire ; ce fichier
 * fait le pont avec les tables. Chaque collection est décrite une fois — sa
 * table, sa clé, et la correspondance champ par champ — et c'est cette
 * description qui sert à la fois à charger et à enregistrer.
 *
 * L'enregistrement ne réécrit que ce qui a changé : chaque ligne chargée est
 * gardée sous forme d'empreinte, et à la fin d'une transaction on n'envoie
 * que les lignes nouvelles ou modifiées, et l'on supprime celles qui ont
 * disparu.
 */

type TypeColonne = 'text' | 'int' | 'float' | 'bool' | 'ts' | 'json';

interface Colonne {
  /** Le champ de l'objet en mémoire. */
  champ: string;
  /** La colonne de la table. */
  col: string;
  type: TypeColonne;
}

type CleCollection = Exclude<keyof Database, 'version' | 'config'>;

interface Collection {
  cle: CleCollection;
  table: string;
  /** Le champ qui identifie une ligne. */
  idChamp: string;
  colonnes: Colonne[];
}

const c = (champ: string, col: string, type: TypeColonne): Colonne => ({ champ, col, type });

export const COLLECTIONS: Collection[] = [
  {
    cle: 'players',
    table: 'joueurs',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('slug', 'slug', 'text'),
      c('pseudo', 'pseudo', 'text'),
      c('role', 'role', 'text'),
      c('twitchId', 'twitch_id', 'text'),
      c('twitchLogin', 'twitch_login', 'text'),
      c('avatarUrl', 'avatar_url', 'text'),
      c('activisionId', 'activision_id', 'text'),
      c('snowflakes', 'flocons', 'int'),
      c('subsOfferts', 'subs_offerts', 'int'),
      c('creneauxBonus', 'creneaux_bonus', 'int'),
      c('immuniseJusqua', 'immunise_jusqua', 'ts'),
      c('active', 'actif', 'bool'),
      c('joinedAt', 'inscrit_le', 'ts'),
      c('sessionsDepuis', 'sessions_depuis', 'ts'),
      c('roleManuel', 'role_manuel', 'bool'),
    ],
  },
  {
    cle: 'games',
    table: 'games',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('playerId', 'joueur_id', 'text'),
      c('kills', 'kills', 'int'),
      c('placement', 'top', 'int'),
      c('bonusPoints', 'bonus_cartes', 'float'),
      c('score', 'score', 'float'),
      c('skipped', 'ignoree', 'bool'),
      c('note', 'note', 'text'),
      c('playedAt', 'jouee_le', 'ts'),
      c('createdAt', 'saisie_le', 'ts'),
      c('applied', 'effets_cartes', 'json'),
    ],
  },
  {
    cle: 'packsDus',
    table: 'boosters_a_ouvrir',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('packId', 'booster_id', 'text'),
      c('joueurId', 'joueur_id', 'text'),
      c('raison', 'raison', 'text'),
      c('creeA', 'cree_le', 'ts'),
      c('ouvertureId', 'ouverture_id', 'text'),
    ],
  },
  {
    cle: 'ouvertures',
    table: 'ouvertures',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('packId', 'booster_id', 'text'),
      c('cardId', 'carte_id', 'text'),
      c('rarity', 'rarete', 'text'),
      c('joueurId', 'joueur_id', 'text'),
      c('beneficiaires', 'beneficiaires', 'json'),
      c('chance', 'chance', 'float'),
      c('ouvertPar', 'ouvert_par', 'text'),
      c('openedAt', 'ouvert_le', 'ts'),
      c('idempotencyKey', 'cle_idempotence', 'text'),
    ],
  },
  {
    cle: 'cartesEnAttente',
    table: 'cartes_en_attente',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('joueurId', 'joueur_id', 'text'),
      c('cardId', 'carte_id', 'text'),
      c('ouvertureId', 'ouverture_id', 'text'),
      c('creeA', 'recue_le', 'ts'),
      c('consommeeA', 'consommee_le', 'ts'),
      c('gameId', 'game_id', 'text'),
      c('resultat', 'resultat', 'text'),
      c('paireId', 'paire_id', 'text'),
    ],
  },
  {
    cle: 'ledger',
    table: 'flocons',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('playerId', 'joueur_id', 'text'),
      c('delta', 'delta', 'int'),
      c('balanceAfter', 'solde_apres', 'int'),
      c('reason', 'motif', 'text'),
      c('refId', 'reference', 'text'),
      c('createdAt', 'le', 'ts'),
    ],
  },
  {
    cle: 'subEvents',
    table: 'subs',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('at', 'le', 'ts'),
      c('delta', 'ajout', 'int'),
      c('totalAfter', 'total_apres', 'int'),
      c('milestones', 'paliers', 'json'),
      c('snowflakesEach', 'flocons_chacun', 'int'),
      c('packs', 'boosters', 'json'),
      c('recipients', 'beneficiaires', 'int'),
    ],
  },
  {
    cle: 'audit',
    table: 'journal',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('actor', 'acteur', 'text'),
      c('action', 'action', 'text'),
      c('targetId', 'cible', 'text'),
      c('detail', 'detail', 'text'),
      c('at', 'le', 'ts'),
    ],
  },
  {
    cle: 'reglagesPacks',
    table: 'reglages_boosters',
    idChamp: 'packId',
    colonnes: [c('packId', 'booster_id', 'text'), c('weights', 'taux', 'json'), c('updatedAt', 'mis_a_jour', 'ts')],
  },
  {
    cle: 'batailles',
    table: 'duels',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('manches', 'manches', 'int'),
      c('mise', 'mise', 'int'),
      c('hoteId', 'hote_id', 'text'),
      c('adversaireId', 'adversaire_id', 'text'),
      c('statut', 'statut', 'text'),
      c('tirages', 'tirages', 'json'),
      c('echanges', 'echanges', 'json'),
      c('vainqueurId', 'vainqueur_id', 'text'),
      c('creeeA', 'cree_le', 'ts'),
      c('resolueA', 'resolu_le', 'ts'),
    ],
  },
  {
    cle: 'evenements',
    table: 'evenements',
    idChamp: 'id',
    colonnes: [
      c('id', 'id', 'text'),
      c('kind', 'type', 'text'),
      c('label', 'nom', 'text'),
      c('description', 'description', 'text'),
      c('startsAt', 'debut', 'ts'),
      c('endsAt', 'fin', 'ts'),
      c('declencheA', 'declenche_a', 'int'),
    ],
  },
];

/**
 * Les tables, en SQL. Les clés étrangères vers `joueurs` sont différées à la
 * fin de la transaction : l'ordre dans lequel on écrit ne compte pas.
 *
 * Supprimer un joueur — depuis l'éditeur de Supabase, par exemple — emporte
 * ce qui n'a de sens qu'avec lui : ses games, ses mouvements de flocons, ses
 * cartes en attente, ses boosters à ouvrir, les duels qu'il a lancés. Ses
 * ouvertures de boosters restent, sans joueur. L'adversaire et le vainqueur
 * d'un duel n'ont pas de clé : ce pouvait être le bot, qui n'est pas un joueur ;
 * un joueur disparu s'y affiche « Joueur inconnu ».
 */
export const SCHEMA_SQL = `
create table if not exists saison (
  id integer primary key check (id = 1),
  version integer not null,
  total_subs integer not null default 0,
  games_max_par_joueur integer not null,
  debut timestamptz not null,
  fin timestamptz not null,
  mis_a_jour timestamptz not null default now(),
  overlay_generation integer not null default 1,
  twitch_vus jsonb not null default '[]'
);

create table if not exists joueurs (
  id text primary key,
  slug text not null unique,
  pseudo text not null,
  role text not null check (role in ('joueur', 'admin')),
  twitch_id text unique,
  twitch_login text,
  avatar_url text,
  activision_id text,
  flocons integer not null default 0,
  subs_offerts integer not null default 0,
  creneaux_bonus integer not null default 0,
  immunise_jusqua timestamptz,
  actif boolean not null default true,
  inscrit_le timestamptz not null,
  sessions_depuis timestamptz,
  role_manuel boolean not null default false
);

create table if not exists games (
  id text primary key,
  joueur_id text not null references joueurs (id) on delete cascade deferrable initially deferred,
  kills integer not null,
  top integer check (top in (1, 2, 3)),
  bonus_cartes double precision not null default 0,
  score double precision not null,
  ignoree boolean not null default false,
  note text,
  jouee_le timestamptz not null,
  saisie_le timestamptz not null,
  effets_cartes jsonb not null default '[]'
);
create index if not exists games_joueur on games (joueur_id);

create table if not exists boosters_a_ouvrir (
  id text primary key,
  booster_id text not null,
  joueur_id text references joueurs (id) on delete cascade deferrable initially deferred,
  raison text not null,
  cree_le timestamptz not null,
  ouverture_id text
);

create table if not exists ouvertures (
  id text primary key,
  booster_id text not null,
  carte_id text not null,
  rarete text not null,
  joueur_id text references joueurs (id) on delete set null deferrable initially deferred,
  beneficiaires jsonb not null default '[]',
  chance double precision not null,
  ouvert_par text not null,
  ouvert_le timestamptz not null,
  cle_idempotence text not null unique
);

create table if not exists cartes_en_attente (
  id text primary key,
  joueur_id text not null references joueurs (id) on delete cascade deferrable initially deferred,
  carte_id text not null,
  ouverture_id text not null,
  recue_le timestamptz not null,
  consommee_le timestamptz,
  game_id text,
  resultat text,
  paire_id text
);
create index if not exists cartes_en_attente_joueur on cartes_en_attente (joueur_id);

create table if not exists flocons (
  id text primary key,
  joueur_id text not null references joueurs (id) on delete cascade deferrable initially deferred,
  delta integer not null,
  solde_apres integer not null,
  motif text not null,
  reference text,
  le timestamptz not null
);
create index if not exists flocons_joueur on flocons (joueur_id);

create table if not exists subs (
  id text primary key,
  le timestamptz not null,
  ajout integer not null,
  total_apres integer not null,
  paliers jsonb not null default '[]',
  flocons_chacun integer not null default 0,
  boosters jsonb not null default '[]',
  beneficiaires integer not null default 0
);

create table if not exists journal (
  id text primary key,
  acteur text not null,
  action text not null,
  cible text,
  detail text not null,
  le timestamptz not null
);
create index if not exists journal_le on journal (le);

create table if not exists reglages_boosters (
  booster_id text primary key,
  taux jsonb not null,
  mis_a_jour timestamptz not null
);

create table if not exists duels (
  id text primary key,
  manches integer not null,
  mise integer not null,
  hote_id text not null references joueurs (id) on delete cascade deferrable initially deferred,
  adversaire_id text,
  statut text not null check (statut in ('ATTENTE', 'TERMINEE', 'ANNULEE')),
  tirages jsonb not null default '[]',
  echanges jsonb not null default '[]',
  vainqueur_id text,
  cree_le timestamptz not null,
  resolu_le timestamptz
);

create table if not exists evenements (
  id text primary key,
  type text not null,
  nom text not null,
  description text not null,
  debut timestamptz not null,
  fin timestamptz not null,
  declenche_a integer not null
);

-- Le duel de flocons : ses lancers, à côté des cartes des anciens duels.
alter table duels add column if not exists echanges jsonb not null default '[]';

-- Les cartes « Game supplémentaire » et « Immunité » : ce qu'elles laissent
-- au joueur.
alter table joueurs add column if not exists creneaux_bonus integer not null default 0;
alter table joueurs add column if not exists immunise_jusqua timestamptz;

-- La révocation des sessions : celles ouvertes avant cette date sont refusées.
alter table joueurs add column if not exists sessions_depuis timestamptz;

-- Un rôle choisi à la main : la connexion Twitch n'y touche plus.
alter table joueurs add column if not exists role_manuel boolean not null default false;

-- Il n'y a plus de rôle modérateur à part : les modérateurs sont admins.
update joueurs set role = 'admin' where role = 'moderateur';

-- Les liens d'overlay OBS : en changer la génération les révoque tous.
alter table saison add column if not exists overlay_generation integer not null default 1;

-- Les messages de Twitch déjà comptés : un message renvoyé ne compte qu'une fois.
alter table saison add column if not exists twitch_vus jsonb not null default '[]';

-- Le journal ne s'écrit qu'en ajout : ni modification, ni suppression, ni
-- vidage. Une ligne effacée par erreur de code — ou par qui aurait pris la
-- main sur le site — fait échouer toute la transaction.
create or replace function journal_ajout_seul() returns trigger language plpgsql as $f$
begin
  raise exception 'Le journal est en ajout seul.';
end $f$;
drop trigger if exists journal_ajout_seul on journal;
create trigger journal_ajout_seul before update or delete on journal
  for each row execute function journal_ajout_seul();
drop trigger if exists journal_sans_vidage on journal;
create trigger journal_sans_vidage before truncate on journal
  for each statement execute function journal_ajout_seul();

-- Les overlays lisent les dernières ouvertures et les derniers duels par date.
create index if not exists ouvertures_le on ouvertures (ouvert_le);
create index if not exists duels_cree_le on duels (cree_le);

-- Les tables créées avant la suppression en cascade : leurs clés sont
-- remplacées, une seule fois, par celles décrites ci-dessus.
do $$
declare
  r record;
  existante record;
begin
  for r in select * from (values
    ('games', 'joueur_id', 'c'),
    ('flocons', 'joueur_id', 'c'),
    ('cartes_en_attente', 'joueur_id', 'c'),
    ('boosters_a_ouvrir', 'joueur_id', 'c'),
    ('ouvertures', 'joueur_id', 'n'),
    ('duels', 'hote_id', 'c')
  ) as v(tab, col, action) loop
    select c.conname, c.confdeltype into existante
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = ('public.' || r.tab)::regclass and c.contype = 'f' and a.attname = r.col
     limit 1;
    if found and existante.confdeltype::text = r.action then
      continue;
    end if;
    if found then
      execute format('alter table public.%I drop constraint %I', r.tab, existante.conname);
    end if;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.joueurs (id) on delete %s deferrable initially deferred',
      r.tab, r.tab || '_' || r.col || '_fkey', r.col,
      case r.action when 'c' then 'cascade' else 'set null' end
    );
  end loop;
end $$;
`;

/** Toutes les tables de données, dans l'ordre où les lire. */
export const TABLES = ['saison', ...COLLECTIONS.map((col) => col.table)];

/* ------------------------------- Lecture -------------------------------- */

function versObjet(ligne: Record<string, unknown>, colonnes: Colonne[]): Record<string, unknown> {
  const objet: Record<string, unknown> = {};
  for (const { champ, col, type } of colonnes) {
    const v = ligne[col];
    // Les dates sortent du JSON sous la forme de Postgres ; on les ramène au
    // format ISO que le code produit et compare.
    objet[champ] = v === null || v === undefined ? null : type === 'ts' ? new Date(v as string).toISOString() : v;
  }
  return objet;
}

/**
 * Les tables que charge `chargeBase` : toutes, sauf le journal.
 *
 * Le journal ne fait que grandir — il est en ajout seul — et aucune règle du
 * jeu ne le relit : le charger à chaque page ferait payer à tout le site le
 * poids de son historique. Il se lit à part (`lisJournal`). Une transaction
 * qui journalise pousse ses lignes dans un tableau parti vide : l'écriture ne
 * voit que des lignes nouvelles, et les insère.
 */
const CHARGEES = COLLECTIONS.filter((col) => col.cle !== 'audit');

/**
 * Charge toute la base en une seule requête : chaque table revient agrégée en
 * JSON dans un seul document. Un aller-retour réseau, quel que soit le nombre
 * de tables.
 */
export async function chargeBase(sql: postgres.Sql | postgres.TransactionSql): Promise<Partial<Database>> {
  const morceaux = [
    `'saison', (select row_to_json(s) from saison s where id = 1)`,
    ...CHARGEES.map((col) => `'${col.table}', coalesce((select json_agg(t) from ${col.table} t), '[]'::json)`),
  ].join(',\n');
  const [ligne] = await sql.unsafe<{ doc: Record<string, unknown> }[]>(`select json_build_object(${morceaux}) as doc`);
  const doc = ligne.doc;

  const base: Partial<Database> = {};
  const saison = doc.saison as Record<string, unknown> | null;
  if (saison) {
    base.version = saison.version as number;
    base.config = {
      totalSubs: saison.total_subs as number,
      maxGamesPerPlayer: saison.games_max_par_joueur as number,
      seasonStartsAt: new Date(saison.debut as string).toISOString(),
      seasonEndsAt: new Date(saison.fin as string).toISOString(),
      overlayGeneration: (saison.overlay_generation as number | undefined) ?? 1,
      twitchVus: Array.isArray(saison.twitch_vus) ? (saison.twitch_vus as LeagueConfig['twitchVus']) : [],
    } satisfies LeagueConfig;
  }
  for (const col of CHARGEES) {
    const lignes = (doc[col.table] as Record<string, unknown>[]) ?? [];
    (base as Record<string, unknown>)[col.cle] = lignes.map((l) => versObjet(l, col.colonnes));
  }
  base.audit = [];
  return base;
}

/** Les dernières lignes du journal, la plus récente en tête. */
export async function lisJournal(sql: postgres.Sql, combien: number): Promise<Database['audit']> {
  const col = COLLECTIONS.find((c) => c.cle === 'audit')!;
  const lignes = await sql<Record<string, unknown>[]>`
    select * from journal order by le desc limit ${Math.max(1, Math.floor(combien))}`;
  return lignes.map((l) => versObjet(l, col.colonnes)) as unknown as Database['audit'];
}

/* ---------------------------- Enregistrement ----------------------------- */

/** L'empreinte de chaque ligne, par collection, pour savoir ce qui a changé. */
export type Empreintes = Map<string, Map<string, string>>;

/**
 * L'empreinte d'une entité : ses champs **à elle** (pas les colonnes), dans
 * l'ordre des descripteurs, les absents ramenés à null. Deux entités égales
 * donnent la même chaîne ; un seul champ changé, et elle diffère.
 */
function empreinte(e: Record<string, unknown>, colonnes: Colonne[]): string {
  return JSON.stringify(colonnes.map(({ champ }) => e[champ] ?? null));
}

export function empreintes(db: Database): Empreintes {
  const tout: Empreintes = new Map();
  tout.set('saison', new Map([['1', JSON.stringify([db.version, db.config])]]));
  for (const col of COLLECTIONS) {
    const parId = new Map<string, string>();
    for (const e of db[col.cle] as unknown as Record<string, unknown>[]) {
      parId.set(String(e[col.idChamp]), empreinte(e, col.colonnes));
    }
    tout.set(col.table, parId);
  }
  return tout;
}

function versLigne(e: Record<string, unknown>, colonnes: Colonne[], sql: postgres.TransactionSql): Record<string, unknown> {
  const ligne: Record<string, unknown> = {};
  for (const { champ, col, type } of colonnes) {
    const v = e[champ];
    if (v === undefined || v === null) ligne[col] = null;
    else if (type === 'json') ligne[col] = sql.json(v as postgres.JSONValue);
    else ligne[col] = v;
  }
  return ligne;
}

/**
 * Écrit ce qui a changé depuis `avant`. Renvoie le nombre de lignes touchées,
 * pour le journal de développement.
 */
export async function enregistreBase(tx: postgres.TransactionSql, db: Database, avant: Empreintes): Promise<number> {
  const apres = empreintes(db);
  let touchees = 0;

  if (avant.get('saison')?.get('1') !== apres.get('saison')?.get('1')) {
    await tx`
      insert into saison (id, version, total_subs, games_max_par_joueur, debut, fin, mis_a_jour, overlay_generation, twitch_vus)
      values (1, ${db.version}, ${db.config.totalSubs}, ${db.config.maxGamesPerPlayer},
              ${db.config.seasonStartsAt}, ${db.config.seasonEndsAt}, now(), ${db.config.overlayGeneration},
              ${tx.json(db.config.twitchVus as unknown as postgres.JSONValue)})
      on conflict (id) do update set
        version = excluded.version, total_subs = excluded.total_subs,
        games_max_par_joueur = excluded.games_max_par_joueur,
        debut = excluded.debut, fin = excluded.fin, mis_a_jour = now(),
        overlay_generation = excluded.overlay_generation, twitch_vus = excluded.twitch_vus`;
    touchees += 1;
  }

  for (const col of COLLECTIONS) {
    const vieux = avant.get(col.table) ?? new Map<string, string>();
    const neuf = apres.get(col.table)!;
    const entites = db[col.cle] as unknown as Record<string, unknown>[];

    const aEcrire = entites.filter((e) => {
      const id = String(e[col.idChamp]);
      return vieux.get(id) !== neuf.get(id);
    });
    const aSupprimer = [...vieux.keys()].filter((id) => !neuf.has(id));
    const idCol = col.colonnes.find((x) => x.champ === col.idChamp)!.col;

    if (aSupprimer.length) {
      await tx`delete from ${tx(col.table)} where ${tx(idCol)} in ${tx(aSupprimer)}`;
      touchees += aSupprimer.length;
    }
    // Par paquets : une requête ne peut pas porter un nombre illimité de paramètres.
    for (let i = 0; i < aEcrire.length; i += 500) {
      // Les valeurs sont typées par colonne dans `versLigne` ; le client, lui,
      // attend un type de paramètre qu'on ne peut pas déduire d'un descripteur.
      const lignes = aEcrire
        .slice(i, i + 500)
        .map((e) => versLigne(e, col.colonnes, tx)) as unknown as Record<string, postgres.ParameterOrJSON<never>>[];
      const colonnes = col.colonnes.map((x) => x.col);
      const miseAJour = colonnes
        .filter((x) => x !== idCol)
        .map((x) => `"${x}" = excluded."${x}"`)
        .join(', ');
      await tx`
        insert into ${tx(col.table)} ${tx(lignes, colonnes)}
        on conflict (${tx(idCol)}) do update set ${tx.unsafe(miseAJour)}`;
      touchees += lignes.length;
    }
  }
  return touchees;
}
