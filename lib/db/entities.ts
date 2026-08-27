/**
 * Forme des données persistées.
 *
 * Volontairement plate et sérialisable en JSON : l'adaptateur mémoire actuel et
 * un futur adaptateur Postgres/Supabase manipuleront exactement ces mêmes
 * enregistrements, si bien que le changement de base ne touchera pas au métier.
 */

import type { Bid, Listing, Placement, Sale } from '@/lib/domain/types';

export interface Player {
  id: string;
  /** Identifiant lisible utilisé dans les URLs. */
  slug: string;
  pseudo: string;
  /** Renseigné le jour où l'authentification Twitch sera branchée. */
  twitchId: string | null;
  twitchLogin: string | null;
  avatarUrl: string | null;
  snowflakes: number;
  joinedAt: string;
  active: boolean;
}

export interface Game {
  id: string;
  playerId: string;
  kills: number;
  placement: Placement;
  /** Multiplicateur cumulé des cartes jouées sur cette game. */
  multiplier: number;
  bonusPoints: number;
  /** Une game passée reste visible mais ne compte pas. */
  skipped: boolean;
  /** Une game gelée est insensible aux malus adverses. */
  frozen: boolean;
  /** Score recalculé côté serveur à chaque écriture. Jamais accepté du client. */
  score: number;
  note: string | null;
  playedAt: string;
  createdAt: string;
  /** Cartes ayant modifié cette game, pour l'affichage et l'audit. */
  appliedCardIds: string[];
}

/** Une copie de carte possédée par un joueur. */
export interface CardInstance {
  id: string;
  playerId: string;
  cardId: string;
  obtainedAt: string;
  source: 'BOOSTER' | 'MARCHE' | 'ADMIN';
  /** Consommée en étant jouée : conservée pour l'historique. */
  consumed: boolean;
  consumedAt: string | null;
  /** Renseignés à la consommation, pour l'historique et le délai anti-harcèlement. */
  consumedOnGameId: string | null;
  consumedOnPlayerId: string | null;
  /** Verrouillée tant qu'elle est en vente : injouable et non revendable. */
  listingId: string | null;
  /** Clé d'idempotence de l'action qui a consommé la carte. */
  consumeKey: string | null;
}

/** Première obtention d'une carte : définitive, elle porte les bonus de famille. */
export interface Discovery {
  playerId: string;
  cardId: string;
  firstObtainedAt: string;
}

export interface BoosterOpening {
  id: string;
  playerId: string;
  boosterId: string;
  pricePaid: number;
  cardIds: string[];
  openedAt: string;
  /** Rejoue la même réponse si la requête est renvoyée (double clic, reprise réseau). */
  idempotencyKey: string;
}

/** Effet temporaire posé sur un joueur (bouclier, immunité…). */
export interface PlayerEffect {
  id: string;
  playerId: string;
  kind: 'BOUCLIER';
  sourceCardId: string;
  createdAt: string;
  expiresAt: string;
}

export interface LedgerEntry {
  id: string;
  playerId: string;
  /** Positif = crédit, négatif = débit. Toujours un entier. */
  delta: number;
  balanceAfter: number;
  reason: string;
  refId: string | null;
  createdAt: string;
}

export interface LeagueEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  published: boolean;
}

/** Trace inaltérable des actions sensibles, pour pouvoir remonter un abus. */
export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  targetId: string | null;
  detail: string;
  at: string;
}

export interface LeagueConfig {
  maxGamesPerPlayer: number;
  /** Subs cumulés de la saison. Seule la modération l'incrémente. */
  totalSubs: number;
  shopOpen: boolean;
  marketOpen: boolean;
  seasonStartsAt: string;
  seasonEndsAt: string;
}

/** Un versement déclenché par les subs Twitch, conservé pour l'historique. */
export interface SubEvent {
  id: string;
  at: string;
  /** Subs ajoutés lors de cette saisie. */
  delta: number;
  totalAfter: number;
  /** Libellés des paliers franchis. */
  milestones: string[];
  /** Flocons versés à chaque joueur actif. */
  snowflakesEach: number;
  /** Boosters offerts à chaque joueur actif. */
  boostersEach: string[];
  recipients: number;
}

export interface Database {
  /** Incrémentée à chaque migration de forme. */
  version: number;
  config: LeagueConfig;
  players: Player[];
  games: Game[];
  cards: CardInstance[];
  discoveries: Discovery[];
  openings: BoosterOpening[];
  effects: PlayerEffect[];
  ledger: LedgerEntry[];
  listings: Listing[];
  bids: Bid[];
  sales: Sale[];
  events: LeagueEvent[];
  subEvents: SubEvent[];
  audit: AuditEntry[];
}
