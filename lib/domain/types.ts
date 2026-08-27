/**
 * Types du domaine Winter Ligue.
 *
 * Tout ce fichier est neutre vis-a-vis du transport et du stockage : il decrit
 * uniquement les regles du jeu. Aucune fonction ici ne doit lire un cookie,
 * toucher au reseau ou faire confiance a une valeur venue du client.
 */

export type Rarity = 'COMMUNE' | 'RARE' | 'EPIQUE' | 'LEGENDAIRE';

export const RARITIES: readonly Rarity[] = ['COMMUNE', 'RARE', 'EPIQUE', 'LEGENDAIRE'];

/** Les quatre familles de cartes. Completer une famille debloque un bonus permanent. */
export type ThemeId = 'glace' | 'tempete' | 'aurore' | 'solstice';

/** Ce que la carte demande comme cible au moment d'etre jouee. */
export type CardTarget =
  | 'none' // aucune cible
  | 'own_game' // une de tes games
  | 'own_worst_game' // resolue serveur : ta pire game
  | 'own_best_game' // resolue serveur : ta meilleure game
  | 'opponent'; // un autre joueur

/** Effet mecanique applique par le serveur. Le client ne fait que l'afficher. */
export type CardEffect =
  | { kind: 'multiplier'; value: number }
  | { kind: 'bonus_points'; value: number }
  | { kind: 'snowflakes'; value: number }
  | { kind: 'freeze_game' }
  | { kind: 'freeze_best_game'; bonusPoints: number }
  | { kind: 'freeze_all_games' }
  | { kind: 'shield'; hours: number }
  | { kind: 'delete_worst_game' }
  | { kind: 'steal_points'; value: number }
  | { kind: 'swap_random_game' }
  | { kind: 'copy_best_game' };

export interface CardDefinition {
  id: string;
  name: string;
  theme: ThemeId;
  rarity: Rarity;
  /** Texte affiche au joueur. */
  description: string;
  /** Icone Unicode utilisee dans l'UI (pas de dependance a une police d'icones). */
  glyph: string;
  target: CardTarget;
  effect: CardEffect;
  /** Un bonus s'applique a soi, un malus se pose sur un adversaire. */
  nature: 'bonus' | 'malus';
  /** Une carte offensive peut etre bloquee par un bouclier ou une game gelee. */
  offensive: boolean;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  glyph: string;
  /** Couleur CSS (variable du theme) utilisee pour les bordures et lueurs. */
  color: string;
  /** Description lisible du bonus obtenu quand la famille est complete. */
  setBonusLabel: string;
}

/** Bonus permanents cumules, derives de la collection du joueur. */
export interface SetBonuses {
  /** Emplacements de main supplementaires. */
  handSlots: number;
  /** Multiplicateur de kills additionnel et permanent (0.05 = +5 %). */
  killMultiplier: number;
  /** Flocons supplementaires gagnes a chaque game. */
  snowflakesPerGame: number;
  /** Remise en boutique, entre 0 et 1. */
  shopDiscount: number;
  /** Remise sur la taxe de l hotel des ventes, entre 0 et 1. */
  marketFeeDiscount: number;
  /** Familles completees, pour l'affichage. */
  completed: ThemeId[];
}

export type Placement = 1 | 2 | 3 | null;

export interface BoosterDefinition {
  id: string;
  name: string;
  tagline: string;
  glyph: string;
  /** Prix en flocons, avant remise de collection. */
  price: number;
  cardCount: number;
  /** Rarete minimale garantie sur au moins une carte du booster. */
  guaranteed: Rarity | null;
  /** Poids de tirage par rarete. Doivent etre des entiers positifs. */
  weights: Record<Rarity, number>;
}

/* --------------------------------------------------------------------------
 * Hotel des ventes
 * ------------------------------------------------------------------------ */

export type ListingStatus = 'ACTIVE' | 'VENDUE' | 'EXPIREE' | 'ANNULEE';

/**
 * Une vente porte toujours sur UNE copie precise de carte (cardInstanceId).
 * Tant que la vente est ACTIVE, la copie est verrouillee : injouable, non
 * remise en vente. C'est ce verrou qui empeche de dupliquer une carte en la
 * vendant et en la jouant en meme temps.
 */
export interface Listing {
  id: string;
  sellerId: string;
  cardInstanceId: string;
  cardId: string;
  /** Prix de depart des encheres, en flocons. */
  startPrice: number;
  /** Achat immediat facultatif. null = enchere pure. */
  buyoutPrice: number | null;
  /** Meilleure enchere courante (= startPrice tant que personne n'a mise). */
  currentPrice: number;
  currentBidderId: string | null;
  bidCount: number;
  createdAt: string;
  endsAt: string;
  status: ListingStatus;
  /** Renseignes a la cloture. */
  buyerId: string | null;
  finalPrice: number | null;
  closedAt: string | null;
}

export interface Bid {
  id: string;
  listingId: string;
  bidderId: string;
  amount: number;
  createdAt: string;
  /** true si l'enchere a ete depassee et les flocons rembourses. */
  refunded: boolean;
}

/** Une vente conclue. Sert d'historique et alimente la courbe de prix. */
export interface Sale {
  id: string;
  listingId: string;
  cardId: string;
  sellerId: string;
  buyerId: string;
  price: number;
  /** Taxe prelevee, deja deduite du versement au vendeur. */
  fee: number;
  /** 'ENCHERE' ou 'ACHAT_IMMEDIAT'. */
  method: 'ENCHERE' | 'ACHAT_IMMEDIAT';
  soldAt: string;
}

/** Statistiques de marche calculees pour une carte donnee. */
export interface MarketStats {
  cardId: string;
  lastPrice: number | null;
  lastBuyerId: string | null;
  lastSoldAt: string | null;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  volume: number;
  /** Variation en % sur les 7 derniers jours, null si pas assez d'historique. */
  trend7d: number | null;
  /** Points de la courbe, du plus ancien au plus recent. */
  history: { at: string; price: number }[];
  activeListings: number;
  /** Enchere la plus basse actuellement en cours. */
  floorPrice: number | null;
}
