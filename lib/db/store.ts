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
 * tentent d'acheter le même booster avec le même solde, ou d'enchérir en même
 * temps sur la même vente, sont donc traitées l'une après l'autre — pas de
 * lecture-modification-écriture entrelacée, donc pas de duplication de flocons.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_MAX_GAMES_PER_PLAYER, SEASON } from '@/lib/domain/rules';
import type { Database } from './entities';

const DATA_FILE = process.env.LEAGUE_DATA_FILE
  ? process.env.LEAGUE_DATA_FILE
  : join(process.cwd(), '.data', 'league.json');

export const SCHEMA_VERSION = 1;

export function emptyDatabase(): Database {
  return {
    version: SCHEMA_VERSION,
    config: {
      maxGamesPerPlayer: DEFAULT_MAX_GAMES_PER_PLAYER,
      totalSubs: 0,
      shopOpen: true,
      marketOpen: true,
      seasonStartsAt: SEASON.startsAt,
      seasonEndsAt: SEASON.endsAt,
    },
    players: [],
    games: [],
    cards: [],
    collectibles: [],
    discoveries: [],
    openings: [],
    effects: [],
    boons: [],
    ledger: [],
    listings: [],
    bids: [],
    sales: [],
    events: [],
    subEvents: [],
    audit: [],
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

/** Complète une base chargée dont la forme est plus ancienne que le code. */
function migrate(db: Partial<Database>): Database {
  const base = emptyDatabase();
  return {
    ...base,
    ...db,
    version: SCHEMA_VERSION,
    config: { ...base.config, ...(db.config ?? {}) },
    players: db.players ?? [],
    games: db.games ?? [],
    cards: db.cards ?? [],
    collectibles: db.collectibles ?? [],
    discoveries: db.discoveries ?? [],
    openings: db.openings ?? [],
    effects: db.effects ?? [],
    boons: db.boons ?? [],
    ledger: db.ledger ?? [],
    listings: db.listings ?? [],
    bids: db.bids ?? [],
    sales: db.sales ?? [],
    events: db.events ?? [],
    subEvents: db.subEvents ?? [],
    audit: db.audit ?? [],
  };
}

// En développement, Next recharge les modules à chaque édition : sans ce cache
// global on repartirait d'une base vide à chaque sauvegarde de fichier.
const globalForStore = globalThis as unknown as { __winterStore?: Store };

export function getStore(): Store {
  globalForStore.__winterStore ??= new JsonFileStore();
  return globalForStore.__winterStore;
}

export function newId(): string {
  return randomUUID();
}
