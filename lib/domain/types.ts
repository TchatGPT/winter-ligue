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

/** Les quatre familles de cartes. Compléter une famille débloque un bonus permanent. */
export type ThemeId = 'glace' | 'tempete' | 'aurore' | 'solstice';

/** Ce que la carte demande comme cible au moment d'être jouée. */
export type CardTarget =
  | 'none' // aucune cible
  | 'own_game' // une de tes games
  | 'own_worst_game' // résolue serveur : ta pire game
  | 'own_best_game' // résolue serveur : ta meilleure game
  | 'opponent'; // un autre joueur

/** Faveurs durables : des effets qui se consomment sur plusieurs actions. */
export type BoonKind =
  /** Double les flocons gagnés à chaque game. */
  | 'FLOCONS_DOUBLES'
  /** Réduit la taxe de l'hôtel des ventes. */
  | 'TAXE_REDUITE'
  /** Garantit une rareté minimale à la prochaine ouverture de booster. */
  | 'GARANTIE_BOOSTER';

/**
 * Effet mécanique appliqué par le serveur. Le client ne fait que l'afficher.
 *
 * Deux principes gouvernent cette liste :
 *
 *  1. **Tout est borné.** Une game moyenne vaut ~25 points et une saison ~400 :
 *     une carte qui en donnerait 100 volerait un quart de saison en un clic.
 *     Chaque effet porte donc son plafond, y compris les multiplicateurs.
 *  2. **Un malus retire, il ne transfère jamais.** Aucun effet ne prend des
 *     points à quelqu'un pour les donner à l'attaquant : ce double mouvement
 *     est précisément ce qui rend le vol insupportable des deux côtés.
 */
export type CardEffect =
  /* -- Glace : protéger ------------------------------------------------- */
  | { kind: 'bonus_points'; value: number }
  | { kind: 'shield'; hours: number }
  | { kind: 'freeze_game' }
  | { kind: 'undo_last_malus'; withinHours: number }
  | { kind: 'shield_and_freeze_best'; hours: number }
  | { kind: 'freeze_top_games'; count: number }
  /* -- Tempête : amplifier une performance réelle ------------------------ */
  | { kind: 'points_per_kill'; perKill: number; cap: number }
  | { kind: 'kill_multiplier'; value: number; cap: number }
  | { kind: 'points_per_kill_above'; perKill: number; threshold: number; cap: number }
  | { kind: 'double_placement' }
  /* -- Aurore : économie, sans incidence sur le classement --------------- */
  | { kind: 'snowflakes'; value: number }
  | { kind: 'boon'; boon: BoonKind; uses: number; value?: string }
  | {
      kind: 'snowflakes_and_boon';
      snowflakes: number;
      boon: BoonKind;
      uses: number;
      value?: string;
    }
  /* -- Solstice : interaction -------------------------------------------- */
  | { kind: 'delete_worst_game' }
  | { kind: 'strike_best'; points: number }
  | { kind: 'strike_top'; points: number; count: number }
  | { kind: 'cancel_last_boost' }
  | { kind: 'silence'; hours: number };

export interface CardDefinition {
  id: string;
  name: string;
  /** Sous-titre court affiché sous le nom, comme sur une vraie carte à collectionner. */
  subtitle: string;
  theme: ThemeId;
  rarity: Rarity;
  /** Texte affiché au joueur. */
  description: string;
  /** Icône Unicode utilisée dans l'UI (pas de dépendance à une police d'icônes). */
  glyph: string;
  target: CardTarget;
  effect: CardEffect;
  /** Un bonus s'applique à soi, un malus se pose sur un adversaire. */
  nature: 'bonus' | 'malus';
  /** Une carte offensive peut être bloquée par un bouclier ou une game gelée. */
  offensive: boolean;
  /** Indice de puissance sur 100, affiché sur la vignette. Réglé à la main. */
  power: number;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  glyph: string;
  /** Couleur CSS utilisée pour les bordures et lueurs. */
  color: string;
  /** Bonus obtenu à 4 cartes sur 6. */
  partialBonusLabel: string;
  /** Bonus obtenu avec les 6 cartes. */
  fullBonusLabel: string;
}

/** Bonus permanents cumulés, dérivés de la collection du joueur. */
export interface SetBonuses {
  /** Emplacements de main supplémentaires. */
  handSlots: number;
  /** Multiplicateur de kills additionnel et permanent (0.05 = +5 %). */
  killMultiplier: number;
  /** Flocons supplémentaires gagnés à chaque game. */
  snowflakesPerGame: number;
  /** Remise en boutique, entre 0 et 1. */
  shopDiscount: number;
  /** Remise sur la taxe de l'hôtel des ventes, entre 0 et 1. */
  marketFeeDiscount: number;
  /** Familles complétées à 6/6. */
  completed: ThemeId[];
  /** Familles atteignant le palier partiel (4/6 ou plus). */
  partial: ThemeId[];
}

export type Placement = 1 | 2 | 3 | null;

export interface BoosterDefinition {
  id: string;
  name: string;
  tagline: string;
  glyph: string;
  /** Deux couleurs pour le dégradé du sachet en 3D. */
  gradient: [string, string];
  /** Prix en flocons, avant remise de collection. */
  price: number;
  cardCount: number;
  /** Rareté minimale garantie sur au moins une carte du booster. */
  guaranteed: Rarity | null;
  /**
   * Poids de tirage par rareté, exprimés sur 100 000 pour rester exacts.
   * Leur somme doit valoir exactement 100 000 — c'est vérifié par les tests.
   */
  weights: Record<Rarity, number>;
}

/* --------------------------------------------------------------------------
 * Hôtel des ventes
 * ------------------------------------------------------------------------ */

export type ListingStatus = 'ACTIVE' | 'VENDUE' | 'EXPIREE' | 'ANNULEE';

/**
 * Une vente porte toujours sur UNE copie précise de carte (cardInstanceId).
 * Tant que la vente est ACTIVE, la copie est verrouillée : injouable, non
 * remise en vente. C'est ce verrou qui empêche de dupliquer une carte en la
 * vendant et en la jouant en même temps.
 */
export interface Listing {
  id: string;
  sellerId: string;
  cardInstanceId: string;
  cardId: string;
  /** Prix de départ des enchères, en flocons. */
  startPrice: number;
  /** Achat immédiat facultatif. null = enchère pure. */
  buyoutPrice: number | null;
  /** Meilleure enchère courante (= startPrice tant que personne n'a misé). */
  currentPrice: number;
  currentBidderId: string | null;
  bidCount: number;
  createdAt: string;
  endsAt: string;
  status: ListingStatus;
  /** Renseignés à la clôture. */
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
  /** true si l'enchère a été dépassée et les flocons remboursés. */
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
  /** Taxe prélevée, déjà déduite du versement au vendeur. */
  fee: number;
  method: 'ENCHERE' | 'ACHAT_IMMEDIAT';
  soldAt: string;
}

/** Statistiques de marché calculées pour une carte donnée. */
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
  /** Points de la courbe, du plus ancien au plus récent. */
  history: { at: string; price: number }[];
  activeListings: number;
  /** Enchère la plus basse actuellement en cours. */
  floorPrice: number | null;
}
