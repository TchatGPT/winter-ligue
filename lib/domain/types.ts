/**
 * Types du domaine Winter Ligue.
 *
 * Ce fichier est neutre vis-à-vis du transport et du stockage : il décrit
 * uniquement les règles du jeu. Aucune fonction ici ne doit lire un cookie,
 * toucher au réseau ou faire confiance à une valeur venue du client.
 */

/** Six paliers, du plus banal au plus convoité. */
export type Rarity = 'C' | 'R' | 'UR' | 'L';

export const RARITIES: readonly Rarity[] = ['C', 'R', 'UR', 'L'];

/**
 * Les quatre packs.
 *
 *  - **perso** : pour le joueur qui a offert cinq subs. Ouvert pour lui.
 *  - **commu** : tous les cinquante subs. La carte tombe sur tout le monde.
 *  - **folie** : tous les deux cents subs. Plus fort, toujours pour tout le monde.
 *  - **finisseur** : pour le joueur qui a joué toutes ses games.
 */
export type PackId = 'perso' | 'commu' | 'folie' | 'finisseur';

export const PACK_IDS: readonly PackId[] = ['perso', 'commu', 'folie', 'finisseur'];

/**
 * Sur qui une carte de pack tombe, quand elle ne tombe pas sur le joueur pour
 * qui le pack est ouvert.
 *
 *  - `TOUS` : chaque joueur en lice.
 *  - `HASARD` : un joueur tiré au sort par le serveur.
 *  - `DEUX` : deux joueurs tirés au sort, que la carte met face à face.
 *  - `TETE` : celui qui mène le classement à cet instant.
 *  - `QUEUE` : les derniers du classement — le coup de pouce.
 *
 * Un pack Perso ou Finisseur n'a pas de cible : sa carte va au joueur désigné.
 * La streameuse n'est jamais tirée : elle ne joue pas.
 */
export type CibleCarte = 'TOUS' | 'HASARD' | 'DEUX' | 'TETE' | 'QUEUE';

/**
 * Ce qu'une carte fait.
 *
 * Les actions reprennent celles des roues de la Summer Ligue — le
 * multiplicateur, le clone de kills, le joker, la game supplémentaire,
 * l'immunité — mais ramenées à l'échelle de la Winter : une carte pèse ce que
 * sa rareté autorise (`IMPACT_PAR_RARETE`), jamais davantage.
 *
 * Trois moments, selon le genre (`momentDe`) :
 *
 *  - **la prochaine game** : la carte attend la game suivante du joueur, s'y
 *    applique, puis disparaît ;
 *  - **une game déjà jouée** : la carte relève une game du joueur, dès qu'il en
 *    a une sans carte ;
 *  - **tout de suite** : des flocons, un créneau de game, une immunité.
 *
 * Trois principes gouvernent cette liste :
 *
 *  1. **Tout est borné.** Chaque effet porte son plafond, y compris les
 *     multiplicateurs, et ce plafond tient dans le budget de la rareté.
 *  2. **Un malus retire, il ne transfère jamais** — sauf la carte à deux, qui
 *     oppose deux joueurs tirés au sort et reste bornée de chaque côté.
 *  3. **La game d'autrui est intouchable** : un malus ne tombe que sur une
 *     game de sa cible, et ne supprime ni ne copie rien.
 */
export type CardEffect =
  /* ------------------------- Sur la prochaine game ------------------------ */
  /** « +N pts bonus ». */
  | { kind: 'bonus_points'; value: number }
  /** « −N pts à un joueur ». */
  | { kind: 'malus_points'; value: number }
  /** « Multiplicateur game » : le score entier (kills + top) multiplié, plafonné en points. */
  | { kind: 'multiplicateur_game'; value: number; cap: number }
  /** « Une game ÷ N » : le score entier divisé, la perte plafonnée en points. */
  | { kind: 'diviseur_game'; value: number; cap: number }
  /** « Clone kill du meilleur » : les kills du meilleur tueur de la partie, plafonné. */
  | { kind: 'clone_kills'; cap: number }
  /** « Joker » : la game vaut au moins N points. */
  | { kind: 'plancher'; value: number }
  /** « +N pts à partir du Top X » : seulement si la game finit dans le Top. */
  | { kind: 'bonus_top'; top: 1 | 2 | 3; value: number }
  /** « +N pts petites games » : seulement sous un nombre de kills. */
  | { kind: 'petite_game'; moinsDe: number; value: number }
  /** Les flocons de la game sont doublés. Aucune incidence au classement. */
  | { kind: 'flocons_doubles' }
  /**
   * La carte à deux : elle attend la prochaine game de **chacun** des deux
   * joueurs tirés au sort, et se règle quand la seconde est saisie. Ils
   * échangent leurs kills, ou leur score entier, borné de chaque côté.
   */
  | { kind: 'echange'; sur: 'kills' | 'score'; cap: number }
  /* ------------------------ Sur une game déjà jouée ----------------------- */
  /** « Pire game ramenée à la moyenne », plafonné. */
  | { kind: 'releve_pire'; cap: number }
  /** « Pire game ×2 », « Meilleure game ×1,5 » : une game jouée multipliée, plafonné. */
  | { kind: 'multiplie_jouee'; cible: 'pire' | 'meilleure'; value: number; cap: number }
  /* ------------------------------ Tout de suite --------------------------- */
  /** Des flocons, dans l'instant. Aucune incidence au classement. */
  | { kind: 'snowflakes'; value: number }
  /** « Game supplémentaire » : un créneau de game de plus, hors limite. */
  | { kind: 'game_supplementaire' }
  /** « Immunité » : pendant N heures, aucun malus ne touche ses games. */
  | { kind: 'immunite'; heures: number };

/** Quand une carte se joue. Voir {@link CardEffect}. */
export type MomentCarte = 'PROCHAINE' | 'JOUEE' | 'INSTANT';

export interface CardDefinition {
  id: string;
  /** Le nom de la carte : un mot de l'hiver. */
  name: string;
  /**
   * L'intitulé de l'action, tel qu'on le disait sur les roues de la Summer
   * Ligue : « Multiplicateur game », « Joker », « +8 pts bonus ». Affiché sous
   * le nom.
   */
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
   * monde ne change rien au classement. Ni `QUEUE` : on n'enfonce pas les
   * derniers.
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
