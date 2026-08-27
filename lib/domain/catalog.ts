/**
 * Catalogue figé de la saison : cartes, familles, boosters, raretés.
 *
 * C'est la source de vérité. Le client reçoit ce catalogue pour l'affichage,
 * mais toute résolution d'effet relit ces définitions côté serveur : une carte
 * envoyée par le navigateur n'est qu'un identifiant, jamais un effet.
 */

import type {
  BoosterDefinition,
  CardDefinition,
  Rarity,
  ThemeDefinition,
  ThemeId,
} from './types';

export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; glow: string; order: number }
> = {
  COMMUNE: { label: 'Commune', color: '#8fa3bd', glow: 'rgba(143,163,189,0.35)', order: 0 },
  RARE: { label: 'Rare', color: '#4cc4f0', glow: 'rgba(76,196,240,0.45)', order: 1 },
  EPIQUE: { label: 'Épique', color: '#b18cff', glow: 'rgba(177,140,255,0.5)', order: 2 },
  LEGENDAIRE: { label: 'Légendaire', color: '#e8c46a', glow: 'rgba(232,196,106,0.55)', order: 3 },
};

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  glace: {
    id: 'glace',
    name: 'Glace Éternelle',
    tagline: 'Verrouiller ce qui est acquis',
    glyph: '❄',
    color: '#7fd8ff',
    setBonusLabel: '+1 emplacement de main (7 cartes au lieu de 6)',
  },
  tempete: {
    id: 'tempete',
    name: 'Tempête',
    tagline: 'Multiplier la casse',
    glyph: '🌪',
    color: '#6ee7c7',
    setBonusLabel: '+5 % de kills sur toutes tes games, en permanence',
  },
  aurore: {
    id: 'aurore',
    name: 'Aurore Boréale',
    tagline: 'Points et flocons',
    glyph: '🌌',
    color: '#b18cff',
    setBonusLabel: '+15 flocons à chaque game enregistrée',
  },
  solstice: {
    id: 'solstice',
    name: 'Solstice',
    tagline: 'Le chaos et les malus',
    glyph: '🎁',
    color: '#e8c46a',
    setBonusLabel: '−15 % en boutique et −50 % de taxe à l’hôtel des ventes',
  },
};

/**
 * 16 cartes : 4 familles × 4 raretés. Compléter une famille (posséder ses
 * 4 cartes au moins une fois) débloque son bonus permanent.
 */
