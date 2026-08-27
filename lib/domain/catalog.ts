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
 * 24 cartes : 4 familles × 6 raretés. Chaque famille suit la même montée en
 * puissance, ce qui rend le catalogue lisible d'un coup d'œil et le rééquilibrage
 * mécanique : une carte se compare toujours à ses trois homologues de rareté.
 */
export const CARDS: readonly CardDefinition[] = [
  /* ======================= GLACE — défense, verrouillage ================== */
  {
    id: 'flocon-protecteur',
    name: 'Flocon Protecteur',
    subtitle: 'Le premier rempart',
    theme: 'glace',
    rarity: 'C',
    glyph: '❄',
    description: 'Ajoute +5 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 5 },
    nature: 'bonus',
    offensive: false,
    power: 12,
  },
  {
    id: 'bouclier-givre',
    name: 'Bouclier de Givre',
    subtitle: 'Intouchable une nuit',
    theme: 'glace',
    rarity: 'PC',
    glyph: '🛡',
    description: 'Immunise ton profil contre tous les malus adverses pendant 12 heures.',
    target: 'none',
    effect: { kind: 'shield', hours: 12 },
    nature: 'bonus',
    offensive: false,
    power: 34,
  },
  {
    id: 'gel-eternel',
    name: 'Gel Éternel',
    subtitle: 'Ce qui est pris est pris',
    theme: 'glace',
    rarity: 'R',
    glyph: '❅',
    description: 'Gèle une de tes games : son score est verrouillé et insensible aux malus.',
    target: 'own_game',
    effect: { kind: 'freeze_game' },
    nature: 'bonus',
    offensive: false,
    power: 52,
  },
  {
    id: 'banquise',
    name: 'Banquise',
    subtitle: 'Ta meilleure, pour de bon',
    theme: 'glace',
    rarity: 'SR',
    glyph: '🧊',
    description: 'Gèle ta meilleure game et lui ajoute +15 points.',
    target: 'own_best_game',
    effect: { kind: 'freeze_best_game', bonusPoints: 15 },
    nature: 'bonus',
    offensive: false,
    power: 71,
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
    power: 88,
  },
  {
    id: 'hiver-sans-fin',
    name: 'Hiver Sans Fin',
    subtitle: 'Tout se fige',
    theme: 'glace',
    rarity: 'L',
    glyph: '🏔',
    description:
      'Gèle toutes tes games déjà enregistrées. Les suivantes restent vulnérables.',
    target: 'none',
    effect: { kind: 'freeze_all_games' },
    nature: 'bonus',
    offensive: false,
    power: 97,
  },

  /* ====================== TEMPÊTE — multiplicateurs ====================== */
  {
    id: 'brise-glacee',
    name: 'Brise Glacée',
    subtitle: 'Un souffle, pas plus',
    theme: 'tempete',
    rarity: 'C',
    glyph: '🍃',
    description: 'Multiplie par 1,15 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.15 },
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
    glyph: '🌬',
    description: 'Multiplie par 1,3 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.3 },
    nature: 'bonus',
    offensive: false,
    power: 33,
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    subtitle: 'On n’y voit plus rien',
    theme: 'tempete',
    rarity: 'R',
    glyph: '🌨',
    description: 'Multiplie par 1,5 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.5 },
    nature: 'bonus',
    offensive: false,
    power: 55,
  },
  {
    id: 'oeil-du-cyclone',
    name: 'Œil du Cyclone',
    subtitle: 'Le calme au centre',
    theme: 'tempete',
    rarity: 'SR',
    glyph: '🌀',
    description: 'Multiplie par 1,8 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.8 },
    nature: 'bonus',
    offensive: false,
    power: 74,
  },
  {
    id: 'tempete-blanche',
    name: 'Tempête Blanche',
    subtitle: 'Plus rien ne tient',
    theme: 'tempete',
    rarity: 'UR',
    glyph: '💨',
    description: 'Multiplie par 2,2 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 2.2 },
    nature: 'bonus',
    offensive: false,
    power: 90,
  },
  {
    id: 'nuit-polaire',
    name: 'Nuit Polaire',
    subtitle: 'Le plus gros multiplicateur',
    theme: 'tempete',
    rarity: 'L',
    glyph: '🌑',
    description:
      'Multiplie par 2,5 les kills d’une de tes games. Rien ne frappe plus fort de la saison.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 2.5 },
    nature: 'bonus',
    offensive: false,
    power: 100,
  },

  /* ==================== AURORE — points et économie ====================== */
  {
    id: 'etincelle',
    name: 'Étincelle',
    subtitle: 'Une lueur',
    theme: 'aurore',
    rarity: 'C',
    glyph: '✦',
    description: 'Crédite immédiatement 60 flocons sur ton compte.',
    target: 'none',
    effect: { kind: 'snowflakes', value: 60 },
    nature: 'bonus',
    offensive: false,
    power: 14,
  },
  {
    id: 'etoile-polaire',
    name: 'Étoile Polaire',
    subtitle: 'Le cap au nord',
    theme: 'aurore',
    rarity: 'PC',
    glyph: '⭐',
    description: 'Ajoute +10 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 10 },
    nature: 'bonus',
    offensive: false,
    power: 31,
  },
  {
    id: 'pluie-de-flocons',
    name: 'Pluie de Flocons',
    subtitle: 'La caisse se remplit',
    theme: 'aurore',
    rarity: 'R',
    glyph: '🌧',
    description: 'Crédite immédiatement 250 flocons sur ton compte.',
    target: 'none',
    effect: { kind: 'snowflakes', value: 250 },
    nature: 'bonus',
    offensive: false,
    power: 50,
  },
  {
    id: 'couronne-polaire',
    name: 'Couronne Polaire',
    subtitle: 'Le sacre',
    theme: 'aurore',
    rarity: 'SR',
    glyph: '👑',
    description: 'Ajoute +40 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 40 },
    nature: 'bonus',
    offensive: false,
    power: 76,
  },
  {
    id: 'voile-daurore',
    name: 'Voile d’Aurore',
    subtitle: 'Points et flocons',
    theme: 'aurore',
    rarity: 'UR',
    glyph: '🎇',
    description: 'Ajoute +60 points à une de tes games et crédite 300 flocons.',
    target: 'own_game',
    effect: { kind: 'points_and_snowflakes', points: 60, snowflakes: 300 },
    nature: 'bonus',
    offensive: false,
    power: 89,
  },
  {
    id: 'aurore-boreale',
    name: 'Aurore Boréale',
    subtitle: 'Le ciel s’embrase',
    theme: 'aurore',
    rarity: 'L',
    glyph: '🌌',
    description: 'Ajoute +100 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 100 },
    nature: 'bonus',
    offensive: false,
    power: 98,
  },

  /* ==================== SOLSTICE — chaos et malus ======================== */
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
    description: 'MALUS : retire 10 points à la meilleure game d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'steal_points', value: 10 },
    nature: 'malus',
    offensive: true,
    power: 36,
  },
  {
    id: 'traineau-perce',
    name: 'Traîneau Percé',
    subtitle: 'Ça fuit de partout',
    theme: 'solstice',
    rarity: 'R',
    glyph: '🛷',
    description: 'MALUS : retire 25 points à la meilleure game d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'steal_points', value: 25 },
    nature: 'malus',
    offensive: true,
    power: 58,
  },
  {
    id: 'vol-de-traineau',
    name: 'Vol de Traîneau',
    subtitle: 'On échange, de force',
    theme: 'solstice',
    rarity: 'SR',
    glyph: '🎿',
    description:
      'MALUS : échange une de tes games au hasard avec une game au hasard d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'swap_random_game' },
    nature: 'malus',
    offensive: true,
    power: 78,
  },
  {
    id: 'tempete-de-verglas',
    name: 'Tempête de Verglas',
    subtitle: 'La chute est brutale',
    theme: 'solstice',
    rarity: 'UR',
    glyph: '🌩',
    description: 'MALUS : retire 50 points à la meilleure game d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'steal_points', value: 50 },
    nature: 'malus',
    offensive: true,
    power: 91,
  },
  {
    id: 'grand-froid',
    name: 'Grand Froid',
    subtitle: 'Sa meilleure devient la tienne',
    theme: 'solstice',
    rarity: 'L',
    glyph: '☠',
    description: 'MALUS : copie la meilleure game d’un adversaire dans ton propre palmarès.',
    target: 'opponent',
    effect: { kind: 'copy_best_game' },
    nature: 'malus',
    offensive: true,
    power: 99,
  },
];

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
    cardCount: 3,
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
    cardCount: 5,
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
    cardCount: 5,
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
    cardCount: 5,
    guaranteed: 'UR',
    weights: { C: 26_000, PC: 36_000, R: 27_000, SR: 9_000, UR: 1_800, L: 200 },
  },
];

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
