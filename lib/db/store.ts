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
import { synchroniseCatalogue } from './lecture';
import { chargeBase, empreintes, enregistreBase, lisJournal, SCHEMA_SQL, TABLES } from './tables';
import { dirname, join } from 'node:path';
import { DEFAULT_MAX_GAMES_PER_PLAYER, ECONOMY, SEASON } from '@/lib/domain/rules';
import type { AuditEntry, Database, PlayerRole } from './entities';

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
      overlayGeneration: 1,
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

/** Ce qu'il faut savoir d'un joueur pour accepter sa session. */
export interface EtatSession {
  role: PlayerRole;
  actif: boolean;
  sessionsDepuis: string | null;
}

/**
 * Ce que lisent les overlays du stream : le compteur de subs, les boosters
 * ouverts et les duels lancés depuis une date. Quelques lignes, par index.
 */
export interface FluxOverlay {
  maintenant: string;
  generation: number;
  totalSubs: number;
  ouvertures: {
    id: string;
    packId: string;
    cardId: string;
    openedAt: string;
    /** Pour qui le booster s'ouvre, s'il s'ouvre pour quelqu'un. */
    joueur: string | null;
    /** Sur qui la carte est tombée : six pseudos au plus. */
    beneficiaires: string[];
    nbBeneficiaires: number;
  }[];
  duels: { id: string; hote: string; mise: number; creeA: string }[];
  evenements: { label: string; endsAt: string }[];
}

/** Ce qu'un overlay remonte au plus par lecture : il les joue l'un après l'autre. */
const OVERLAY_LOT = 5;

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
  /**
   * Le rôle, l'état et la date de révocation d'un joueur — rien d'autre.
   *
   * Appelée à chaque requête qui porte une session : c'est une seule ligne,
   * lue par sa clé, et non la base entière que charge `read()`.
   */
  etatSession(joueurId: string): Promise<EtatSession | null>;
  /**
   * Le flux des overlays depuis `depuis` (date ISO). Interrogé toutes les deux
   * secondes pendant un live : jamais la base entière.
   */
  fluxOverlay(depuis: string): Promise<FluxOverlay>;
  /** Les dernières lignes du journal, la plus récente en tête. */
  journal(combien: number): Promise<AuditEntry[]>;
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

  async etatSession(joueurId: string): Promise<EtatSession | null> {
    const db = await this.load();
    const p = db.players.find((x) => x.id === joueurId);
    return p ? { role: p.role, actif: p.active, sessionsDepuis: p.sessionsDepuis ?? null } : null;
  }

  async journal(combien: number): Promise<AuditEntry[]> {
    const db = await this.load();
    return db.audit.slice(-Math.max(1, combien)).reverse();
  }

  async fluxOverlay(depuis: string): Promise<FluxOverlay> {
    const db = await this.load();
    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
    const maintenant = new Date().toISOString();
    return {
      maintenant,
      generation: db.config.overlayGeneration ?? 1,
      totalSubs: db.config.totalSubs,
      ouvertures: db.ouvertures
        .filter((o) => o.openedAt > depuis)
        .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
        .slice(0, OVERLAY_LOT)
        .map((o) => ({
          id: o.id,
          packId: o.packId,
          cardId: o.cardId,
          openedAt: o.openedAt,
          joueur: o.joueurId ? pseudo(o.joueurId) : null,
          beneficiaires: o.beneficiaires.slice(0, 6).map(pseudo),
          nbBeneficiaires: o.beneficiaires.length,
        })),
      duels: db.batailles
        .filter((b) => b.creeeA > depuis && b.statut === 'ATTENTE' && !b.adversaireId)
        .sort((a, b) => a.creeeA.localeCompare(b.creeeA))
        .slice(0, OVERLAY_LOT)
        .map((b) => ({ id: b.id, hote: pseudo(b.hoteId), mise: b.mise, creeA: b.creeeA })),
      evenements: db.evenements
        .filter((e) => e.endsAt > maintenant)
        .slice(0, 2)
        .map((e) => ({ label: e.label, endsAt: e.endsAt })),
    };
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
 * La base Postgres (Supabase) : une table par type de donnée.
 *
 * Le jeu travaille sur l'objet `Database` en mémoire, exactement comme avec
 * le fichier ; `lib/db/tables.ts` fait le pont. Une lecture charge toutes les
 * tables en une requête. Une transaction verrouille la ligne `saison`, charge,
 * laisse le jeu muter l'objet, puis n'écrit que les lignes qui ont changé.
 *
 * Le verrou (`SELECT … FOR UPDATE` sur `saison`) sérialise les écritures, même
 * entre deux serveurs Vercel : c'est ce qui garde vraie la règle du projet sur
 * les flocons. Si le jeu lève, la transaction est annulée et rien n'est écrit.
 *
 * Toutes les tables ont la sécurité par ligne activée, sans politique, et
 * les rôles de l'API publique de Supabase n'y ont aucun droit : seule la
 * connexion serveur les lit.
 *
 * Au premier démarrage, si les tables sont vides et que l'ancienne ligne
 * unique `league_state` existe, son contenu y est versé ; elle est gardée
 * telle quelle, comme sauvegarde.
 */
/**
 * Le pooler partagé de Supabase écoute sur deux ports : 5432 en mode session,
 * 6543 en mode transaction. Une adresse copiée en 5432 est ramenée sur 6543 :
 * c'est le seul mode qui tienne sur Vercel (voir la classe ci-dessous). Une
 * autre base, ou une connexion directe, est laissée telle quelle.
 */
function versModeTransaction(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.pooler.supabase.com') && u.port === '5432') {
      u.port = '6543';
      return u.toString();
    }
  } catch {
    // Adresse illisible : le client dira pourquoi.
  }
  return url;
}

