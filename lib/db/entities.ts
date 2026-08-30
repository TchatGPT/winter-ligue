/**
 * Forme des données persistées.
 *
 * Volontairement plate et sérialisable en JSON : l'adaptateur mémoire actuel et
 * un futur adaptateur Postgres/Supabase manipuleront exactement ces mêmes
 * enregistrements, si bien que le changement de base ne touchera pas au métier.
 */

import type { Bid, BoonKind, Listing, Placement, Rarity, Sale } from '@/lib/domain/types';

/**
 * Ce qu'un compte a le droit de faire.
 *
 * Trois échelons, et la frontière n'est pas arbitraire : un **modérateur** agit
 * sur le déroulement de la saison — enregistrer une game, créditer, ouvrir ou
 * fermer la boutique. Un **admin** agit sur ses règles : les prix, les taux de
 * rareté, et l'attribution des rôles eux-mêmes.
 *
 * Autrement dit, un modérateur ne peut pas se promouvoir, ni rendre les
 * légendaires dix fois plus fréquentes. C'est ce qui rend le rôle distribuable
 * sans arrière-pensée.
 */
export type PlayerRole = 'joueur' | 'moderateur' | 'admin';

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
  role: PlayerRole;
}

/** Trace d'un effet de carte appliqué à une game, avec son delta exact. */
export interface AppliedEffect {
  /** Identifiant unique, pour pouvoir annuler précisément cet effet. */
  id: string;
  cardId: string;
  /** Qui a joué la carte — le propriétaire de la game, ou un adversaire. */
  byPlayerId: string;
  /** Points ajoutés (positif) ou retirés (négatif). */
  points: number;
  at: string;
  /** true si un Second Souffle ou un Contre-Courant l'a déjà annulé. */
  undone: boolean;
}

export interface Game {
  id: string;
  playerId: string;
  kills: number;
  placement: Placement;
  /**
   * Somme des effets de cartes appliqués. Recalculée à partir de `applied` :
   * c'est un cache, jamais une source de vérité.
   */
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
  /**
   * Effets de cartes appliqués, dans l'ordre. C'est ce journal qui rend
   * Second Souffle et Contre-Courant possibles : on sait exactement combien
   * chaque carte a donné ou retiré, donc on sait quoi rendre.
   */
  applied: AppliedEffect[];
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

/** Première obtention d'une carte : définitive, même si la carte est ensuite jouée ou vendue. */
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

/** Effet temporaire posé sur un joueur. */
export interface PlayerEffect {
  id: string;
  playerId: string;
  /** BOUCLIER : immunise contre les malus. SILENCE : interdit de jouer une carte. */
  kind: 'BOUCLIER' | 'SILENCE';
  sourceCardId: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Faveur durable : un effet qui se consomme sur plusieurs actions plutôt que
 * dans l'instant. Trois usages restants de « flocons doublés », par exemple.
 */
export interface PlayerBoon {
  id: string;
  playerId: string;
  kind: BoonKind;
  /** Utilisations restantes. La faveur disparaît à zéro. */
  remaining: number;
  /** Paramètre libre : taux de remise, rareté garantie… */
  value: string | null;
  sourceCardId: string;
  createdAt: string;
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

/**
 * Carte de collection : Joueur ou Moment.
 *
 * Contrairement aux cartes à effet, figées dans le catalogue, celles-ci sont
 * des données : un participant s'inscrit, sa carte existe. Elles n'ont aucun
 * effet en jeu, donc aucun risque d'équilibrage — c'est ce qui permet d'avoir
 * un pool profond sans multiplier les combos à surveiller.
 *
 * La rareté est fixée à la création et ne bouge plus. Une carte échangeable
 * dont la rareté changerait en cours de saison ferait bouger son foil, son
 * taux de tirage et son prix sous les pieds de ceux qui l'ont achetée.
 */
export interface Collectible {
  id: string;
  kind: 'JOUEUR' | 'MOMENT';
  name: string;
  subtitle: string;
  description: string;
  rarity: Rarity;
  glyph: string;
  art: string | null;
  /** Pour une carte Joueur : le participant représenté. */
  playerId: string | null;
  createdAt: string;
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

/**
 * Réglages d'un booster décidés par l'administration.
 *
 * Le catalogue reste la source de vérité par défaut ; ceci ne fait que le
 * recouvrir, champ par champ. Un booster sans réglage garde exactement les
 * valeurs de `lib/domain/catalog.ts`, et remettre à zéro un réglage suffit à
 * revenir au catalogue — on ne perd jamais l'original.
 */
export interface BoosterSetting {
  boosterId: string;
  /** Prix en flocons. Absent : celui du catalogue. */
  price?: number;
  /** Table de raretés. Absente : celle du catalogue. Somme exacte : 100 000. */
  weights?: Record<Rarity, number>;
  updatedAt: string;
}

export interface Database {
  /** Incrémentée à chaque migration de forme. */
  version: number;
  config: LeagueConfig;
  players: Player[];
  games: Game[];
  cards: CardInstance[];
  collectibles: Collectible[];
  discoveries: Discovery[];
  openings: BoosterOpening[];
  effects: PlayerEffect[];
  boons: PlayerBoon[];
  ledger: LedgerEntry[];
  listings: Listing[];
  bids: Bid[];
  sales: Sale[];
  events: LeagueEvent[];
  subEvents: SubEvent[];
  audit: AuditEntry[];
  boosterSettings: BoosterSetting[];
}
