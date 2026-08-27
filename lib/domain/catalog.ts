/**
 * Catalogue figé de la saison : raretés, familles, 24 cartes, 4 boosters.
 *
 * C'est la source de vérité. Le client reçoit ce catalogue pour l'affichage,
 * mais toute résolution d'effet relit ces définitions côté serveur : une carte
 * envoyée par le navigateur n'est qu'un identifiant, jamais un effet.
 */

import { CARD_ART } from './card-art.generated';
import { RARITY_ORDER, RARITY_WEIGHTS_BASE } from './rules';
import type {
  BoosterDefinition,
  CardDefinition,
  Rarity,
  ThemeDefinition,
  ThemeId,
} from './types';

/**
 * Palette de raretés : froide pour le banal, chaude pour le convoité. Sur un
 * fond de nuit polaire, les cartes rares « chauffent » — on repère une
 * légendaire dans une grille de cent vignettes sans lire une seule étiquette.
 */
export const RARITY_META: Record<
  Rarity,
  {
    /** Sigle affiché sur la vignette, comme sur une carte à collectionner. */
    code: string;
    label: string;
    short: string;
    color: string;
    /** Teinte sombre pour le fond dégradé de la carte. */
    deep: string;
    glow: string;
    order: number;
    /** Les raretés au-dessus de ce seuil reçoivent le reflet holographique. */
    holo: boolean;
  }
> = {
  C: {
    code: 'C',
    label: 'Commune',
    short: 'Com.',
    color: '#93a9c0',
    deep: '#2a3646',
    glow: 'rgba(147,169,192,0.30)',
    order: 0,
    holo: false,
  },
  PC: {
    code: 'PC',
    label: 'Peu commune',
    short: 'P. com.',
    color: '#4fc9f0',
    deep: '#123a4e',
    glow: 'rgba(79,201,240,0.38)',
    order: 1,
    holo: false,
  },
  R: {
    code: 'R',
    label: 'Rare',
    short: 'Rare',
    color: '#8b7dff',
    deep: '#251f52',
    glow: 'rgba(139,125,255,0.45)',
    order: 2,
    holo: true,
  },
  SR: {
    code: 'SR',
    label: 'Super rare',
    short: 'S. rare',
    color: '#ff7dc8',
    deep: '#4a1738',
    glow: 'rgba(255,125,200,0.50)',
    order: 3,
    holo: true,
  },
  UR: {
    code: 'UR',
    label: 'Ultra rare',
    short: 'U. rare',
    color: '#ff9a4d',
    deep: '#4d2510',
    glow: 'rgba(255,154,77,0.55)',
    order: 4,
    holo: true,
  },
  L: {
    code: 'L',
    label: 'Légendaire',
    short: 'Légend.',
    color: '#ffd76a',
    deep: '#4b3708',
    glow: 'rgba(255,215,106,0.62)',
    order: 5,
    holo: true,
  },
};

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  glace: {
    id: 'glace',
    name: 'Glace Éternelle',
    tagline: 'Verrouiller ce qui est acquis',
    glyph: '❄',
    color: '#7fd8ff',
    partialBonusLabel: '+8 places de réserve',
    fullBonusLabel: '+20 places de réserve',
  },
  tempete: {
    id: 'tempete',
    name: 'Tempête',
    tagline: 'Multiplier la casse',
    glyph: '🌪',
    color: '#6ee7c7',
    partialBonusLabel: '+3 % de kills en permanence',
    fullBonusLabel: '+7 % de kills en permanence',
  },
  aurore: {
    id: 'aurore',
    name: 'Aurore Boréale',
    tagline: 'Points et flocons',
    glyph: '🌌',
    color: '#b18cff',
    partialBonusLabel: '+8 flocons par game',
    fullBonusLabel: '+20 flocons par game',
  },
  solstice: {
    id: 'solstice',
    name: 'Solstice',
    tagline: 'Le chaos et les malus',
    glyph: '🎁',
    color: '#e8c46a',
    partialBonusLabel: '−8 % en boutique',
    fullBonusLabel: '−18 % en boutique et −50 % de taxe de vente',
  },
};

