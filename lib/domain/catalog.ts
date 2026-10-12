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
  CibleCarte,
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
    /** Le sigle de la rareté : C, R, UR, L. */
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
  R: {
    code: 'R',
    label: 'Rare',
    short: 'Rare',
    color: '#8b7dff',
    deep: '#251f52',
    glow: 'rgba(139,125,255,0.45)',
    order: 1,
    holo: true,
  },
  UR: {
    code: 'UR',
    label: 'Ultra rare',
    short: 'U. rare',
    color: '#ff9a4d',
    deep: '#4d2510',
    glow: 'rgba(255,154,77,0.55)',
    order: 2,
    holo: true,
  },
  L: {
    code: 'L',
    label: 'Légendaire',
    short: 'Légend.',
    color: '#ffd76a',
    deep: '#4b3708',
    glow: 'rgba(255,215,106,0.62)',
    order: 3,
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
 * Il n'y a pas de plafond de points par rareté : une carte pèse ce que dit son
 * effet — la Game ×2 double une game, quelle qu'elle soit. Plus une carte est
 * rare, plus elle est forte (`power`, testé). Une game reste bornée
 * (`GAME_LIMITS`), et ne porte jamais deux cartes.
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
 * ligue. *
 * ## Une carte par rareté, pour l'instant
 *
 * Le catalogue a été ramené à quatre cartes, une par rareté — un bonus de
 * points chacune —, le temps de repenser toutes les cartes. Les genres d'effet
 * restent tous dans `lib/services/effects.ts`, et les tests les exercent sur
 * les cartes retirées, gardées comme fixture (`tests/stubs/cartes-retirees.ts`).
 * Chaque carte doit pouvoir sortir de tous les boosters qui tirent sa rareté :
 * un test le vérifie.
 */
export const CARDS: readonly CardDefinition[] = [
  /* ============================== Commune =============================== */
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
    // Pas dans le Perso : sa commune y est le Chocolat Chaud.
    packs: ['commu', 'finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'chocolat-chaud',
    name: 'Chocolat Chaud',
    subtitle: '+10 pts si Top 3',
    rarity: 'C',
    glyph: '☕',
    // Se mérite : rien si la game finit hors du Top 3.
    description: '+10 points sur ta prochaine game, si tu finis dans le Top 3.',
    effect: { kind: 'bonus_top', top: 3, value: 10 },
    nature: 'bonus',
    power: 12,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Une consolation, pas un gain : le prix d'un kill. Plus, elle ferait
    // monter la chance de qui ouvre beaucoup de Boosters Perso.
    id: 'bocal-de-givre',
    name: 'Bocal de Givre',
    subtitle: '+10 flocons',
    rarity: 'C',
    glyph: '🫙',
    description: '+10 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 10 },
    nature: 'bonus',
    power: 4,
    packs: ['perso'],
    cible: 'HASARD',
  },
  /* ============================== Rare ================================== */
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
    // Pas dans le Perso : sa rare y est le Joker.
    packs: ['commu', 'finisseur', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'joker-givre',
    name: 'Joker Givré',
    subtitle: 'Joker',
    rarity: 'R',
    glyph: '🃏',
    description:
      'Garde-le : à la saisie d’une de tes games, la modération peut la faire ne pas compter. Un seul Joker à la fois.',
    effect: { kind: 'joker' },
    nature: 'bonus',
    power: 40,
    packs: ['perso'],
    cible: 'HASARD',
  },
  /* ============================== Ultra rare ============================ */
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
    packs: ['perso', 'commu', 'finisseur', 'folie'],
    cible: 'HASARD',
  },
  /* ============================== Légendaire ============================ */
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
    // Pas dans le Perso : ses légendaires y sont Ouragan Blanc et Permafrost.
    packs: ['commu', 'finisseur', 'folie'],
    cible: 'HASARD',
  },
  {
    id: 'ouragan-blanc',
    name: 'Ouragan Blanc',
    subtitle: 'Game ×2',
    rarity: 'L',
    glyph: '🌀',
    description: 'Ta prochaine game compte double : kills et top ×2.',
    effect: { kind: 'multiplicateur_game', value: 2 },
    nature: 'bonus',
    power: 98,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    id: 'permafrost',
    name: 'Permafrost',
    subtitle: 'Fige ta meilleure game',
    rarity: 'L',
    glyph: '🧊',
    description:
      'Ta meilleure game est figée : plus aucune carte ne peut la toucher. Si elle l’est déjà, c’est la suivante.',
    effect: { kind: 'fige_meilleure' },
    nature: 'bonus',
    power: 90,
    packs: ['perso'],
    cible: 'HASARD',
  },
];

const CARD_INDEX = new Map(CARDS.map((c) => [c.id, c]));

/**
 * Combien de joueurs une carte d'un booster de la ligue fait tirer au sort :
 * un (`HASARD`), deux (`DEUX`), ou aucun — tout le monde, la tête et la queue
 * du classement ne se tirent pas. C'est le second tirage d'une ouverture,
 * après celui de la carte : le serveur le fait dans la même transaction, et
 * l'écran le déroule ensuite sur un rail de joueurs.
 */
