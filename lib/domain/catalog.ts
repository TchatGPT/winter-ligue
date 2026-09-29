/**
 * Catalogue figé de la saison : les raretés, les cartes, les quatre boosters.
 *
 * C'est la source de vérité. Le client reçoit ce catalogue pour l'affichage,
 * mais toute résolution d'effet relit ces définitions côté serveur : une carte
 * envoyée par le navigateur n'est qu'un identifiant, jamais un effet.
 */

import { BOOSTER_ART, CARD_ART } from './card-art.generated';
import { GAME_LIMITS, PLACEMENT_POINTS, RARITY_ORDER, RARITY_WEIGHTS_BASE } from './rules';
import type {
  CardDefinition,
  CardEffect,
  MomentCarte,
  PackDefinition,
  PackId,
  Rarity,
} from './types';

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
 * Les cartes de la saison.
 *
 * ## D'où elles viennent
 *
 * Leurs actions sont celles des roues de la Summer Ligue — le bonus de points,
 * le multiplicateur de game, le clone de kills, le joker, la game
 * supplémentaire, l'immunité, la pire game ramenée à la moyenne, la roulette
 * russe. Chaque carte porte un **nom d'hiver** et, en sous-titre, l'**intitulé
 * de l'action** tel qu'on le disait sur les roues.
 *
 * ## Ce qui a changé par rapport aux roues
 *
 * La force. Une roue pouvait échanger deux games entières ou doubler un score
 * sans limite ; ici chaque carte tient dans le budget de sa rareté
 * (`IMPACT_PAR_RARETE`) : quatre points pour une commune, vingt-cinq pour une
 * légendaire — une bonne game, jamais plus. Un test le vérifie carte par
 * carte, au pire cas.
 *
 * ## Les règles des malus
 *
 *   — aucun dans le pack Perso ni le pack Finisseur : ce qu'on ouvre pour soi
 *     ne peut pas se retourner contre soi ;
 *   — un malus tombe sur un joueur tiré au sort ou sur la tête du classement,
 *     jamais sur quelqu'un que quelqu'un aurait choisi ;
 *   — un malus retire des points, il n'en donne jamais à personne ;
 *   — il ne touche qu'une game de sa cible : rien n'est supprimé, volé ni
 *     copié chez un autre.
 *
 * La carte **à deux** est la seule exception assumée : un échange de kills met
 * face à face deux joueurs tirés au sort, et ce que l'un gagne, l'autre le
 * perd. C'est borné de chaque côté, et ça ne sort que des boosters de la
 * ligue.
 */