/**
 * 24 cartes : 4 familles × 6 raretés.
 *
 * Le plafond d'impact est fixé à ~25 points, soit une bonne game. Sur une
 * saison qui en totalise environ 400, une carte à +100 volerait un quart du
 * classement en un clic — c'est ce qui rendait certaines roues de la Summer
 * Ligue insupportables.
 *
 * Trois interdits structurent la famille Solstice :
 *   — aucune suppression définitive de la game d'autrui ;
 *   — aucun transfert : un malus retire des points, il n'en donne jamais à
 *     l'attaquant ;
 *   — tout malus est annulable par Second Souffle dans les 24 h.
 */
export const EFFECT_CARDS: readonly CardDefinition[] = [
  /* ================ GLACE — protéger ce qui est acquis =================== */
  {
    id: 'congere',
    name: 'Congère',
    subtitle: 'Ce qui s’accumule reste',
    theme: 'glace',
    rarity: 'C',
    glyph: '🌨',
    description: 'Ajoute +4 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 4 },
    nature: 'bonus',
    offensive: false,
    power: 10,
  },
  {
    id: 'bouclier-givre',
    name: 'Bouclier de Givre',
    subtitle: 'Intouchable une nuit',
    theme: 'glace',
    rarity: 'PC',
    glyph: '🛡',
    description: 'Immunise ton profil contre tous les malus pendant 12 heures.',
    target: 'none',
    effect: { kind: 'shield', hours: 12 },
    nature: 'bonus',
    offensive: false,
    power: 32,
  },
  {
    id: 'gel-eternel',
    name: 'Gel Éternel',
    subtitle: 'Ce qui est pris est pris',
    theme: 'glace',
    rarity: 'R',
    glyph: '❅',
    description:
      'Gèle une de tes games : plus aucun malus ne peut l’atteindre, jusqu’à la fin de la saison.',
    target: 'own_game',
    effect: { kind: 'freeze_game' },
    nature: 'bonus',
    offensive: false,
    power: 48,
  },
  {
    id: 'second-souffle',
    name: 'Second Souffle',
    subtitle: 'Rien n’est jamais perdu',
    theme: 'glace',
    rarity: 'SR',
    glyph: '🌬',
    description:
      'Annule le dernier malus subi dans les 24 heures et te rend les points retirés.',
    target: 'none',
    effect: { kind: 'undo_last_malus', withinHours: 24 },
    nature: 'bonus',
    offensive: false,
    power: 68,
  },
  {
    id: 'rempart-polaire',
    name: 'Rempart Polaire',
    subtitle: 'Deux jours de silence',
    theme: 'glace',
    rarity: 'UR',
    glyph: '🏰',
    description: 'Immunise ton profil pendant 48 heures et gèle ta meilleure game.',
    target: 'none',
    effect: { kind: 'shield_and_freeze_best', hours: 48 },
    nature: 'bonus',
    offensive: false,
    power: 84,
  },
  {
    id: 'sanctuaire',
    name: 'Sanctuaire',
    subtitle: 'Le socle ne bouge plus',
    theme: 'glace',
    rarity: 'L',
    glyph: '🏔',
    description:
      'Gèle tes 3 meilleures games. Les suivantes restent exposées — un socle, pas une forteresse.',
    target: 'none',
    effect: { kind: 'freeze_top_games', count: 3 },
    nature: 'bonus',
    offensive: false,
    power: 95,
  },

  /* ============ TEMPÊTE — amplifier une performance réelle =============== */
  {
    id: 'rafale',
    name: 'Rafale',
    subtitle: 'Chaque coup compte',
    theme: 'tempete',
    rarity: 'C',
    glyph: '🍃',
    description: 'Ajoute +1 point par kill sur une de tes games, jusqu’à +8.',
    target: 'own_game',
    effect: { kind: 'points_per_kill', perKill: 1, cap: 8 },
    nature: 'bonus',
    offensive: false,
    power: 16,
  },
  {
    id: 'vent-du-nord',
    name: 'Vent du Nord',
    subtitle: 'Le vent tourne',
    theme: 'tempete',
    rarity: 'PC',
    glyph: '💨',
    description: 'Multiplie par 1,25 les kills d’une de tes games, jusqu’à +10 points.',
    target: 'own_game',
    effect: { kind: 'kill_multiplier', value: 1.25, cap: 10 },
    nature: 'bonus',
    offensive: false,
    power: 34,
  },
  {
    id: 'percee',
    name: 'Percée',
    subtitle: 'Récompense les gros scores',
    theme: 'tempete',
    rarity: 'R',
    glyph: '⚔',
    description:
      'Ajoute +2 points par kill au-delà du dixième sur une de tes games, jusqu’à +14.',
    target: 'own_game',
    effect: { kind: 'points_per_kill_above', perKill: 2, threshold: 10, cap: 14 },
    nature: 'bonus',
    offensive: false,
    power: 54,
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    subtitle: 'On n’y voit plus rien',
    theme: 'tempete',
    rarity: 'SR',
    glyph: '🌪',
    description: 'Multiplie par 1,5 les kills d’une de tes games, jusqu’à +18 points.',
    target: 'own_game',
    effect: { kind: 'kill_multiplier', value: 1.5, cap: 18 },
    nature: 'bonus',
    offensive: false,
    power: 72,
  },
  {
    id: 'sang-froid',
    name: 'Sang-Froid',
    subtitle: 'La place avant les frags',
    theme: 'tempete',
    rarity: 'UR',
    glyph: '🧊',
    description:
      'Double les points de classement d’une de tes games. Un Top 1 passe de 20 à 40 points.',
    target: 'own_game',
    effect: { kind: 'double_placement' },
    nature: 'bonus',
    offensive: false,
    power: 86,
  },
  {
    id: 'nuit-polaire',
    name: 'Nuit Polaire',
    subtitle: 'Le plus fort multiplicateur',
    theme: 'tempete',
    rarity: 'L',
    glyph: '🌑',
    description: 'Multiplie par 1,8 les kills d’une de tes games, jusqu’à +25 points.',
    target: 'own_game',
    effect: { kind: 'kill_multiplier', value: 1.8, cap: 25 },
    nature: 'bonus',
    offensive: false,
    power: 100,
  },

  /* ========= AURORE — économie pure, aucune incidence au classement ====== */
  {
    id: 'etincelle',
    name: 'Étincelle',
    subtitle: 'Une lueur',
    theme: 'aurore',
    rarity: 'C',
    glyph: '✦',
    description: 'Crédite immédiatement 80 flocons.',
    target: 'none',
    effect: { kind: 'snowflakes', value: 80 },
    nature: 'bonus',
    offensive: false,
    power: 12,
  },
  {
    id: 'etoile-polaire',
    name: 'Étoile Polaire',
    subtitle: 'Le cap au nord',
    theme: 'aurore',
    rarity: 'PC',
    glyph: '⭐',
    description: 'Crédite immédiatement 250 flocons.',
    target: 'none',
    effect: { kind: 'snowflakes', value: 250 },
    nature: 'bonus',
    offensive: false,
    power: 30,
  },
  {
    id: 'pluie-de-flocons',
    name: 'Pluie de Flocons',
    subtitle: 'La caisse se remplit',
    theme: 'aurore',
    rarity: 'R',
    glyph: '🌧',
    description: 'Crédite immédiatement 600 flocons.',
    target: 'none',
    effect: { kind: 'snowflakes', value: 600 },
    nature: 'bonus',
    offensive: false,
    power: 50,
  },
  {
    id: 'manne',
    name: 'Manne',
    subtitle: 'Jouer rapporte double',
    theme: 'aurore',
    rarity: 'SR',
    glyph: '💠',
    description: 'Double les flocons gagnés sur tes 3 prochaines games enregistrées.',
    target: 'none',
    effect: { kind: 'boon', boon: 'FLOCONS_DOUBLES', uses: 3 },
    nature: 'bonus',
    offensive: false,
    power: 70,
  },
  {
    id: 'mecene',
    name: 'Mécène',
    subtitle: 'Vendre coûte moins cher',
    theme: 'aurore',
    rarity: 'UR',
    glyph: '👑',
    description: 'Réduit de moitié la taxe de tes 5 prochaines ventes à l’hôtel des ventes.',
    target: 'none',
    effect: { kind: 'boon', boon: 'TAXE_REDUITE', uses: 5, value: '0.5' },
    nature: 'bonus',
    offensive: false,
    power: 82,
  },
  {
    id: 'aurore-boreale',
    name: 'Aurore Boréale',
    subtitle: 'Le ciel s’embrase',
    theme: 'aurore',
    rarity: 'L',
    glyph: '🌌',
    description:
      'Crédite 2 500 flocons, et garantit au moins une super rare à ta prochaine ouverture de booster.',
    target: 'none',
    effect: {
      kind: 'snowflakes_and_boon',
      snowflakes: 2500,
      boon: 'GARANTIE_BOOSTER',
      uses: 1,
      value: 'SR',
    },
    nature: 'bonus',
    offensive: false,
    power: 96,
  },

  /* ==================== SOLSTICE — l'interaction ========================= */
  {
    id: 'boule-de-neige',
    name: 'Boule de Neige',
    subtitle: 'On efface la pire',
    theme: 'solstice',
    rarity: 'C',
    glyph: '⛄',
    description: 'Supprime définitivement ta pire game comptabilisée.',
    target: 'own_worst_game',
    effect: { kind: 'delete_worst_game' },
    nature: 'bonus',
    offensive: false,
    power: 22,
  },
  {
    id: 'givre-mordant',
    name: 'Givre Mordant',
    subtitle: 'Une morsure légère',
    theme: 'solstice',
    rarity: 'PC',
    glyph: '🥶',
    description: 'MALUS : retire 6 points à la meilleure game d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'strike_best', points: 6 },
    nature: 'malus',
    offensive: true,
    power: 36,
  },
  {
    id: 'contre-courant',
    name: 'Contre-Courant',
    subtitle: 'Le contre-jeu',
    theme: 'solstice',
    rarity: 'R',
    glyph: '🌀',
    description:
      'MALUS : annule le dernier bonus de carte appliqué à une game d’un adversaire. Ne peut jamais retirer plus que ce que cette carte avait donné.',
    target: 'opponent',
    effect: { kind: 'cancel_last_boost' },
    nature: 'malus',
    offensive: true,
    power: 56,
  },
  {
    id: 'traineau-perce',
    name: 'Traîneau Percé',
    subtitle: 'Ça fuit de partout',
    theme: 'solstice',
    rarity: 'SR',
    glyph: '🛷',
    description: 'MALUS : retire 12 points à la meilleure game d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'strike_best', points: 12 },
    nature: 'malus',
    offensive: true,
    power: 74,
  },
  {
    id: 'tempete-de-verglas',
    name: 'Tempête de Verglas',
    subtitle: 'Tout se fissure',
    theme: 'solstice',
    rarity: 'UR',
    glyph: '🌩',
    description: 'MALUS : retire 8 points à chacune des 3 meilleures games d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'strike_top', points: 8, count: 3 },
    nature: 'malus',
    offensive: true,
    power: 88,
  },
  {
    id: 'grand-froid',
    name: 'Grand Froid',
    subtitle: 'Plus un geste',
    theme: 'solstice',
    rarity: 'L',
    glyph: '☠',
    description:
      'MALUS : l’adversaire visé ne peut plus jouer la moindre carte pendant 24 heures. Aucun point retiré.',
    target: 'opponent',
    effect: { kind: 'silence', hours: 24 },
    nature: 'malus',
    offensive: true,
    power: 98,
  },
];

