import 'server-only';

/**
 * Adaptateur de stockage.
 *
 * L'implémentation actuelle garde tout en mémoire et persiste dans un fichier
 * JSON — suffisant pour développer, et surtout suffisant pour figer l'API que
 * l'adaptateur Postgres/Supabase devra respecter plus tard.
 *
 * Le point important pour la sécurité est `transaction()` : toutes les
 * écritures passent par une file d'attente sérialisée. Deux requêtes qui
 * tentent d'ouvrir le même pack, ou de rejoindre le même affrontement en même
 * temps, sont donc traitées l'une après l'autre — pas de
 * lecture-modification-écriture entrelacée, donc pas de duplication.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { dirname, join } from 'node:path';
import { DEFAULT_MAX_GAMES_PER_PLAYER, ECONOMY, SEASON } from '@/lib/domain/rules';
import type { Database } from './entities';

/*
 * Sur Vercel, le dossier du projet est en lecture seule : seul /tmp s'écrit.
 * C'est un pis-aller, en attendant la base de données — /tmp est propre à
 * chaque instance et vidé à chaque démarrage à froid, donc les données y sont
 * éphémères.
 */
const DATA_FILE = process.env.LEAGUE_DATA_FILE
  ? process.env.LEAGUE_DATA_FILE
  : process.env.VERCEL
    ? join(tmpdir(), 'winter-ligue', 'league.json')
    : join(process.cwd(), '.data', 'league.json');

/**
 * Deux : la version un portait la collection, le marché et les boosters
 * achetés. Une base de version un est relue sans ces tables, et ses games et
 * ses joueurs restent.
 */
export const SCHEMA_VERSION = 2;

export function emptyDatabase(): Database {
  return {
    version: SCHEMA_VERSION,
    config: {
      maxGamesPerPlayer: DEFAULT_MAX_GAMES_PER_PLAYER,
      totalSubs: 0,
      seasonStartsAt: SEASON.startsAt,
      seasonEndsAt: SEASON.endsAt,
    },
    players: [],
    games: [],
    packsDus: [],
    ouvertures: [],
    cartesEnAttente: [],
    ledger: [],
    subEvents: [],
    audit: [],
    reglagesPacks: [],
    batailles: [],
    evenements: [],
  };
}

export interface Store {
  /** Lecture seule. Retourne une copie défensive : muter le résultat ne change rien. */
  read<T>(fn: (db: Readonly<Database>) => T): Promise<T>;
  /**
   * Écriture sérialisée. `fn` reçoit la base réelle et peut la muter ; la
   * persistance est déclenchée à la sortie. Si `fn` lève, rien n'est écrit.
   */
  transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T>;
  /** Remplace intégralement le contenu (restauration de sauvegarde). */
  replace(db: Database): Promise<void>;
}

class JsonFileStore implements Store {
  private db: Database | null = null;
  /** File d'attente : chaque transaction s'enchaîne sur la précédente. */
  private queue: Promise<unknown> = Promise.resolve();
  private loading: Promise<Database> | null = null;

