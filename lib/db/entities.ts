/**
 * Forme des données persistées.
 *
 * Volontairement plate et sérialisable en JSON : l'adaptateur mémoire actuel et
 * un futur adaptateur Postgres/Supabase manipuleront exactement ces mêmes
 * enregistrements, si bien que le changement de base ne touchera pas au métier.
 */

import type { Echange } from '@/lib/domain/bataille';
import type { EvenementKind } from '@/lib/domain/rules';
import type { PackId, Placement, Rarity } from '@/lib/domain/types';

/**
 * Ce qu'un compte a le droit de faire.
 *
 * Trois échelons, et la frontière n'est pas arbitraire : un **modérateur** agit
 * sur le déroulement de la saison — enregistrer une game, créditer, ouvrir un
 * pack. Un **admin** agit sur ses règles : les taux de rareté, et l'attribution
 * des rôles eux-mêmes.
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
  /** Renseigné à la connexion Twitch. */
  twitchId: string | null;
  twitchLogin: string | null;
  avatarUrl: string | null;
  /**
   * Le pseudo Activision (Call of Duty), tel qu'il apparaît sur le tableau
   * de fin de game. Demandé à la première connexion : c'est lui que la
   * reconnaissance des captures compare aux noms lus, et un pseudo Twitch
   * ne ressemble pas toujours au pseudo en jeu.
   */
  activisionId: string | null;
  snowflakes: number;
  /**
   * Les subs que ce joueur a offerts à la chaîne, sur la saison.
   *
   * C'est ce qui lui vaut ses packs Perso : un tous les cinq. Saisi par la
   * modération, ou plus tard par les notifications Twitch — dans les deux cas
   * le pack est mis en file, jamais ouvert automatiquement.
   */
  subsOfferts: number;
  /**
   * Les créneaux de game gagnés par une carte « Game supplémentaire ». Ils
   * s'ajoutent à la limite de la saison, pour ce joueur seulement.
   */
  creneauxBonus: number;
  /**
   * La fin de son immunité, ou nul. Tant qu'elle court, un malus qui tombe
   * sur une de ses games est paré.
   */
  immuniseJusqua: string | null;
  joinedAt: string;
  active: boolean;
  role: PlayerRole;
  /**
   * Les sessions ouvertes avant cette date ne valent plus rien : la
   * déconnexion la pose, et révoque ainsi tous les jetons du joueur, sur tous
   * ses appareils — un cookie volé ne survit pas à un « Se déconnecter ».
   */
  sessionsDepuis: string | null;
}

/** Trace d'un effet de carte appliqué à une game, avec son delta exact. */
export interface AppliedEffect {
  id: string;
  cardId: string;
  /** L'ouverture de pack d'où vient la carte. */
  ouvertureId: string;
  /** Points ajoutés (positif) ou retirés (négatif). */
  points: number;
  at: string;
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
  /** Score recalculé côté serveur à chaque écriture. Jamais accepté du client. */
  score: number;
  note: string | null;
  playedAt: string;
  createdAt: string;
  /** Effets de cartes appliqués, dans l'ordre. */
  applied: AppliedEffect[];
}

/**
 * Un pack qui attend d'être ouvert.
 *
 * C'est la file de l'écran d'administration : ce que les subs, les paliers et
 * les fins de saison ont mis en attente, et que la streameuse ouvre à
 * l'antenne, un par un. Un pack dû n'a pas encore de carte — le tirage n'a
 * lieu qu'à l'ouverture.
 */
export interface PackDu {
  id: string;
  packId: PackId;
  /** Le joueur pour qui le pack s'ouvre. Nul pour un pack collectif. */
  joueurId: string | null;
  /** Pourquoi il est dû : « 5 subs offerts », « palier 50 », « 60 games ». */
  raison: string;
  creeA: string;
  /** Renseigné à l'ouverture. Un pack ouvert reste dans la file, comme trace. */
  ouvertureId: string | null;
}

/** Une ouverture de pack : le tirage, et sur qui il est tombé. */
export interface OuverturePack {
  id: string;
  packId: PackId;
  cardId: string;
  rarity: Rarity;
  /** Le joueur pour qui le pack a été ouvert, ou nul pour un pack collectif. */
  joueurId: string | null;
  /** Les joueurs sur qui la carte est tombée. */
  beneficiaires: string[];
  /** La chance appliquée au tirage, entre 0 et 1. Zéro pour un pack collectif. */
  chance: number;
  /** Qui a ouvert : le sujet de session de la modération. */
  ouvertPar: string;
  openedAt: string;
  /** Rejoue la même réponse si la requête est renvoyée (double clic, reprise réseau). */
  idempotencyKey: string;
}