/**
 * Alias de lecture. Le catalogue figé ne contient que des cartes à effet ; les
 * cartes Joueur et Moment vivent en base et se résolvent via
 * `lib/services/collection.ts`.
 */
export const CARDS = EFFECT_CARDS;

const CARD_INDEX = new Map(CARDS.map((c) => [c.id, c]));

/** Numéro de collection, à la façon du « 12/24 » au dos des cartes. */
const CARD_NUMBERS = new Map(CARDS.map((c, i) => [c.id, i + 1]));

export const TOTAL_CARDS = CARDS.length;

export function cardNumber(id: string): string {
  const n = CARD_NUMBERS.get(id);
  return n ? `${String(n).padStart(2, '0')}/${TOTAL_CARDS}` : `--/${TOTAL_CARDS}`;
}

/**
 * Chemin de l'illustration d'une carte, ou null si elle n'existe pas encore.
 *
 * Les visuels vivent dans `public/cartes/<id>.webp` et sont facultatifs : tant
 * qu'un fichier manque, la carte retombe sur son glyphe. On peut donc livrer
 * les 24 illustrations au fur et à mesure, sans jamais casser l'affichage.
 *
 * Le chemin n'est pas déduit de l'identifiant mais lu dans un index généré par
 * `npm run cartes` : sans lui, chaque carte sans visuel déclencherait une
 * requête vouée à un 404 à chaque affichage.
 *
 * Voir `docs/DIRECTION-ARTISTIQUE.md` pour le gabarit et les prompts.
 */