export const CARDS: readonly CardDefinition[] = [
  /* ---------------------------- GLACE : défense --------------------------- */
  {
    id: 'bouclier-givre',
    name: 'Bouclier de Givre',
    theme: 'glace',
    rarity: 'COMMUNE',
    glyph: '🛡',
    description: 'Immunise ton profil contre tous les malus adverses pendant 24 heures.',
    target: 'none',
    effect: { kind: 'shield', hours: 24 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'gel-eternel',
    name: 'Gel Éternel',
    theme: 'glace',
    rarity: 'RARE',
    glyph: '❅',
    description: 'Gèle une de tes games : son score est verrouillé et insensible aux malus.',
    target: 'own_game',
    effect: { kind: 'freeze_game' },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'banquise',
    name: 'Banquise',
    theme: 'glace',
    rarity: 'EPIQUE',
    glyph: '🧊',
    description: 'Gèle ta meilleure game et lui ajoute +15 points.',
    target: 'own_best_game',
    effect: { kind: 'freeze_best_game', bonusPoints: 15 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'hiver-sans-fin',
    name: 'Hiver Sans Fin',
    theme: 'glace',
    rarity: 'LEGENDAIRE',
    glyph: '🏔',
    description: 'Gèle toutes tes games déjà enregistrées. Les suivantes restent vulnérables.',
    target: 'none',
    effect: { kind: 'freeze_all_games' },
    nature: 'bonus',
    offensive: false,
  },

  /* ------------------------ TEMPÊTE : multiplicateurs --------------------- */
  {
    id: 'vent-du-nord',
    name: 'Vent du Nord',
    theme: 'tempete',
    rarity: 'COMMUNE',
    glyph: '🍃',
    description: 'Multiplie par 1,3 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.3 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    theme: 'tempete',
    rarity: 'RARE',
    glyph: '🌬',
    description: 'Multiplie par 1,5 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.5 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'oeil-du-cyclone',
    name: 'Œil du Cyclone',
    theme: 'tempete',
    rarity: 'EPIQUE',
    glyph: '🌀',
    description: 'Multiplie par 1,8 les kills d’une de tes games.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 1.8 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'nuit-polaire',
    name: 'Nuit Polaire',
    theme: 'tempete',
    rarity: 'LEGENDAIRE',
    glyph: '🌑',
    description:
      'Multiplie par 2,5 les kills d’une de tes games. Le plus gros multiplicateur de la saison.',
    target: 'own_game',
    effect: { kind: 'multiplier', value: 2.5 },
    nature: 'bonus',
    offensive: false,
  },

  /* --------------------- AURORE : points et économie ---------------------- */
  {
    id: 'etoile-polaire',
    name: 'Étoile Polaire',
    theme: 'aurore',
    rarity: 'COMMUNE',
    glyph: '⭐',
    description: 'Ajoute +10 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 10 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'pluie-de-flocons',
    name: 'Pluie de Flocons',
    theme: 'aurore',
    rarity: 'RARE',
    glyph: '🌨',
    description: 'Crédite immédiatement 250 flocons sur ton compte.',
    target: 'none',
    effect: { kind: 'snowflakes', value: 250 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'couronne-polaire',
    name: 'Couronne Polaire',
    theme: 'aurore',
    rarity: 'EPIQUE',
    glyph: '👑',
    description: 'Ajoute +40 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 40 },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'aurore-boreale',
    name: 'Aurore Boréale',
    theme: 'aurore',
    rarity: 'LEGENDAIRE',
    glyph: '🌌',
    description: 'Ajoute +80 points à une de tes games.',
    target: 'own_game',
    effect: { kind: 'bonus_points', value: 80 },
    nature: 'bonus',
    offensive: false,
  },

  /* ---------------------- SOLSTICE : chaos et malus ----------------------- */
  {
    id: 'boule-de-neige',
    name: 'Boule de Neige',
    theme: 'solstice',
    rarity: 'COMMUNE',
    glyph: '⛄',
    description: 'Supprime définitivement ta pire game comptabilisée.',
    target: 'own_worst_game',
    effect: { kind: 'delete_worst_game' },
    nature: 'bonus',
    offensive: false,
  },
  {
    id: 'traineau-perce',
    name: 'Traîneau Percé',
    theme: 'solstice',
    rarity: 'RARE',
    glyph: '🛷',
    description: 'MALUS : retire 25 points à la meilleure game d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'steal_points', value: 25 },
    nature: 'malus',
    offensive: true,
  },
  {
    id: 'vol-de-traineau',
    name: 'Vol de Traîneau',
    theme: 'solstice',
    rarity: 'EPIQUE',
    glyph: '🎿',
    description:
      'MALUS : échange une de tes games au hasard avec une game au hasard d’un adversaire.',
    target: 'opponent',
    effect: { kind: 'swap_random_game' },
    nature: 'malus',
    offensive: true,
  },
  {
    id: 'grand-froid',
    name: 'Grand Froid',
    theme: 'solstice',
    rarity: 'LEGENDAIRE',
    glyph: '🥶',
    description: 'MALUS : copie la meilleure game d’un adversaire dans ton propre palmarès.',
    target: 'opponent',
    effect: { kind: 'copy_best_game' },
    nature: 'malus',
    offensive: true,
  },
];

const CARD_INDEX = new Map(CARDS.map((c) => [c.id, c]));

/** Retourne la définition d'une carte, ou null si l'identifiant est inconnu. */
export function getCard(id: string): CardDefinition | null {
  return CARD_INDEX.get(id) ?? null;
}

/** Cartes d'une famille, triées de la commune à la légendaire. */
export function cardsOfTheme(theme: ThemeId): CardDefinition[] {
  return CARDS.filter((c) => c.theme === theme).sort(
    (a, b) => RARITY_META[a.rarity].order - RARITY_META[b.rarity].order,
  );
}

export const BOOSTERS: readonly BoosterDefinition[] = [
  {
    id: 'givre',
    name: 'Booster Givre',
    tagline: 'L’entrée en matière',
    glyph: '❄',
    price: 150,
    cardCount: 3,
    guaranteed: null,
    weights: { COMMUNE: 740, RARE: 220, EPIQUE: 35, LEGENDAIRE: 5 },
  },
  {
    id: 'blizzard',
    name: 'Booster Blizzard',
    tagline: 'Une rare garantie',
    glyph: '🌬',
    price: 400,
    cardCount: 4,
    guaranteed: 'RARE',
    weights: { COMMUNE: 600, RARE: 320, EPIQUE: 70, LEGENDAIRE: 10 },
  },
  {
    id: 'aurore',
    name: 'Booster Aurore',
    tagline: 'Une épique garantie',
    glyph: '🌌',
    price: 900,
    cardCount: 5,
    guaranteed: 'EPIQUE',
    weights: { COMMUNE: 450, RARE: 380, EPIQUE: 140, LEGENDAIRE: 30 },
  },
  {
    id: 'solstice',
    name: 'Booster Solstice',
    tagline: 'Une légendaire garantie',
    glyph: '🎁',
    price: 2200,
    cardCount: 5,
    guaranteed: 'LEGENDAIRE',
    weights: { COMMUNE: 300, RARE: 420, EPIQUE: 210, LEGENDAIRE: 70 },
  },
];

const BOOSTER_INDEX = new Map(BOOSTERS.map((b) => [b.id, b]));

export function getBooster(id: string): BoosterDefinition | null {
  return BOOSTER_INDEX.get(id) ?? null;
}
