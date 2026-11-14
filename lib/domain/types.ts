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
 *  - **perso** : pour le joueur qui a payé un sub T3, pris ou offert, ou offert cinq subs. Ouvert pour lui.
 *  - **commu** : tous les trente-cinq subs. La carte tombe sur tout le monde.
 *  - **folie** : tous les cent cinquante subs. Plus fort, toujours pour tout le monde.
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
export type CibleCarte =
  | 'TOUS'
  | 'HASARD'
  | 'DEUX'
  | 'TETE'
  | 'QUEUE'
  /* Les roues de la Summer (03/11/2026) : trois joueurs tirés, six dans le
     barillet de la roulette, les dix premiers, les cinq derniers. */
  | 'TROIS'
  | 'SIX'
  | 'DIX_PREMIERS'
  | 'CINQ_DERNIERS';

/**
 * Une action des roues de la Summer Ligue, reprise telle quelle dans le
 * Commu, le Folie et le Finisseur (décidé par l'organisation le 03/11/2026,
 * en levant pour elles les règles des malus). Elle se règle tout de suite,
 * une fois la carte révélée, et une seule fois pour tous les joueurs tirés.
 *
 * « Figée », comme à la Summer, veut dire : qui porte déjà une carte. Les
 * actions qui changent un score ne touchent qu'une game encore libre. Les
 * games ne changent pas de main : ce sont leurs scores qui s'échangent, et un
 * clone arrive en points hors game — le total est celui de la Summer.
 */
export type ActionRoue =
  /** « Meilleure game ×1,5 » : la meilleure game libre de chacun. */
  | { quoi: 'meilleure_fois'; facteur: number }
  /** « Pire game ×2 » : la pire game libre de chacun. */
  | { quoi: 'pire_fois'; facteur: number }
  /** « Game aléatoire ×2 » : une game libre au hasard. */
  | { quoi: 'hasard_fois'; facteur: number }
  /** « Une game au hasard ÷ 2 » : arrondi au supérieur ; les immunisés y échappent. */
  | { quoi: 'hasard_divise'; diviseur: number }
  /** « Ajout d'une game sup » : un créneau de plus, comme la carte du Perso. */
  /** Des flocons pour chacun (Ciel de Cristal, 12/11/2026 : remplace la game sup). */
  | { quoi: 'flocons'; montant: number }
  /** « Suppression de la pire game » : elle ne compte plus, son créneau est rendu. */
  | { quoi: 'supprime_pire' }
  /** « Échange meilleure ↔ pire » : la meilleure du premier tiré, la pire du second. */
  | { quoi: 'echange_meilleure_pire' }
  /** « Échange 2 games aléatoires » : une game au hasard de chacun. */
  | { quoi: 'echange_hasard' }
  /** « Roue commu × 20 subs » : une Tempête de neige. */
  | { quoi: 'tempete' }
  /** « Clone meilleure → joueur aléatoire » : la meilleure game de la ligue, en points. */
  | { quoi: 'clone_ligue' }
  /** « Clone meilleure → pire aléatoire » : la pire du premier prend le score de la meilleure du second. */
  | { quoi: 'clone_sur_pire' }
  /** « Meilleure game aux 5 derniers » : leur pire game prend le score de la meilleure de la ligue. */
  | { quoi: 'meilleure_aux_derniers' }
  /** « +5 pts par Top 1 » : par Top 1 fait depuis la dernière fois que la carte est tombée. */
  | { quoi: 'par_top1'; points: number }
  /** « Vol de score » : le total du joueur juste au-dessus, en points hors game. */
  | { quoi: 'vol_score' }
  /** « Fige la meilleure game » : jamais la pire ; `minGames` games jouées au moins. */
  | { quoi: 'fige_meilleure'; minGames: number }
  /** « Fige une game au hasard » : jamais la pire, ni la meilleure si `meilleureExclue`. */
  | { quoi: 'fige_hasard'; meilleureExclue: boolean }
  /** « Échange entre les 10 premiers » : en chaîne, ni leur meilleure ni leur pire. */
  | { quoi: 'chaine_tete' }
  /** « Échange général » : chacun donne une game au hasard au suivant. */
  | { quoi: 'echange_general' }
  /** « +5 pts petites games » : par game de moins de N kills. */
  | { quoi: 'petites_games'; moinsDe: number; points: number }
  /** « Roulette russe » : un des six perd sa meilleure game. */
  | { quoi: 'roulette' }
  /** « Pire game à 0 » : même déjà touchée, sauf figée ; les immunisés y échappent. */
  | { quoi: 'pire_a_zero' }
  /** « 3 Jokers pour tout le monde » : dans la limite de la main. */
  | { quoi: 'jokers'; nombre: number }
  /** « Fusion des 2 pires games » : une seule, qui vaut leur somme ; un créneau rendu. */
  | { quoi: 'fusion_pires' }
  /** « Pire game ramenée à la moyenne ». */
  | { quoi: 'pire_moyenne' }
  /** « Pas de chance » : rien ne change. */
  | { quoi: 'rien' };