export function cardArt(id: string): string | null {
  return CARD_ART[id] ?? null;
}

/** Traitement de foil appliqué à chaque rareté. */
export const FOIL: Record<Rarity, 'none' | 'satin' | 'linear' | 'cross' | 'cosmos' | 'gold'> = {
  C: 'none',
  PC: 'satin',
  R: 'linear',
  SR: 'cross',
  UR: 'cosmos',
  L: 'gold',
};

/** Retourne la définition d'une carte, ou null si l'identifiant est inconnu. */
export function getCard(id: string): CardDefinition | null {
  return CARD_INDEX.get(id) ?? null;
}

/** Cartes d'une famille, triées de la commune à la légendaire. */
export function cardsOfTheme(theme: ThemeId): CardDefinition[] {
  return CARDS.filter((c) => c.theme === theme).sort(
    (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity],
  );
}

/** Toutes les cartes d'une rareté donnée. */
export function cardsOfRarity(rarity: Rarity): CardDefinition[] {
  return CARDS.filter((c) => c.rarity === rarity);
}

/**
 * Quatre boosters. Le prix ne fait pas qu'acheter des cartes : il achète une
 * courbe de raretés plus favorable et une garantie plus haute. Un joueur qui
 * économise pour un Solstice sait exactement ce qu'il paie.
 */