  private async load(): Promise<Database> {
    if (this.db) return this.db;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      try {
        const raw = await readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Database;
        this.db = migrate(parsed);
      } catch {
        // Premier démarrage, ou fichier illisible : on repart d'une base vide
        // plutôt que de faire tomber le serveur.
        this.db = emptyDatabase();
      }
      return this.db;
    })();

    return this.loading;
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const payload = JSON.stringify(this.db, null, 2);
    await mkdir(dirname(DATA_FILE), { recursive: true });
    // Écriture atomique : un crash en cours d'écriture ne corrompt pas le fichier.
    const tmp = `${DATA_FILE}.${randomUUID()}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    await rename(tmp, DATA_FILE);
  }

  async read<T>(fn: (db: Readonly<Database>) => T): Promise<T> {
    const db = await this.load();
    return fn(db);
  }

  async transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      // Instantané pour pouvoir revenir en arrière si `fn` échoue à mi-chemin.
      const snapshot = JSON.stringify(db);
      try {
        const result = await fn(db);
        await this.persist();
        return result;
      } catch (error) {
        this.db = JSON.parse(snapshot) as Database;
        throw error;
      }
    });

    // La file continue même si cette transaction a échoué.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run as Promise<T>;
  }

  async replace(next: Database): Promise<void> {
    await this.transaction((db) => {
      const migrated = migrate(next);
      // On mute l'objet existant pour ne pas invalider les références en cours.
      const mutable = db as unknown as Record<string, unknown>;
      for (const key of Object.keys(mutable)) delete mutable[key];
      Object.assign(db, migrated);
    });
  }
}

/**
 * La base Postgres (Supabase).
 *
 * Toute la ligue tient dans une ligne : un document JSON, dans la table
 * `league_state`. C'est la traduction directe du fichier : même forme, même
 * migration, même contrat `Store`. Ce qui change, c'est qu'elle survit aux
 * redémarrages et qu'elle est partagée entre toutes les instances Vercel.
 *
 * La sérialisation des écritures passe par un verrou de ligne
 * (`SELECT … FOR UPDATE`) : deux transactions simultanées, même sur deux
 * serveurs différents, s'enchaînent au lieu de s'écraser. C'est ce qui garde
 * vraie la règle du projet sur les flocons.
 *
 * La table a la sécurité par ligne activée, sans aucune politique : elle
 * n'est lisible que par le rôle propriétaire, celui de la chaîne de
 * connexion serveur, jamais par l'API publique de Supabase.
 */
class PostgresStore implements Store {
  private readonly sql: postgres.Sql;
  private pret: Promise<void> | null = null;

  constructor(url: string) {
    this.sql = postgres(url, {
      // Le pooler de Supabase en mode transaction ne garde pas les requêtes
      // préparées d'une connexion à l'autre.
      prepare: false,
      // Une fonction Vercel ne sert qu'une requête à la fois.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  /** Crée la table et la ligne au premier appel, une fois par instance. */
  private prepare(): Promise<void> {
    this.pret ??= (async () => {
      await this.sql`
        create table if not exists league_state (
          id integer primary key,
          data jsonb not null,
          updated_at timestamptz not null default now()
        )`;
      await this.sql`alter table league_state enable row level security`;
      await this.sql`
        insert into league_state (id, data)
        values (1, ${this.sql.json(emptyDatabase() as unknown as postgres.JSONValue)})
        on conflict (id) do nothing`;
    })().catch((error) => {
      // On retentera à l'appel suivant plutôt que de garder l'échec en cache.
      this.pret = null;
      throw error;
    });
    return this.pret;
  }

  async read<T>(fn: (db: Readonly<Database>) => T): Promise<T> {
    await this.prepare();
    const [ligne] = await this.sql<{ data: Partial<Database> }[]>`select data from league_state where id = 1`;
    return fn(migrate(ligne?.data ?? emptyDatabase()));
  }

  async transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    await this.prepare();
    // `begin` annule tout si `fn` lève : rien n'est écrit.
    const resultat = await this.sql.begin(async (tx) => {
      const [ligne] = await tx<{ data: Partial<Database> }[]>`select data from league_state where id = 1 for update`;
      const db = migrate(ligne?.data ?? emptyDatabase());
      const valeur = await fn(db);
      await tx`
        update league_state
        set data = ${tx.json(db as unknown as postgres.JSONValue)}, updated_at = now()
        where id = 1`;
      return { valeur };
    });
    return resultat.valeur;
  }

  async replace(next: Database): Promise<void> {
    await this.transaction((db) => {
      const migrated = migrate(next);
      const mutable = db as unknown as Record<string, unknown>;
      for (const key of Object.keys(mutable)) delete mutable[key];
      Object.assign(db, migrated);
    });
  }
}

/**
 * Complète une base chargée dont la forme est plus ancienne que le code.
 *
 * Seules les tables connues sont reprises : une base de version un traînait
 * une collection, un marché et des sachets qui n'existent plus, et les relire
 * tels quels laisserait des clés mortes dans le fichier pour toute la saison.
 */
function migrate(db: Partial<Database>): Database {
  const base = emptyDatabase();
  const config = { ...base.config, ...(db.config ?? {}) } as Record<string, unknown>;
  delete config.shopOpen;
  delete config.marketOpen;

  return {
    version: SCHEMA_VERSION,
    config: config as unknown as Database['config'],
    // Les comptes existants n'avaient ni rôle ni compteur de subs offerts.
    // Le plafond de flocons est arrivé après les premiers soldes : ce qui le
    // dépasse est ramené au plafond, comme un crédit l'aurait été.
    players: (db.players ?? []).map((p) => ({
      ...p,
      role: p.role ?? 'joueur',
      subsOfferts: p.subsOfferts ?? 0,
      activisionId: p.activisionId ?? null,
      snowflakes: Math.min(p.snowflakes ?? 0, ECONOMY.soldeMax),
    })),
    games: (db.games ?? []).map((g) => {
      const ancienne = g as typeof g & { frozen?: boolean };
      const { frozen: _frozen, ...game } = ancienne;
      return {
        ...game,
        applied: (game.applied ?? []).map((a) => {
          const ancien = a as typeof a & { byPlayerId?: string; undone?: boolean };
          const { byPlayerId: _by, undone: _undone, ...effet } = ancien;
          return { ...effet, ouvertureId: effet.ouvertureId ?? '' };
        }),
      };
    }),
    packsDus: db.packsDus ?? [],
    ouvertures: db.ouvertures ?? [],
    cartesEnAttente: (db.cartesEnAttente ?? []).map((c) => ({ ...c, paireId: c.paireId ?? null })),
    ledger: db.ledger ?? [],
    subEvents: (db.subEvents ?? []).map((e) => ({ ...e, packs: e.packs ?? [] })),
    audit: db.audit ?? [],
    reglagesPacks: db.reglagesPacks ?? [],
    // Les affrontements d'avant les packs portaient une liste de sachets. Ils
    // gardent leurs manches, leur mise et leurs tirages, qui suffisent à les
    // relire ; la liste, elle, ne désigne plus rien.
    batailles: (db.batailles ?? []).map((b) => {
      const ancien = b as typeof b & { boosterIds?: string[] };
      const { boosterIds: _ids, ...bataille } = ancien;
      return { ...bataille, manches: bataille.manches ?? 1 };
    }),
    evenements: (db.evenements ?? []).filter(
      (e) => e.kind === 'FLOCONS_DOUBLES' || e.kind === 'CARTES_RENFORCEES',
    ),
  };
}

// En développement, Next recharge les modules à chaque édition : sans ce cache
// global on repartirait d'une base vide à chaque sauvegarde de fichier.
const globalForStore = globalThis as unknown as { __winterStore?: Store };

/**
 * Le stockage : Postgres dès que `DATABASE_URL` est défini, le fichier sinon.
 * En local sans base, rien ne change ; en production, c'est la base.
 */
export function getStore(): Store {
  const url = process.env.DATABASE_URL?.trim();
  globalForStore.__winterStore ??= url ? new PostgresStore(url) : new JsonFileStore();
  return globalForStore.__winterStore;
}

export function newId(): string {
  return randomUUID();
}