/**
 * Ce qu'une carte fait.
 *
 * Les actions reprennent celles des roues de la Summer Ligue — le
 * multiplicateur, le clone de kills, le joker, la game supplémentaire,
 * l'immunité. Il n'y a pas de plafond de points par rareté : une carte pèse
 * ce que dit son effet, et plus elle est rare, plus elle est forte.
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
  /** « Multiplicateur game » : le score entier (kills + top) multiplié, plafonné en points s'il a un `cap`. */
  | { kind: 'multiplicateur_game'; value: number; cap?: number }
  /** « Une game ÷ N » : le score entier divisé, la perte plafonnée en points. */
  | { kind: 'diviseur_game'; value: number; cap: number }
  /**
   * « Clone kill du meilleur » : la game compte comme si le joueur avait fait
   * les kills du meilleur tueur de la partie — plafonné s'il a un `cap`. S'il
   * est lui-même le meilleur tueur, il reçoit sa `consolation` en points, ou
   * rien s'il n'y en a pas.
   */
  | { kind: 'clone_kills'; cap?: number; consolation?: number }
  /** « Joker » : la game vaut au moins N points. */
  | { kind: 'plancher'; value: number }
  /** « +N pts à partir du Top X » : seulement si la game finit dans le Top. */
  | { kind: 'bonus_top'; top: Exclude<Placement, null>; value: number }
  /** « +N pts petites games » : seulement sous un nombre de kills. */
  | { kind: 'petite_game'; moinsDe: number; value: number }
  /**
   * « +N pts par tranche de X kills » : un palier tous les X kills, plafonné.
   * Elle se mérite — rien sous X kills — et grandit avec la game.
   */
  | { kind: 'kills_paliers'; par: number; value: number; cap: number }
  /**
   * « +N pts si plus de kills qu'à la game précédente » : la game doit battre
   * les kills de la game jouée juste avant par le même joueur (une game passée
   * ne compte pas). Sans game précédente, il suffit d'un kill.
   */
  | { kind: 'progression_kills'; value: number }
  /** Les flocons de la game sont doublés. Aucune incidence au classement. */
  | { kind: 'flocons_doubles' }
  /**
   * La carte à deux : elle attend la prochaine game de **chacun** des deux
   * joueurs tirés au sort, et se règle quand la seconde est saisie. Ils
   * échangent leurs kills, ou leur score, borné de chaque côté par `cap` —
   * ou, sans `cap`, leurs games entières : chacun repart avec le score de
   * l'autre (décidé par l'organisation le 27/10/2026).
   */
  | { kind: 'echange'; sur: 'kills' | 'score'; cap?: number }
  /* ------------------------ Sur une game déjà jouée ----------------------- */
  /** « Pire game ramenée à la moyenne », plafonné. */
  | { kind: 'releve_pire'; cap: number }
  /** « Pire game ×2 », « Meilleure game ×1,5 » : une game jouée multipliée, plafonné. */
  | { kind: 'multiplie_jouee'; cible: 'pire' | 'meilleure'; value: number; cap: number }
  /**
   * « Fige ta meilleure game » : la carte se pose sur la meilleure game encore
   * sans carte, sans en changer le score. Une game ne portant jamais deux
   * cartes, plus aucune — malus de fin de saison, échange — ne peut la
   * toucher. Si la meilleure en porte déjà une, c'est la suivante.
   */
  | { kind: 'fige_meilleure' }
  /**
   * « Supprime ta pire game » : la pire game encore sans carte du joueur ne
   * compte plus (elle est passée), et son créneau est rendu. Seulement la
   * sienne, jamais celle d'un autre ; une game qui porte une carte — figée,
   * relevée, frappée d'un malus — n'est pas touchée.
   */
  | { kind: 'supprime_pire' }
  /* ------------------------------ Tout de suite --------------------------- */
  /**
   * « +N pts bonus » : N points ajoutés au total du joueur, tout de suite,
   * hors de toute game (`CarteEnAttente.points`), une fois la carte révélée
   * (décidé le 02/11/2026). Le classement les montre à part, en bonus.
   */
  | { kind: 'bonus_total'; value: number }
  /** Des flocons, dans l'instant. Aucune incidence au classement. */
  | { kind: 'snowflakes'; value: number }
  /** « Game supplémentaire » : un créneau de game de plus, hors limite. */
  | { kind: 'game_supplementaire' }
  /** « Immunité » : pendant N heures, aucun malus ne touche ses games. */
  | { kind: 'immunite'; heures: number }
  /* -------------------------------- Gardée -------------------------------- */
  /**
   * « Joker » : le joueur le garde, et la modération peut, à la saisie d'une de
   * ses games, la faire ne pas compter — le Joker est alors consommé. Un seul
   * à la fois : un second, tiré pendant qu'il en garde un, ne fait rien.
   */
  | { kind: 'joker' }
  /**
   * « −N pts au joueur de ton choix » : le joueur la garde ; la modération la
   * joue pour lui, sur le joueur qu'il désigne (décidé par l'organisation le
   * 13/10/2026). La victime perd N points sur son total, tout de suite, hors
   * de toute game (`COUP_DE_VERGLAS`, décidé le 19/10/2026) ; l'immunité le
   * pare.
   */
  | { kind: 'malus_choisi'; value: number }
  /**
   * « Échange de games » : le joueur la garde, et ne peut la jouer qu'une fois
   * `minGames` games jouées. Il choisit une de ses games et une game d'un
   * autre joueur, toutes deux encore sans carte : elles échangent leur score.
   * La modération la joue pour lui (décidé par l'organisation le 02/11/2026).
   */
  | { kind: 'echange_choisi'; minGames: number }
  /**
   * « Échange pire contre meilleure » (Finisseur, roues de la Summer) : le
   * joueur la garde et désigne un joueur ; sa pire game libre et la meilleure
   * de l'autre échangent leur score. Une fois par joueur, sauf la revanche
   * contre qui l'a visé ; un immunisé ne peut pas être visé.
   */
  | { kind: 'echange_cible' }
  /**
   * « Fige ta meilleure game, quand tu veux » (la Cryogénisation, Folie,
   * 12/11/2026) : le joueur la garde ; la modération la joue quand il le dit,
   * et sa meilleure game libre est figée — jamais sa pire.
   */
  | { kind: 'fige_garde' }
  /* -------------------------- Les roues de la Summer ---------------------- */
  /** Une action des roues, telle quelle : voir {@link ActionRoue}. */
  | { kind: 'roue'; action: ActionRoue };

/**
 * Quand une carte se joue. Voir {@link CardEffect}. `GARDEE` : elle ne se joue
 * pas d'elle-même, le joueur la garde jusqu'à ce qu'on s'en serve (le Joker).
 */
export type MomentCarte = 'PROCHAINE' | 'JOUEE' | 'INSTANT' | 'GARDEE';

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
  /** Indice de puissance sur 100, réglé à la main : il range les cartes d'une rareté. Il n'est plus affiché. */
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

/**
 * Le top d'une game : Top 1, 2 ou 3, qui rapportent points et flocons, ou
 * Top 6, 8 ou 10, qui ne rapportent rien d'eux-mêmes et servent aux cartes
 * (ajoutés le 02/11/2026). Un Top N veut dire « fini dans les N premiers ».
 */
export type Placement = 1 | 2 | 3 | 6 | 8 | 10 | null;

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