export const BOOSTERS: readonly BoosterDefinition[] = [
  {
    id: 'givre',
    name: 'Givre',
    tagline: 'L’entrée en matière',
    glyph: '❄',
    gradient: ['#2b4a63', '#0e1c2a'],
    price: 150,
    slots: { collection: 2, effet: 1 },
    guaranteed: null,
    weights: RARITY_WEIGHTS_BASE,
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    tagline: 'Une rare garantie',
    glyph: '🌨',
    gradient: ['#2f6f8f', '#10283a'],
    price: 450,
    slots: { collection: 3, effet: 2 },
    guaranteed: 'R',
    weights: { C: 62_000, PC: 26_000, R: 10_000, SR: 1_700, UR: 260, L: 40 },
  },
  {
    id: 'aurore',
    name: 'Aurore',
    tagline: 'Une super rare garantie',
    glyph: '🌌',
    gradient: ['#6b4bab', '#241540'],
    price: 1_200,
    slots: { collection: 3, effet: 2 },
    guaranteed: 'SR',
    weights: { C: 45_000, PC: 33_000, R: 17_000, SR: 4_200, UR: 720, L: 80 },
  },
  {
    id: 'solstice',
    name: 'Solstice',
    tagline: 'Une ultra rare garantie',
    glyph: '🎁',
    gradient: ['#b07a2a', '#3d2708'],
    price: 3_000,
    // Le sachet le plus cher donne plus de cartes jouables, pas seulement des
    // raretés plus hautes : c'est ce qu'on achète.
    slots: { collection: 2, effet: 3 },
    guaranteed: 'UR',
    weights: { C: 26_000, PC: 36_000, R: 27_000, SR: 9_000, UR: 1_800, L: 200 },
  },
];

/** Nombre total de cartes d'un booster, toutes natures confondues. */
export function boosterSize(booster: BoosterDefinition): number {
  return booster.slots.collection + booster.slots.effet;
}

const BOOSTER_INDEX = new Map(BOOSTERS.map((b) => [b.id, b]));

export function getBooster(id: string): BoosterDefinition | null {
  return BOOSTER_INDEX.get(id) ?? null;
}

/**
 * Cote de référence d'une carte, en flocons. Sert de prix suggéré quand aucune
 * vente n'a encore eu lieu — sans repère, les premières mises en vente partent
 * au hasard et faussent durablement la courbe.
 */
export function referencePrice(rarity: Rarity): number {
  return { C: 40, PC: 120, R: 500, SR: 2_000, UR: 8_000, L: 40_000 }[rarity];
}