export const CARDS: readonly CardDefinition[] = [
  /* ================================ Communes ============================== */
  {
    id: 'congere',
    name: 'Congère',
    subtitle: '+3 pts bonus',
    rarity: 'C',
    glyph: '🌨',
    description: '+3 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 3 },
    nature: 'bonus',
    power: 8,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'boule-de-neige',
    name: 'Boule de Neige',
    subtitle: '+4 pts petites games',
    rarity: 'C',
    glyph: '⚪',
    description: 'Si ta prochaine game fait moins de 5 kills, elle gagne 4 points.',
    effect: { kind: 'petite_game', moinsDe: 5, value: 4 },
    nature: 'bonus',
    power: 10,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'rafale',
    name: 'Rafale',
    subtitle: '+4 pts à partir du Top 3',
    rarity: 'C',
    glyph: '🍃',
    description: 'Si ta prochaine game finit dans le Top 3, elle gagne 4 points.',
    effect: { kind: 'bonus_top', top: 3, value: 4 },
    nature: 'bonus',
    power: 12,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'etincelle',
    name: 'Étincelle',
    subtitle: 'Pas de chance',
    rarity: 'C',
    glyph: '✦',
    description: 'La carte est passée à côté du classement : 60 flocons de consolation, tout de suite.',
    effect: { kind: 'snowflakes', value: 60 },
    nature: 'bonus',
    power: 5,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },

  /* ============================== Peu communes ============================ */
  {
    id: 'poudreuse',
    name: 'Poudreuse',
    subtitle: '+5 pts bonus',
    rarity: 'PC',
    glyph: '❄',
    description: '+5 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 5 },
    nature: 'bonus',
    power: 22,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'filet',
    name: 'Filet de Neige',
    subtitle: 'Joker',
    rarity: 'PC',
    glyph: '🕸',
    description: 'Joker : ta prochaine game vaut au moins 6 points, même ratée.',
    effect: { kind: 'plancher', value: 6 },
    nature: 'bonus',
    power: 24,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'etoile-polaire',
    name: 'Étoile Polaire',
    subtitle: '+200 flocons',
    rarity: 'PC',
    glyph: '⭐',
    description: '200 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 200 },
    nature: 'bonus',
    power: 18,
    packs: ['perso', 'commu'],
    cible: 'HASARD',
  },
  {
    id: 'manne',
    name: 'Manne',
    subtitle: 'Flocons doublés',
    rarity: 'PC',
    glyph: '💠',
    description: 'Les flocons de ta prochaine game sont doublés.',
    effect: { kind: 'flocons_doubles' },
    nature: 'bonus',
    power: 20,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'givre-mordant',
    name: 'Givre Mordant',
    subtitle: '−4 pts à un joueur',
    rarity: 'PC',
    glyph: '🥶',
    description: 'MALUS : un joueur tiré au sort perd 4 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 4 },
    nature: 'malus',
    power: 28,
    packs: ['commu'],
    cible: 'HASARD',
  },

  /* ================================= Rares ================================ */
  {
    id: 'percee',
    name: 'Percée',
    subtitle: '+8 pts bonus',
    rarity: 'R',
    glyph: '⚔',
    description: '+8 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 8 },
    nature: 'bonus',
    power: 36,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'vent-du-nord',
    name: 'Vent du Nord',
    subtitle: 'Multiplicateur game',
    rarity: 'R',
    glyph: '💨',
    description:
      'Le score entier de ta prochaine game, kills et top, est multiplié par 1,2, jusqu’à +10 points.',
    effect: { kind: 'multiplicateur_game', value: 1.2, cap: 10 },
    nature: 'bonus',
    power: 40,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'echo',
    name: 'Écho des Cimes',
    subtitle: 'Clone kill du meilleur',
    rarity: 'R',
    glyph: '🗻',
    description:
      'Ta prochaine game prend les kills du meilleur tueur de ta partie, jusqu’à +10 points.',
    effect: { kind: 'clone_kills', cap: 10 },
    nature: 'bonus',
    power: 42,
    packs: ['perso', 'commu'],
    cible: 'HASARD',
  },
  {
    id: 'pluie-de-flocons',
    name: 'Pluie de Flocons',
    subtitle: '+500 flocons',
    rarity: 'R',
    glyph: '🌧',
    description: '500 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 500 },
    nature: 'bonus',
    power: 34,
    packs: ['perso', 'commu', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'redoux',
    name: 'Redoux',
    subtitle: 'Pire game ×2',
    rarity: 'R',
    glyph: '🌤',
    description: 'Ta pire game encore sans carte voit son score multiplié par 2, jusqu’à +10 points.',
    effect: { kind: 'multiplie_jouee', cible: 'pire', value: 2, cap: 10 },
    nature: 'bonus',
    power: 44,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'chasse-croise',
    name: 'Chassé-Croisé',
    subtitle: 'Échange de kills',
    rarity: 'R',
    glyph: '🔁',
    description:
      'Deux joueurs tirés au sort échangent les kills de leur prochaine game, jusqu’à 10 points de part et d’autre.',
    effect: { kind: 'echange', sur: 'kills', cap: 10 },
    nature: 'malus',
    power: 46,
    packs: ['commu', 'folie'],
    cible: 'DEUX',
  },
  {
    id: 'contre-courant',
    name: 'Contre-Courant',
    subtitle: 'Roulette russe',
    rarity: 'R',
    glyph: '🌀',
    description:
      'MALUS : une seule balle dans le barillet. Un joueur tiré au sort perd 8 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 8 },
    nature: 'malus',
    power: 48,
    packs: ['commu', 'folie'],
    cible: 'HASARD',
  },

  /* =============================== Super rares ============================ */
  {
    id: 'second-souffle',
    name: 'Second Souffle',
    subtitle: '+12 pts bonus',
    rarity: 'SR',
    glyph: '🌬',
    description: '+12 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 12 },
    nature: 'bonus',
    power: 56,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'blizzard',
    name: 'Blizzard',
    subtitle: 'Multiplicateur game',
    rarity: 'SR',
    glyph: '🌪',
    description:
      'Le score entier de ta prochaine game, kills et top, est multiplié par 1,3, jusqu’à +15 points.',
    effect: { kind: 'multiplicateur_game', value: 1.3, cap: 15 },
    nature: 'bonus',
    power: 62,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'socle',
    name: 'Socle de Glace',
    subtitle: 'Joker',
    rarity: 'SR',
    glyph: '🧱',
    description: 'Joker : ta prochaine game vaut au moins 15 points, même ratée.',
    effect: { kind: 'plancher', value: 15 },
    nature: 'bonus',
    power: 58,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'sang-froid',
    name: 'Sang-Froid',
    subtitle: '+12 pts à partir du Top 3',
    rarity: 'SR',
    glyph: '🧊',
    description: 'Si ta prochaine game finit dans le Top 3, elle gagne 12 points.',
    effect: { kind: 'bonus_top', top: 3, value: 12 },
    nature: 'bonus',
    power: 60,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'bouclier-givre',
    name: 'Bouclier de Givre',
    subtitle: 'Immunité 2 jours',
    rarity: 'SR',
    glyph: '🛡',
    description:
      'Pendant 48 heures, aucun malus ne peut toucher tes games. Les bonus t’atteignent toujours.',
    effect: { kind: 'immunite', heures: 48 },
    nature: 'bonus',
    power: 54,
    packs: ['perso', 'commu'],
    cible: 'HASARD',
  },
  {
    id: 'degel',
    name: 'Dégel',
    subtitle: 'Pire game ramenée à la moyenne',
    rarity: 'SR',
    glyph: '💧',
    description:
      'Ta pire game encore sans carte remonte au niveau de ta moyenne, jusqu’à +15 points.',
    effect: { kind: 'releve_pire', cap: 15 },
    nature: 'bonus',
    power: 64,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'traineau-perce',
    name: 'Traîneau Percé',
    subtitle: '−12 pts au premier',
    rarity: 'SR',
    glyph: '🛷',
    description: 'MALUS : le premier du classement perd 12 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 12 },
    nature: 'malus',
    power: 66,
    packs: ['commu', 'folie'],
    cible: 'TETE',
  },
  {
    id: 'verglas',
    name: 'Verglas',
    subtitle: 'Une game ÷ 2',
    rarity: 'SR',
    glyph: '⛸',
    description:
      'MALUS : la prochaine game d’un joueur tiré au sort est divisée par 2, jusqu’à −15 points.',
    effect: { kind: 'diviseur_game', value: 2, cap: 15 },
    nature: 'malus',
    power: 68,
    packs: ['commu', 'folie'],
    cible: 'HASARD',
  },

  /* =============================== Ultra rares ============================ */
  {
    id: 'rempart-polaire',
    name: 'Rempart Polaire',
    subtitle: '+18 pts bonus',
    rarity: 'UR',
    glyph: '🏰',
    description: '+18 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 18 },
    nature: 'bonus',
    power: 76,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'nuit-polaire',
    name: 'Nuit Polaire',
    subtitle: 'Multiplicateur game',
    rarity: 'UR',
    glyph: '🌑',
    description:
      'Le score entier de ta prochaine game, kills et top, est multiplié par 1,5, jusqu’à +20 points.',
    effect: { kind: 'multiplicateur_game', value: 1.5, cap: 20 },
    nature: 'bonus',
    power: 82,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'reflet',
    name: 'Reflet de Glace',
    subtitle: 'Clone kill du meilleur',
    rarity: 'UR',
    glyph: '🪞',
    description:
      'Ta prochaine game prend les kills du meilleur tueur de ta partie, jusqu’à +20 points.',
    effect: { kind: 'clone_kills', cap: 20 },
    nature: 'bonus',
    power: 80,
    packs: ['perso', 'commu'],
    cible: 'HASARD',
  },
  {
    id: 'aurore-boreale',
    name: 'Aurore Boréale',
    subtitle: '+2 000 flocons',
    rarity: 'UR',
    glyph: '🌌',
    description: '2 000 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 2000 },
    nature: 'bonus',
    power: 74,
    packs: ['perso', 'commu', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'refuge',
    name: 'Refuge',
    subtitle: 'Game supplémentaire',
    rarity: 'UR',
    glyph: '🛖',
    description:
      'Un créneau de game en plus, hors limite : une game de plus à jouer cette saison.',
    effect: { kind: 'game_supplementaire' },
    nature: 'bonus',
    power: 84,
    packs: ['perso', 'commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'cordee',
    name: 'Cordée',
    subtitle: 'Coup de pouce aux derniers',
    rarity: 'UR',
    glyph: '🧗',
    description: 'Les derniers du classement gagnent 15 points sur leur prochaine game.',
    effect: { kind: 'bonus_points', value: 15 },
    nature: 'bonus',
    power: 78,
    packs: ['commu', 'folie'],
    cible: 'QUEUE',
  },
  {
    id: 'tempete-de-verglas',
    name: 'Tempête de Verglas',
    subtitle: '−16 pts au premier',
    rarity: 'UR',
    glyph: '🌩',
    description: 'MALUS : le premier du classement perd 16 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 16 },
    nature: 'malus',
    power: 88,
    packs: ['commu', 'folie'],
    cible: 'TETE',
  },

  /* ============================== Légendaires ============================= */
  {
    id: 'etoile-du-nord',
    name: 'Étoile du Nord',
    subtitle: '+25 pts bonus',
    rarity: 'L',
    glyph: '🌟',
    description: '+25 points sur ta prochaine game.',
    effect: { kind: 'bonus_points', value: 25 },
    nature: 'bonus',
    power: 94,
    packs: ['perso', 'commu', 'finisseur', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'grand-nord',
    name: 'Grand Nord',
    subtitle: 'Multiplicateur game',
    rarity: 'L',
    glyph: '🧭',
    description:
      'Le score entier de ta prochaine game, kills et top, est multiplié par 2, jusqu’à +25 points.',
    effect: { kind: 'multiplicateur_game', value: 2, cap: 25 },
    nature: 'bonus',
    power: 100,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'sanctuaire',
    name: 'Sanctuaire',
    subtitle: 'Joker',
    rarity: 'L',
    glyph: '🏔',
    description: 'Joker : ta prochaine game vaut au moins 25 points, même ratée.',
    effect: { kind: 'plancher', value: 25 },
    nature: 'bonus',
    power: 92,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'gel-eternel',
    name: 'Gel Éternel',
    subtitle: 'Meilleure game ×1,5',
    rarity: 'L',
    glyph: '💎',
    description:
      'Ta meilleure game encore sans carte est multipliée par 1,5, jusqu’à +25 points.',
    effect: { kind: 'multiplie_jouee', cible: 'meilleure', value: 1.5, cap: 25 },
    nature: 'bonus',
    power: 96,
    packs: ['perso', 'finisseur', 'folie'],
    cible: 'TOUS',
  },
  {
    id: 'grand-froid',
    name: 'Grand Froid',
    subtitle: '−20 pts au premier',
    rarity: 'L',
    glyph: '☠',
    description: 'MALUS : le premier du classement perd 20 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 20 },
    nature: 'malus',
    power: 98,
    packs: ['folie'],
    cible: 'TETE',
  },
];

const CARD_INDEX = new Map(CARDS.map((c) => [c.id, c]));

/** Quand une carte se joue : à la prochaine game, sur une game jouée, ou tout de suite. */
export function momentDe(effect: CardEffect): MomentCarte {
  switch (effect.kind) {
    case 'releve_pire':
    case 'multiplie_jouee':
      return 'JOUEE';
    case 'snowflakes':
    case 'game_supplementaire':
    case 'immunite':
      return 'INSTANT';
    default:
      return 'PROCHAINE';
  }
}

/** Le score le plus haut qu'une game puisse atteindre sans carte : le pire cas des multiplicateurs. */
const SCORE_MAX = GAME_LIMITS.maxKills + PLACEMENT_POINTS['1'];

/**
 * Ce qu'une carte peut faire bouger sur une game, au pire cas, en points.
 *
 * Rend `null` pour ce qui ne touche pas au score : les flocons, le créneau de
 * game, l'immunité. C'est la mesure que les tests comparent au budget de la
 * rareté (`IMPACT_PAR_RARETE`).
 */
export function impactMax(effect: CardEffect): number | null {
  switch (effect.kind) {
    case 'bonus_points':
    case 'malus_points':
    case 'plancher':
    case 'bonus_top':
    case 'petite_game':
      return Math.abs(effect.value);
    case 'multiplicateur_game':
      return Math.min(effect.cap, Math.round(SCORE_MAX * (effect.value - 1)));
    case 'diviseur_game':
      return Math.min(effect.cap, Math.round(SCORE_MAX * (1 - 1 / effect.value)));
    case 'multiplie_jouee':
      return Math.min(effect.cap, Math.round(SCORE_MAX * (effect.value - 1)));
    case 'clone_kills':
      return Math.min(effect.cap, GAME_LIMITS.maxKills);
    case 'echange':
    case 'releve_pire':
      return effect.cap;
    case 'snowflakes':
    case 'flocons_doubles':
    case 'game_supplementaire':
    case 'immunite':
      return null;
  }
}

/**
 * L'effet d'une carte en trois mots, pour une pastille : « +3 pts »,
 * « score ×1,2, max +10 ». La description complète reste sur la carte ; ceci
 * est ce qu'on lit dans un classement, à côté d'un pseudo.
 */
export function resumeEffet(effect: CardEffect): string {
  const fr = (n: number) => n.toLocaleString('fr-FR');
  switch (effect.kind) {
    case 'bonus_points':
      return `+${effect.value} pts`;
    case 'malus_points':
      return `−${effect.value} pts`;
    case 'multiplicateur_game':
      return `score ×${fr(effect.value)}, max +${effect.cap}`;
    case 'diviseur_game':
      return `score ÷${fr(effect.value)}, max −${effect.cap}`;
    case 'clone_kills':
      return `kills du meilleur, max +${effect.cap}`;
    case 'plancher':
      return `au moins ${effect.value} pts`;
    case 'bonus_top':
      return `+${effect.value} pts si Top ${effect.top}`;
    case 'petite_game':
      return `+${effect.value} pts sous ${effect.moinsDe} kills`;
    case 'flocons_doubles':
      return 'flocons ×2';
    case 'echange':
      return `échange de ${effect.sur === 'kills' ? 'kills' : 'games'}, max ${effect.cap}`;
    case 'releve_pire':
      return `pire game à la moyenne, max +${effect.cap}`;
    case 'multiplie_jouee':
      return `${effect.cible === 'pire' ? 'pire' : 'meilleure'} game ×${fr(effect.value)}, max +${effect.cap}`;
    case 'snowflakes':
      return `+${fr(effect.value)} ❄`;
    case 'game_supplementaire':
      return '+1 game';
    case 'immunite':
      return `immunité ${effect.heures} h`;
  }
}

/** Numéro de collection, à la façon du « 12/36 » au dos des cartes. */
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
 * Ce sont les quatre roues de la Summer Ligue : la personnelle, la
 * communautaire, celle de folie, celle des finisseurs. Aucun ne s'achète.
 * Chacun a son déclencheur, et c'est la streameuse qui l'ouvre, à l'antenne.
 * Le Perso et le Finisseur sont pour un joueur désigné ; le Commu tombe sur un
 * joueur au hasard, deux quand la carte les oppose, la tête ou la queue du
 * classement ; le Folie tombe le plus souvent sur toute la ligue. La table de
 * raretés est ce qui distingue un pack d'un autre : le Perso tire aux taux de
 * base, le Finisseur récompense ceux qui ont joué toute leur saison, le Folie
 * ne contient rien en dessous de rare.
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
    pourQui: 'ceux que le sort désigne',
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
    pourQui: 'toute la ligue, le plus souvent',
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