export function joueursTires(cible: CibleCarte): number {
  if (cible === 'HASARD') return 1;
  if (cible === 'DEUX') return 2;
  return 0;
}

/** Quand une carte se joue : à la prochaine game, sur une game jouée, ou tout de suite. */
export function momentDe(effect: CardEffect): MomentCarte {
  switch (effect.kind) {
    case 'releve_pire':
    case 'multiplie_jouee':
    case 'fige_meilleure':
      return 'JOUEE';
    case 'snowflakes':
    case 'game_supplementaire':
    case 'immunite':
      return 'INSTANT';
    case 'joker':
      return 'GARDEE';
    default:
      return 'PROCHAINE';
  }
}

/** Le score le plus haut qu'une game puisse atteindre sans carte : le pire cas des multiplicateurs. */
const SCORE_MAX = GAME_LIMITS.maxKills + PLACEMENT_POINTS['1'];

/**
 * Ce qu'une carte peut faire bouger sur une game, au pire cas, en points.
 *
 * Rend `null` pour ce qui ne touche pas au score — les flocons, le créneau de
 * game, l'immunité, la game figée — et pour un multiplicateur sans plafond, qui
 * suit la game : la page des boosters n'annonce alors pas de « au plus ».
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
      // Sans plafond, la carte suit la game : pas de « au plus » à annoncer.
      return effect.cap === undefined ? null : Math.min(effect.cap, Math.round(SCORE_MAX * (effect.value - 1)));
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
    case 'fige_meilleure':
    case 'joker':
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
      return effect.cap === undefined
        ? `game ×${fr(effect.value)}`
        : `score ×${fr(effect.value)}, max +${effect.cap}`;
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
    case 'fige_meilleure':
      return 'meilleure game figée';
    case 'joker':
      return 'une game annulable';
  }
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
  R: 'linear',
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
 * classement, et le Folie aussi — ou toute la ligue, selon la carte. La table de
 * raretés est ce qui distingue un pack d'un autre : le Perso tire aux taux de
 * base, le Finisseur récompense ceux qui ont joué toute leur saison, le Folie
 * ne contient rien en dessous de rare.
 */
export const PACKS: readonly PackDefinition[] = [
  {
    id: 'perso',
    name: 'Booster Perso',
    tagline: 'Un T3 ou cinq subs offerts, une carte pour toi',
    declencheur: 'Pour chaque sub T3 d’un joueur, pris ou offert, et chaque fois qu’il offre cinq subs.',
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
    // Une légendaire sur deux cents, une ultra rare sur quarante.
    weights: { C: 75_000, R: 22_000, UR: 2_500, L: 500 },
  },
  {
    id: 'folie',
    name: 'Booster Folie',
    tagline: 'Rien en dessous de rare',
    declencheur: 'Tous les deux cents subs de la saison.',
    glyph: '🌪',
    gradient: ['#6b4bab', '#241540'],
    portee: 'TOUS',
    pourQui: 'ceux que le sort désigne',
    // Rien sous rare ; une légendaire sur dix-sept : c'est là qu'elle se voit.
    weights: { C: 0, R: 72_000, UR: 22_000, L: 6_000 },
  },
  {
    id: 'finisseur',
    name: 'Booster Finisseur',
    tagline: 'Pour qui va au bout',
    declencheur: 'Quand un joueur a joué toutes ses games de la saison.',
    glyph: '🏁',
    // Le vert de l'aurore qui couronne sa planche.
    gradient: ['#2e8b7a', '#0c2a26'],
    portee: 'JOUEUR',
    pourQui: 'un joueur',
    // Une légendaire sur cinquante : jouer toute sa saison vaut mieux qu'offrir.
    weights: { C: 45_000, R: 45_000, UR: 8_000, L: 2_000 },
  },
];

const PACK_INDEX = new Map(PACKS.map((p) => [p.id, p]));

/**
 * La planche peinte de chaque pack : `public/boosters/<id du pack>.webp`.
 *
 * Une série de chats des neiges, un par booster : le Perso sort d'une grotte
 * de glace, le Commu tourne en bande dans un tourbillon, le Folie se fait
 * tornade sous l'aurore, le Finisseur, en armure, a gagné le sommet. Un pack
 * sans planche retombe sur le sachet dessiné.
 */
export function packArt(id: string): string | null {
  return BOOSTER_ART[id] ?? null;
}

/** La rareté qui donne sa couleur au halo du sachet : la plus haute qu'il promet vraiment. */
export const GEMME_DU_PACK: Record<PackId, Rarity> = {
  perso: 'C',
  commu: 'R',
  folie: 'L',
  finisseur: 'UR',
};

export function getPack(id: string): PackDefinition | null {
  return PACK_INDEX.get(id as PackId) ?? null;
}