/**
 * Une carte reçue par un joueur.
 *
 * Elle naît à l'ouverture d'un pack. Le plus souvent elle attend la game
 * suivante, où son effet est calculé, journalisé dans `game.applied`, et le
 * résultat écrit ici. Une carte qui relève une game déjà jouée se règle dès
 * que le joueur en a une sans carte ; des flocons, un créneau ou une immunité
 * se règlent dans l'instant.
 */
export interface CarteEnAttente {
  id: string;
  joueurId: string;
  cardId: string;
  ouvertureId: string;
  creeA: string;
  consommeeA: string | null;
  /** La game sur laquelle la carte s'est appliquée. */
  gameId: string | null;
  /** Ce que la carte a fait, en une phrase. */
  resultat: string | null;
  /**
   * Pour une carte à deux : l'identifiant partagé par les deux cartes de la
   * paire. La première game saisie attend la seconde ; la seconde résout les
   * deux. Nul pour une carte ordinaire.
   */
  paireId: string | null;
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
  seasonStartsAt: string;
  seasonEndsAt: string;
  /**
   * La génération des liens d'overlay OBS. Chaque lien porte la sienne ; en
   * changer révoque d'un coup tous les liens donnés jusque-là.
   */
  overlayGeneration: number;
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
  /** Packs mis en file par cette saisie. */
  packs: PackId[];
  recipients: number;
}

/**
 * Réglage d'un pack décidé par l'administration.
 *
 * Le catalogue reste la source de vérité par défaut ; ceci ne fait que le
 * recouvrir. Un pack sans réglage garde exactement la table de
 * `lib/domain/catalog.ts`, et retirer le réglage suffit à y revenir.
 */
export interface ReglagePack {
  packId: PackId;
  /** Table de raretés. Somme exacte : 100 000. */
  weights: Record<Rarity, number>;
  updatedAt: string;
}

/**
 * Un affrontement.
 *
 * Deux camps misent **la même somme**, tirent le même nombre de cartes manche
 * par manche, et celui dont les cartes totalisent la plus haute somme de
 * raretés remporte le pot — les deux mises réunies.
 *
 * Les cartes tirées ne sont que des cartes de comparaison : personne ne les
 * garde. Elles sont consignées pour que la partie soit rejouable à l'écran et
 * vérifiable dans le journal.
 */
export interface Bataille {
  id: string;
  /** Le format : au meilleur de 1, 3 ou 5 manches. */
  manches: number;
  /** La mise de chaque camp, en flocons. Le pot vaut le double. */
  mise: number;
  hoteId: string;
  /** Nul tant que personne n'a rejoint. `BOT` désigne l'adversaire virtuel. */
  adversaireId: string | null;
  statut: 'ATTENTE' | 'TERMINEE' | 'ANNULEE';
  /** Les cartes tirées par camp, dans l'ordre des manches. Vide tant qu'on attend. */
  /**
   * Les cartes des anciens duels, d'avant le duel de flocons. Vide pour
   * les nouveaux ; gardé pour relire l'historique.
   */
  tirages: { camp: string; cardIds: string[]; relances: number[]; score: number }[];
  /** Les lancers du duel de flocons, échange par échange, égalités comprises. */
  echanges: Echange[];
  vainqueurId: string | null;
  creeeA: string;
  resolueA: string | null;
}

/** L'identifiant réservé à l'adversaire virtuel. Aucun joueur ne peut le porter. */
export const CAMP_BOT = 'BOT';

/**
 * Un évènement déclenché par un palier de subs, avec sa fenêtre.
 *
 * Il est conservé après sa fin : c'est l'historique de ce que le chat a
 * déclenché, et la modération doit pouvoir le relire.
 */
export interface EvenementActif {
  id: string;
  kind: EvenementKind;
  label: string;
  description: string;
  startsAt: string;
  endsAt: string;
  /** Le total de subs qui l'a déclenché. */
  declencheA: number;
}

export interface Database {
  /** Incrémentée à chaque migration de forme. */
  version: number;
  config: LeagueConfig;
  players: Player[];
  games: Game[];
  packsDus: PackDu[];
  ouvertures: OuverturePack[];
  cartesEnAttente: CarteEnAttente[];
  ledger: LedgerEntry[];
  subEvents: SubEvent[];
  audit: AuditEntry[];
  reglagesPacks: ReglagePack[];
  batailles: Bataille[];
  evenements: EvenementActif[];
}