/** Le document que renvoie la requête des overlays, tel que Postgres le rend. */
interface DocOverlay {
  maintenant: string;
  saison: { generation: number; subs: number } | null;
  ouvertures: {
    id: string;
    booster_id: string;
    carte_id: string;
    le: string;
    joueur: string | null;
    beneficiaires: string[];
    nb: number;
  }[];
  duels: { id: string; mise: number; le: string; hote: string }[];
  evenements: { label: string; fin: string }[];
}

/** La base est-elle sur cette machine ? Seule une base locale se passe de TLS. */
function estLocale(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Vrai quand `DATABASE_URL` désigne une base distante — celle de production,
 * en pratique. La connexion de développement s'y refuse : un serveur local
 * lancé par erreur avec la vraie adresse ne doit pas ouvrir la ligue à qui
 * joint ce poste.
 */
export function baseDistante(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url) && !estLocale(url!);
}

class PostgresStore implements Store {
  private readonly sql: postgres.Sql;
  private pret: Promise<void> | null = null;
  /** La file : une seule opération à la fois sur la connexion. */
  private file: Promise<unknown> = Promise.resolve();

  constructor(url: string) {
    this.sql = postgres(versModeTransaction(url), {
      // Le pooler de Supabase en mode transaction (port 6543) : il accepte des
      // centaines de clients, là où le mode session plafonne à 15 — et chaque
      // serveur Vercel en garde un ouvert, même en veille. Au-delà de 15, les
      // pages plantaient.
      //
      // Ce mode se bloque en revanche si deux requêtes partent en même temps
      // sur la même connexion. D'où la file ci-dessous : les lectures
      // parallèles d'une page s'y enchaînent une à une. Mesuré : six clients,
      // soixante requêtes simultanées dont neuf transactions, toutes passées
      // en moins d'une seconde.
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      // Chiffré. Sans cette ligne, requêtes et réponses passaient en clair
      // entre Vercel et Supabase : l'adresse n'impose pas `sslmode`. Le
      // certificat du pooler est signé par l'autorité de Supabase, que Node
      // ne connaît pas : l'épingler est l'étape suivante (docs/SECURITE.md).
      ssl: estLocale(url) ? false : 'require',
      // Pas de bavardage « relation already exists » à chaque démarrage.
      onnotice: () => {},
    });
  }

  /** Exécute `f` quand la connexion est libre ; un échec ne bloque pas la suite. */
  private enFile<T>(f: () => Promise<T>): Promise<T> {
    const tour = this.file.then(f, f);
    this.file = tour.then(
      () => undefined,
      () => undefined,
    );
    return tour;
  }

  /** Crée les tables et verse l'ancienne ligne unique, une fois par instance. */
  private prepare(): Promise<void> {
    this.pret ??= (async () => {
      await this.sql.begin(async (tx) => {
        // Deux instances qui démarrent ensemble ne créent pas les tables en même temps.
        await tx`select pg_advisory_xact_lock(724241)`;
        await tx.unsafe(SCHEMA_SQL);

        // La sécurité : RLS partout, et aucun droit pour l'API publique. Avant
        // tout import : une fois des lignes écrites, les clés étrangères
        // différées interdisent de modifier les tables dans la transaction.
        await tx.unsafe(`
          do $$
          declare t text;
          begin
            foreach t in array array[${TABLES.map((t) => `'${t}'`).join(', ')}, 'league_state'] loop
              if to_regclass('public.' || t) is not null then
                execute format('alter table public.%I enable row level security', t);
                if exists (select 1 from pg_roles where rolname = 'anon') then
                  execute format('revoke all on table public.%I from anon, authenticated', t);
                end if;
              end if;
            end loop;
          end $$`);

        const [saison] = await tx`select 1 from saison where id = 1`;
        if (!saison) {
          const [ancienne] = await tx<{ data: Partial<Database> }[]>`
            select data from league_state where id = 1 and to_regclass('public.league_state') is not null
          `.catch(() => [] as { data: Partial<Database> }[]);
          const depart = migrate(ancienne?.data ?? emptyDatabase());
          await enregistreBase(tx, depart, new Map());
        }
      });

      // Le catalogue n'est qu'une copie du code : son échec ne doit jamais
      // empêcher le site de servir.
      await synchroniseCatalogue(this.sql)
        .then(() =>
          this.sql.unsafe(`
            do $$ begin
              alter table public.cartes enable row level security;
              alter table public.boosters enable row level security;
              if exists (select 1 from pg_roles where rolname = 'anon') then
                revoke all on table public.cartes, public.boosters from anon, authenticated;
              end if;
            end $$`),
        )
        .catch((error) => console.error('[base] catalogue', error));
    })().catch((error) => {
      // On retentera à l'appel suivant plutôt que de garder l'échec en cache.
      this.pret = null;
      throw error;
    });
    return this.pret;
  }

