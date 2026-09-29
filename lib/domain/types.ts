/**
 * Types du domaine Winter Ligue.
 *
 * Ce fichier est neutre vis-à-vis du transport et du stockage : il décrit
 * uniquement les règles du jeu. Aucune fonction ici ne doit lire un cookie,
 * toucher au réseau ou faire confiance à une valeur venue du client.
 */

/** Six paliers, du plus banal au plus convoité. */
export type Rarity = 'C' | 'PC' | 'R' | 'SR' | 'UR' | 'L';

export const RARITIES: readonly Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

/**
 * Les quatre packs.
 *
 *  - **perso** : pour le joueur qui a offert cinq subs. Ouvert pour lui.
 *  - **commu** : tous les cinquante subs. La carte tombe sur tout le monde.
 *  - **folie** : tous les cinq cents subs. Plus fort, toujours pour tout le monde.
 *  - **finisseur** : pour le joueur qui a joué toutes ses games.
 */
export type PackId = 'perso' | 'commu' | 'folie' | 'finisseur';

export const PACK_IDS: readonly PackId[] = ['perso', 'commu', 'folie', 'finisseur'];

/**
 * Sur qui une carte de pack tombe, quand elle ne tombe pas sur le joueur pour
 * qui le pack est ouvert.
 *
 *  - `TOUS` : chaque joueur actif.
 *  - `HASARD` : un joueur actif tiré au sort par le serveur.
 *  - `DEUX` : deux joueurs actifs tirés au sort, que la carte met face à face.
 *  - `TETE` : celui qui mène le classement à cet instant.
 *
 * Un pack Perso ou Finisseur n'a pas de cible : sa carte va au joueur désigné.
 * Un pack Commu tombe sur un ou deux joueurs au hasard ; un pack Folie porte
 * la cible de sa carte, souvent toute la ligue.
 */
export type CibleCarte = 'TOUS' | 'HASARD' | 'DEUX' | 'TETE';

/**
 * Ce qu'une carte fait à la **prochaine game** du joueur qui la reçoit.
 *
 * Tout se résout au moment où la game est saisie, puis la carte est consommée.
 * Il n'y a ni carte en main, ni collection, ni marché : une carte est un effet
 * en attente, rien de plus.
 *
 * Deux principes gouvernent cette liste :
 *
 *  1. **Tout est borné.** Une game moyenne vaut ~25 points et une saison ~1 000 :
 *     une carte qui en donnerait 100 volerait un dixième de saison en un tirage.
 *     Chaque effet porte donc son plafond, y compris les multiplicateurs.
 *  2. **Un malus retire, il ne transfère jamais.** Aucun effet ne prend des
 *     points à quelqu'un pour les donner à un autre.
 */
export type CardEffect =
  /** +N points sur la prochaine game. */
  | { kind: 'bonus_points'; value: number }
  /** Les kills de la prochaine game multipliés, plafonné en points. */
  | { kind: 'kill_multiplier'; value: number; cap: number }
  /** +N par kill sur la prochaine game, plafonné. */
  | { kind: 'points_per_kill'; perKill: number; cap: number }
  /** Les points de classement de la prochaine game comptent deux fois. */
  | { kind: 'double_placement' }
  /** La prochaine game vaut au moins N points. */
  | { kind: 'plancher'; value: number }
  /** Des flocons, tout de suite. Aucune incidence au classement. */
  | { kind: 'snowflakes'; value: number }
  /** Les flocons de la prochaine game sont doublés. */
  | { kind: 'flocons_doubles' }
  /** −N points sur la prochaine game. */
  | { kind: 'malus_points'; value: number }
  /*
   * Les cartes à deux. Elles attendent la prochaine game de **chacun** des deux
   * joueurs tirés au sort, et se résolvent quand la seconde est saisie.
   */
  /** Les deux joueurs échangent les kills de leur prochaine game, borné. */
  | { kind: 'echange_kills'; cap: number }
  /** Celui des deux dont la prochaine game vaut le plus gagne, l'autre perd. */
  | { kind: 'duel'; gain: number; perte: number };

export interface CardDefinition {
  id: string;
  name: string;
  /** Sous-titre court affiché sous le nom, comme sur une vraie carte. */
  subtitle: string;
  rarity: Rarity;
  /** Texte affiché au joueur. */
  description: string;
  /** Icône Unicode utilisée dans l'UI (pas de dépendance à une police d'icônes). */
  glyph: string;
  effect: CardEffect;
  /** Un bonus aide celui qui la reçoit, un malus lui retire. */
  nature: 'bonus' | 'malus';
  /** Indice de puissance sur 100, affiché sur la vignette. Réglé à la main. */
  power: number;
  /** Les packs dans lesquels cette carte peut sortir. */
  packs: readonly PackId[];
  /**
   * Sur qui la carte tombe quand elle sort d'un pack collectif.
   *
   * Sans objet pour un pack Perso ou Finisseur, dont la carte va toujours au
   * joueur désigné. Un malus n'est jamais `TOUS` : retirer dix points à tout le
   * monde ne change rien au classement.
   */
  cible: CibleCarte;
}

export type Placement = 1 | 2 | 3 | null;

export interface PackDefinition {
  id: PackId;
  name: string;
  tagline: string;
  /** Ce qui le déclenche, en une phrase, pour les règles et l'écran d'admin. */
  declencheur: string;
  glyph: string;
  /** Deux couleurs pour le dégradé du sachet. */
  gradient: [string, string];
  /** `JOUEUR` : ouvert pour quelqu'un. `TOUS` : la carte porte sa propre cible. */
  portee: 'JOUEUR' | 'TOUS';
  /** Pour qui, en deux mots, tel que l'écran l'affiche. */
  pourQui: string;
  /**
   * Poids de tirage par rareté, exprimés sur 100 000 pour rester exacts.
   * Leur somme doit valoir exactement 100 000 — c'est vérifié par les tests.
   */
  weights: Record<Rarity, number>;
}
