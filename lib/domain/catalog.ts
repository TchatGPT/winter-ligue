/**
 * Catalogue figé de la saison : raretés, 24 cartes, 4 packs.
 *
 * C'est la source de vérité. Le client reçoit ce catalogue pour l'affichage,
 * mais toute résolution d'effet relit ces définitions côté serveur : une carte
 * envoyée par le navigateur n'est qu'un identifiant, jamais un effet.
 */

import { BOOSTER_ART, CARD_ART } from './card-art.generated';
import { RARITY_ORDER, RARITY_WEIGHTS_BASE } from './rules';
import type { CardDefinition, CardEffect, PackDefinition, PackId, Rarity } from './types';

/**
 * Palette de raretés : froide pour le banal, chaude pour le convoité. Sur un
 * fond de nuit polaire, les cartes rares « chauffent » — on repère une
 * légendaire dans un rail sans lire une seule étiquette.
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

/**
 * 24 cartes, quatre par rareté. Toutes s'appliquent à la **prochaine game** de
 * qui les reçoit, puis disparaissent.
 *
 * Le plafond d'impact est fixé à 25 points, soit une bonne game. Un test le
 * vérifie carte par carte, au pire cas.
 *
 * Trois règles structurent les malus :
 *   — aucun dans le pack Perso ni le pack Finisseur : ce qu'on ouvre pour soi
 *     ne peut pas se retourner contre soi ;
 *   — un malus tombe sur un joueur tiré au sort ou sur la tête du classement,
 *     jamais sur quelqu'un que quelqu'un aurait choisi ;
 *   — un malus retire des points, il n'en donne jamais à personne.
 *
 * Les cartes **à deux** sont la seule exception assumée : un échange de kills
 * ou un duel met face à face deux joueurs tirés au sort, et ce que l'un gagne,
 * l'autre le perd. C'est borné à `CARD_IMPACT_CAP` de chaque côté, et ça ne
 * sort que du pack Commu — celui que le chat déclenche pour animer la ligue.
 */