  async read<T>(fn: (db: Readonly<Database>) => T): Promise<T> {
    const db = await this.enFile(async () => {
      await this.prepare();
      return chargeBase(this.sql);
    });
    return fn(migrate(db));
  }

  async transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    // Toute la transaction tient son tour dans la file : `fn` ne relit jamais
    // la base de l'intérieur (elle reçoit l'objet), donc aucun risque
    // d'attendre son propre tour.
    return this.enFile(async () => {
      await this.prepare();
      const resultat = await this.sql.begin(async (tx) => {
        await tx`select 1 from saison where id = 1 for update`;
        const db = migrate(await chargeBase(tx));
        const avant = empreintes(db);
        const valeur = await fn(db);
        await enregistreBase(tx, db, avant);
        return { valeur };
      });
      return resultat.valeur;
    });
  }

  async journal(combien: number): Promise<AuditEntry[]> {
    return this.enFile(async () => {
      await this.prepare();
      return lisJournal(this.sql, combien);
    });
  }

  async fluxOverlay(depuis: string): Promise<FluxOverlay> {
    return this.enFile(async () => {
      await this.prepare();
      const [ligne] = await this.sql<{ doc: DocOverlay }[]>`
        select json_build_object(
          'maintenant', now(),
          'saison', (select json_build_object('generation', overlay_generation, 'subs', total_subs)
                       from saison where id = 1),
          'ouvertures', coalesce((
            select json_agg(x order by x.le) from (
              select o.id, o.booster_id, o.carte_id, o.ouvert_le as le,
                     (select j.pseudo from joueurs j where j.id = o.joueur_id) as joueur,
                     coalesce((select json_agg(b.pseudo) from (
                        select j.pseudo from joueurs j
                         where j.id in (select jsonb_array_elements_text(o.beneficiaires))
                         limit 6) b), '[]'::json) as beneficiaires,
                     jsonb_array_length(o.beneficiaires) as nb
                from ouvertures o
               where o.ouvert_le > ${depuis}::timestamptz
               order by o.ouvert_le
               limit ${OVERLAY_LOT}) x), '[]'::json),
          'duels', coalesce((
            select json_agg(x order by x.le) from (
              select d.id, d.mise, d.cree_le as le, j.pseudo as hote
                from duels d join joueurs j on j.id = d.hote_id
               where d.cree_le > ${depuis}::timestamptz and d.statut = 'ATTENTE' and d.adversaire_id is null
               order by d.cree_le
               limit ${OVERLAY_LOT}) x), '[]'::json),
          'evenements', coalesce((
            select json_agg(x) from (
              select nom as label, fin from evenements where fin > now() order by fin desc limit 2) x), '[]'::json)
        ) as doc`;
      const doc = ligne.doc;
      const iso = (v: string) => new Date(v).toISOString();
      return {
        maintenant: iso(doc.maintenant),
        generation: doc.saison?.generation ?? 1,
        totalSubs: doc.saison?.subs ?? 0,
        ouvertures: doc.ouvertures.map((o) => ({
          id: o.id,
          packId: o.booster_id,
          cardId: o.carte_id,
          openedAt: iso(o.le),
          joueur: o.joueur,
          beneficiaires: o.beneficiaires,
          nbBeneficiaires: o.nb,
        })),
        duels: doc.duels.map((d) => ({ id: d.id, hote: d.hote, mise: d.mise, creeA: iso(d.le) })),
        evenements: doc.evenements.map((e) => ({ label: e.label, endsAt: iso(e.fin) })),
      };
    });
  }

  async etatSession(joueurId: string): Promise<EtatSession | null> {
    return this.enFile(async () => {
      await this.prepare();
      const [ligne] = await this.sql<{ role: PlayerRole; actif: boolean; sessions_depuis: Date | string | null }[]>`
        select role, actif, sessions_depuis from joueurs where id = ${joueurId}`;
      if (!ligne) return null;
      return {
        role: ligne.role,
        actif: ligne.actif,
        sessionsDepuis: ligne.sessions_depuis ? new Date(ligne.sessions_depuis).toISOString() : null,
      };
    });
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
      creneauxBonus: p.creneauxBonus ?? 0,
      immuniseJusqua: p.immuniseJusqua ?? null,
      activisionId: p.activisionId ?? null,
      sessionsDepuis: p.sessionsDepuis ?? null,
      roleManuel: p.roleManuel ?? false,
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
      return { ...bataille, manches: bataille.manches ?? 1, echanges: bataille.echanges ?? [] };
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