export const CARDS: readonly CardDefinition[] = [
  /* ================================ Communes ============================== */
  {
    id: 'congere',
    name: 'Congère',
    subtitle: 'Ce qui s’accumule reste',
    rarity: 'C',
    glyph: '🌨',
    description: '+4 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 4 },
    nature: 'bonus',
    power: 10,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'rafale',
    name: 'Rafale',
    subtitle: 'Chaque coup compte',
    rarity: 'C',
    glyph: '🍃',
    description: '+1 point par kill sur ta prochaine game, jusqu’à +8.',
    effect: { kind: 'points_per_kill', perKill: 1, cap: 8 },
    nature: 'bonus',
    power: 16,
    packs: ['perso', 'finisseur'],
    cible: 'TOUS',
  },
  {
    id: 'etincelle',
    name: 'Étincelle',
    subtitle: 'Une lueur',
    rarity: 'C',
    glyph: '✦',
    description: '80 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 80 },
    nature: 'bonus',
    power: 12,
    packs: ['perso', 'commu'],
    cible: 'HASARD',
  },
  {
    id: 'filet',
    name: 'Filet de Neige',
    subtitle: 'Une chute amortie',
    rarity: 'C',
    glyph: '🕸',
    description: 'Ta prochaine game vaut au moins 10 points.',
    effect: { kind: 'plancher', value: 10 },
    nature: 'bonus',
    power: 20,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },

  /* ============================== Peu communes ============================ */
  {
    id: 'vent-du-nord',
    name: 'Vent du Nord',
    subtitle: 'Le vent tourne',
    rarity: 'PC',
    glyph: '💨',
    description: 'Multiplie par 1,25 les kills de ta prochaine game, jusqu’à +10 points.',
    effect: { kind: 'kill_multiplier', value: 1.25, cap: 10 },
    nature: 'bonus',
    power: 34,
    packs: ['perso', 'finisseur'],
    cible: 'TOUS',
  },
  {
    id: 'etoile-polaire',
    name: 'Étoile Polaire',
    subtitle: 'Le cap au nord',
    rarity: 'PC',
    glyph: '⭐',
    description: '250 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 250 },
    nature: 'bonus',
    power: 28,
    packs: ['perso', 'commu'],
    cible: 'HASARD',
  },
  {
    id: 'manne',
    name: 'Manne',
    subtitle: 'Jouer rapporte double',
    rarity: 'PC',
    glyph: '💠',
    description: 'Les flocons de ta prochaine game sont doublés.',
    effect: { kind: 'flocons_doubles' },
    nature: 'bonus',
    power: 30,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'givre-mordant',
    name: 'Givre Mordant',
    subtitle: 'Une morsure légère',
    rarity: 'PC',
    glyph: '🥶',
    description: 'MALUS : un joueur tiré au sort perd 6 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 6 },
    nature: 'malus',
    power: 36,
    packs: ['commu'],
    cible: 'HASARD',
  },

  /* ================================= Rares ================================ */
  {
    id: 'percee',
    name: 'Percée',
    subtitle: 'Récompense les gros scores',
    rarity: 'R',
    glyph: '⚔',
    description: '+2 points par kill sur ta prochaine game, jusqu’à +14.',
    effect: { kind: 'points_per_kill', perKill: 2, cap: 14 },
    nature: 'bonus',
    power: 52,
    packs: ['perso', 'finisseur'],
    cible: 'TOUS',
  },
  {
    id: 'poudreuse',
    name: 'Poudreuse',
    subtitle: 'Un tapis frais',
    rarity: 'R',
    glyph: '❄',
    description: '+12 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 12 },
    nature: 'bonus',
    power: 48,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'pluie-de-flocons',
    name: 'Pluie de Flocons',
    subtitle: 'La caisse se remplit',
    rarity: 'R',
    glyph: '🌧',
    description: '600 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 600 },
    nature: 'bonus',
    power: 44,
    packs: ['perso', 'commu', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'chasse-croise',
    name: 'Chassé-Croisé',
    subtitle: 'Deux games qui se croisent',
    rarity: 'R',
    glyph: '🔁',
    description:
      'Deux joueurs tirés au sort échangent les kills de leur prochaine game, jusqu’à 25 points de part et d’autre.',
    effect: { kind: 'echange_kills', cap: 25 },
    nature: 'malus',
    power: 58,
    packs: ['commu'],
    cible: 'DEUX',
  },
  {
    id: 'contre-courant',
    name: 'Contre-Courant',
    subtitle: 'Le contre-jeu',
    rarity: 'R',
    glyph: '🌀',
    description: 'MALUS : un joueur tiré au sort perd 10 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 10 },
    nature: 'malus',
    power: 56,
    packs: ['commu', 'folie'],
    cible: 'HASARD',
  },

  /* =============================== Super rares ============================ */
  {
    id: 'blizzard',
    name: 'Blizzard',
    subtitle: 'On n’y voit plus rien',
    rarity: 'SR',
    glyph: '🌪',
    description: 'Multiplie par 1,5 les kills de ta prochaine game, jusqu’à +18 points.',
    effect: { kind: 'kill_multiplier', value: 1.5, cap: 18 },
    nature: 'bonus',
    power: 70,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'sang-froid',
    name: 'Sang-Froid',
    subtitle: 'La place avant les frags',
    rarity: 'SR',
    glyph: '🧊',
    description:
      'Les points de classement de ta prochaine game comptent double. Un Top 1 passe de 20 à 40.',
    effect: { kind: 'double_placement' },
    nature: 'bonus',
    power: 68,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'socle',
    name: 'Socle de Glace',
    subtitle: 'Rien ne descend plus bas',
    rarity: 'SR',
    glyph: '🧱',
    description: 'Ta prochaine game vaut au moins 20 points.',
    effect: { kind: 'plancher', value: 20 },
    nature: 'bonus',
    power: 64,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'duel-de-glace',
    name: 'Duel de Glace',
    subtitle: 'Face à face',
    rarity: 'SR',
    glyph: '⚔',
    description:
      'Deux joueurs tirés au sort : celui dont la prochaine game vaut le plus gagne 15 points, l’autre en perd 10.',
    effect: { kind: 'duel', gain: 15, perte: 10 },
    nature: 'malus',
    power: 72,
    packs: ['commu', 'folie'],
    cible: 'DEUX',
  },
  {
    id: 'traineau-perce',
    name: 'Traîneau Percé',
    subtitle: 'Ça fuit de partout',
    rarity: 'SR',
    glyph: '🛷',
    description: 'MALUS : le premier du classement perd 12 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 12 },
    nature: 'malus',
    power: 74,
    packs: ['commu', 'folie'],
    cible: 'TETE',
  },

  /* =============================== Ultra rares ============================ */
  {
    id: 'rempart-polaire',
    name: 'Rempart Polaire',
    subtitle: 'Un mur de glace',
    rarity: 'UR',
    glyph: '🏰',
    description: '+22 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 22 },
    nature: 'bonus',
    power: 84,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'nuit-polaire',
    name: 'Nuit Polaire',
    subtitle: 'Le grand multiplicateur',
    rarity: 'UR',
    glyph: '🌑',
    description: 'Multiplie par 1,8 les kills de ta prochaine game, jusqu’à +25 points.',
    effect: { kind: 'kill_multiplier', value: 1.8, cap: 25 },
    nature: 'bonus',
    power: 86,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'aurore-boreale',
    name: 'Aurore Boréale',
    subtitle: 'Le ciel s’embrase',
    rarity: 'UR',
    glyph: '🌌',
    description: '2 500 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 2500 },
    nature: 'bonus',
    power: 80,
    packs: ['perso', 'commu', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'tempete-de-verglas',
    name: 'Tempête de Verglas',
    subtitle: 'Tout se fissure',
    rarity: 'UR',
    glyph: '🌩',
    description: 'MALUS : le premier du classement perd 18 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 18 },
    nature: 'malus',
    power: 88,
    packs: ['folie'],
    cible: 'TETE',
  },

  /* ============================== Légendaires ============================= */
  {
    id: 'sanctuaire',
    name: 'Sanctuaire',
    subtitle: 'Le socle ne bouge plus',
    rarity: 'L',
    glyph: '🏔',
    description: 'Ta prochaine game vaut au moins 25 points.',
    effect: { kind: 'plancher', value: 25 },
    nature: 'bonus',
    power: 92,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'etoile-du-nord',
    name: 'Étoile du Nord',
    subtitle: 'Celle qui guide',
    rarity: 'L',
    glyph: '🌟',
    description: '+25 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 25 },
    nature: 'bonus',
    power: 96,
    packs: ['perso', 'commu', 'finisseur', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'grand-nord',
    name: 'Grand Nord',
    subtitle: 'Le double',
    rarity: 'L',
    glyph: '🧭',
    description: 'Multiplie par 2 les kills de ta prochaine game, jusqu’à +25 points.',
    effect: { kind: 'kill_multiplier', value: 2, cap: 25 },
    nature: 'bonus',
    power: 100,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'grand-froid',
    name: 'Grand Froid',
    subtitle: 'Plus un geste',
    rarity: 'L',
    glyph: '☠',
    description: 'MALUS : le premier du classement perd 25 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 25 },
    nature: 'malus',
    power: 98,
    packs: ['folie'],
    cible: 'TETE',
  },
];

const CARD_INDEX = new Map(CARDS.map((c) => [c.id, c]));

/**
 * L'effet d'une carte en trois mots, pour une pastille : « +4 pts »,
 * « kills ×1,25, max +10 ». La description complète reste sur la carte ; ceci
 * est ce qu'on lit dans un classement, à côté d'un pseudo.
 */
export function resumeEffet(effect: CardEffect): string {
  const fr = (n: number) => n.toLocaleString('fr-FR');
  switch (effect.kind) {
    case 'bonus_points':
      return `+${effect.value} pts`;
    case 'kill_multiplier':
      return `kills ×${fr(effect.value)}, max +${effect.cap}`;
    case 'points_per_kill':
      return `+${effect.perKill} par kill, max +${effect.cap}`;
    case 'double_placement':
      return 'Top 1/2/3 compté double';
    case 'plancher':
      return `au moins ${effect.value} pts`;
    case 'snowflakes':
      return `+${fr(effect.value)} ❄`;
    case 'flocons_doubles':
      return 'flocons ×2';
    case 'malus_points':
      return `−${effect.value} pts`;
    case 'echange_kills':
      return `échange de kills, max ${effect.cap}`;
    case 'duel':
      return `duel : +${effect.gain} ou −${effect.perte}`;
  }
}

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
 * qu'un fichier manque, la carte retombe sur son glyphe. Le chemin est lu dans
 * un index généré par `npm run cartes` : sans lui, chaque carte sans visuel
 * déclencherait une requête vouée à un 404 à chaque affichage.
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

/** Toutes les cartes d'une rareté donnée, dans l'ordre du catalogue. */
export function cardsOfRarity(rarity: Rarity): CardDefinition[] {
  return CARDS.filter((c) => c.rarity === rarity);
}

/** Le catalogue trié de la commune à la légendaire. */
export function cardsByRarity(): CardDefinition[] {
  return [...CARDS].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
}

/** Les cartes qu'un pack peut donner, dans l'ordre du catalogue. */
export function cartesDuPack(packId: PackId): CardDefinition[] {
  return CARDS.filter((c) => c.packs.includes(packId));
}

/** Les cartes d'un pack, indexées par rareté. C'est le pool du tirage. */
export function poolDuPack(packId: PackId): Record<Rarity, string[]> {
  const pool = { C: [], PC: [], R: [], SR: [], UR: [], L: [] } as Record<Rarity, string[]>;
  for (const card of cartesDuPack(packId)) pool[card.rarity].push(card.id);
  return pool;
}

/**
 * Quatre packs, **une carte chacun**.
 *
 * Aucun ne s'achète. Chacun a son déclencheur, et c'est la streameuse qui
 * l'ouvre, à l'antenne. Le Perso et le Finisseur sont pour un joueur désigné ;
 * le Commu tombe sur un joueur au hasard, ou deux quand la carte les oppose ;
 * le Folie tombe sur toute la ligue. La table de raretés est ce qui distingue
 * un pack d'un autre : le Perso tire aux taux de base, le Finisseur
 * récompense ceux qui ont joué toute leur saison, le Folie ne contient rien en
 * dessous de rare.
 */
export const PACKS: readonly PackDefinition[] = [
  {
    id: 'perso',
    name: 'Booster Perso',
    tagline: 'Cinq subs, une carte pour toi',
    declencheur: 'Chaque fois qu’un joueur offre cinq subs.',
    glyph: '🎁',
    gradient: ['#2b4a63', '#0e1c2a'],
    portee: 'JOUEUR',
    pourQui: 'un joueur',
    weights: RARITY_WEIGHTS_BASE,
  },
  {
    id: 'commu',
    name: 'Booster Commu',
    tagline: 'Le sort désigne qui',
    declencheur: 'Tous les cinquante subs de la saison.',
    glyph: '📣',
    gradient: ['#2f6f8f', '#10283a'],
    portee: 'TOUS',
    pourQui: 'un ou deux joueurs au hasard',
    weights: { C: 40_000, PC: 30_000, R: 20_000, SR: 7_000, UR: 2_400, L: 600 },
  },
  {
    id: 'folie',
    name: 'Booster Folie',
    tagline: 'Rien en dessous de rare',
    declencheur: 'Tous les cinq cents subs de la saison.',
    glyph: '🌪',
    gradient: ['#6b4bab', '#241540'],
    portee: 'TOUS',
    pourQui: 'toute la ligue',
    weights: { C: 0, PC: 0, R: 40_000, SR: 35_000, UR: 20_000, L: 5_000 },
  },
  {
    id: 'finisseur',
    name: 'Booster Finisseur',
    tagline: 'Pour qui va au bout',
    declencheur: 'Quand un joueur a joué toutes ses games de la saison.',
    glyph: '🏁',
    gradient: ['#b07a2a', '#3d2708'],
    portee: 'JOUEUR',
    pourQui: 'un joueur',
    weights: { C: 20_000, PC: 30_000, R: 28_000, SR: 15_000, UR: 5_500, L: 1_500 },
  },
];

const PACK_INDEX = new Map(PACKS.map((p) => [p.id, p]));

/**
 * La planche peinte de chaque pack.
 *
 * Les quatre planches ont été peintes pour les anciens sachets, et elles
 * restent justes : une par teinte. Le Perso reprend le bleu du Givre, le Commu
 * le bleu clair du Blizzard, le Folie le violet du Hors-Piste, le Finisseur
 * l'ambre de l'Everest. Un pack sans planche retombe sur le sachet dessiné.
 */
const PLANCHE_DU_PACK: Record<PackId, string> = {
  perso: 'givre',
  commu: 'blizzard',
  folie: 'aurore',
  finisseur: 'solstice',
};

export function packArt(id: string): string | null {
  const planche = PLANCHE_DU_PACK[id as PackId];
  return planche ? (BOOSTER_ART[planche] ?? null) : null;
}

/** La rareté qui donne sa couleur au halo du sachet : la plus haute qu'il promet vraiment. */
export const GEMME_DU_PACK: Record<PackId, Rarity> = {
  perso: 'PC',
  commu: 'R',
  folie: 'L',
  finisseur: 'UR',
};

export function getPack(id: string): PackDefinition | null {
  return PACK_INDEX.get(id as PackId) ?? null;
}
