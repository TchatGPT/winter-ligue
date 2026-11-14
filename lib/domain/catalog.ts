/**
 * Catalogue figé de la saison : les raretés, les cartes, les quatre boosters.
 *
 * C'est la source de vérité. Le client reçoit ce catalogue pour l'affichage,
 * mais toute résolution d'effet relit ces définitions côté serveur : une carte
 * envoyée par le navigateur n'est qu'un identifiant, jamais un effet.
 */

import { BOOSTER_ART, CARD_ART, CARD_VIGNETTES } from './card-art.generated';
import { GAME_LIMITS, PLACEMENT_POINTS, RARITY_ORDER, RARITY_WEIGHTS_BASE } from './rules';
import type { CardDefinition, CardEffect, CibleCarte, MomentCarte, PackDefinition, PackId, Rarity, ActionRoue } from './types';

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
    subtitle: '+4 pts bonus',
    rarity: 'C',
    glyph: '🌨',
    description: '+4 points bonus sur ton total, tout de suite.',
    effect: { kind: 'bonus_total', value: 4 },
    nature: 'bonus',
    power: 9,
    // Dans le Perso aussi depuis le 20/10/2026, avec les autres communes.
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Quatre kills de flocons (+10 jusqu'au 02/11/2026).
    id: 'bocal-de-givre',
    name: 'Bocal de Givre',
    subtitle: '+40 flocons',
    rarity: 'C',
    glyph: '🫙',
    description: '+40 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 40 },
    nature: 'bonus',
    power: 6,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Une boule de plus tous les 5 kills : rien en dessous, +6 au plus.
    id: 'bonhomme-de-neige',
    name: 'Bonhomme de Neige',
    subtitle: '+2 pts par 5 kills',
    rarity: 'C',
    glyph: '⛄',
    description: '+2 points sur ta prochaine game par tranche de 5 kills, jusqu’à +6.',
    effect: { kind: 'kills_paliers', par: 5, value: 2, cap: 6 },
    nature: 'bonus',
    power: 10,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Ajoutée le 27/10/2026 ; +5 pts bonus sans condition depuis le 02/11/2026.
    id: 'marche-gelee',
    name: 'Marche Gelée',
    subtitle: '+5 pts bonus',
    rarity: 'C',
    glyph: '👣',
    description: '+5 points bonus sur ton total, tout de suite.',
    effect: { kind: 'bonus_total', value: 5 },
    nature: 'bonus',
    power: 10,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Commune depuis le 02/11/2026 (rare jusque-là).
    id: 'vent-porteur',
    name: 'Vent Porteur',
    subtitle: 'Game ×1,2',
    rarity: 'C',
    glyph: '🌬',
    description: 'Ta prochaine game compte ×1,2 : kills et top.',
    effect: { kind: 'multiplicateur_game', value: 1.2 },
    nature: 'bonus',
    power: 12,
    packs: ['perso'],
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
  /* ============================== Rare ================================== */
  {
    id: 'lanterne-givree',
    name: 'Lanterne Givrée',
    subtitle: '+7 pts bonus',
    rarity: 'R',
    glyph: '🏮',
    description: '+7 points bonus sur ton total, tout de suite.',
    effect: { kind: 'bonus_total', value: 7 },
    nature: 'bonus',
    power: 24,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Passée d'ultra rare à rare le 27/10/2026 : la seule ultra rare qui ne
    // touchait pas au score — cinquante flocons, cinq kills.
    id: 'coulee-de-neige',
    name: 'Coulée de Neige',
    subtitle: '+50 flocons',
    rarity: 'R',
    glyph: '🏔',
    description: '+50 flocons, tout de suite.',
    effect: { kind: 'snowflakes', value: 50 },
    nature: 'bonus',
    power: 40,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Booster Perso, ajoutée le 02/11/2026 (×1,4 et non ×1,5).
    id: 'souffle-polaire',
    name: 'Souffle Polaire',
    subtitle: 'Game ×1,4',
    rarity: 'R',
    glyph: '💨',
    description: 'Ta prochaine game compte ×1,4 : kills et top.',
    effect: { kind: 'multiplicateur_game', value: 1.4 },
    nature: 'bonus',
    power: 46,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Booster Perso, ajoutée le 02/11/2026 ; « Piste Damée » jusqu'au jour même
    // (l'identifiant reste, les tirages en base y renvoient).
    id: 'piste-damee',
    name: 'Piste Étoilée',
    subtitle: '+10 pts si Top 8',
    rarity: 'R',
    glyph: '🎿',
    description: '+10 points sur ta prochaine game, si tu fais Top 8.',
    effect: { kind: 'bonus_top', top: 8, value: 10 },
    nature: 'bonus',
    power: 26,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Booster Perso, ajoutée le 02/11/2026, rare le jour même : plus dure à
    // déclencher que la Piste Étoilée (Top 8), elle ne pouvait pas valoir plus.
    id: 'cime-gelee',
    name: 'Cime Gelée',
    subtitle: '+10 pts si Top 6',
    rarity: 'R',
    glyph: '🏔',
    description: '+10 points sur ta prochaine game, si tu fais Top 6.',
    effect: { kind: 'bonus_top', top: 6, value: 10 },
    nature: 'bonus',
    power: 25,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Les kills du meilleur tueur de la partie — celui de la capture,
    // coéquipiers et streameuse compris —, lus à la saisie. S'il l'est
    // lui-même, une consolation fixe : être le meilleur ne coûte pas la carte.
    // Passée d'ultra rare à rare le 02/11/2026.
    id: 'echo-lointain',
    name: 'Écho Lointain',
    subtitle: 'Clone kill du meilleur',
    rarity: 'R',
    glyph: '🏔',
    description:
      'Ta prochaine game compte comme si tu avais fait les kills du meilleur tueur de ta partie. Si c’est toi : +10 points.',
    effect: { kind: 'clone_kills', consolation: 10 },
    nature: 'bonus',
    power: 57,
    packs: ['perso'],
    cible: 'HASARD',
  },
  /* ============================== Ultra rare ============================ */
  {
    // Un malus que le joueur garde, et dont il choisit la victime : la
    // modération le joue pour lui. Décidé par l'organisation le 13/10/2026 ;
    // −10 au lieu de −20 depuis le 02/11/2026.
    id: 'plaque-verglas',
    name: 'Verglas',
    subtitle: '−10 pts au joueur de ton choix',
    rarity: 'UR',
    glyph: '🧊',
    description:
      '−10 points au total du joueur de ton choix. Tu la gardes, et la modération l’envoie quand tu désignes ta cible.',
    effect: { kind: 'malus_choisi', value: 10 },
    nature: 'malus',
    power: 64,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    id: 'joker-givre',
    name: 'Joker Givré',
    subtitle: 'Joker',
    rarity: 'UR',
    glyph: '🃏',
    description:
      'Garde-le : à la saisie d’une de tes games, la modération peut la faire ne pas compter. Jusqu’à 5 Jokers en main.',
    effect: { kind: 'joker' },
    nature: 'bonus',
    power: 70,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // La petite sœur du Grand Dégel : la pire game ne disparaît pas, elle
    // remonte vers la moyenne du joueur, quinze points au plus. Il faut deux
    // games pour avoir une pire et une moyenne : d'ici là, elle attend.
    id: 'feu-de-camp',
    name: 'Feu de Camp',
    subtitle: 'Relève ta pire game',
    rarity: 'UR',
    glyph: '🔥',
    description: 'Ta pire game remonte vers ta moyenne, jusqu’à +15 points. Il te faut deux games jouées.',
    effect: { kind: 'releve_pire', cap: 15 },
    nature: 'bonus',
    power: 62,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Booster Perso, ajoutée le 02/11/2026.
    id: 'vortex-polaire',
    name: 'Vortex Polaire',
    subtitle: 'Game ×1,8',
    rarity: 'UR',
    glyph: '🌀',
    description: 'Ta prochaine game compte ×1,8 : kills et top.',
    effect: { kind: 'multiplicateur_game', value: 1.8 },
    nature: 'bonus',
    power: 76,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Booster Perso, ajoutée le 02/11/2026.
    id: 'coeur-de-glace',
    name: 'Cœur de Glace',
    subtitle: '+10 pts bonus',
    rarity: 'UR',
    glyph: '💎',
    description: '+10 points bonus sur ton total, tout de suite.',
    effect: { kind: 'bonus_total', value: 10 },
    nature: 'bonus',
    power: 63,
    packs: ['perso'],
    cible: 'HASARD',
  },
  /* ============================== Légendaire ============================ */
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
    // Sa propre pire game, jamais celle d'un autre : elle ne compte plus, et
    // son créneau est rendu. Se règle dès qu'il y a une game à supprimer.
    id: 'grand-degel',
    name: 'Grand Dégel',
    subtitle: 'Supprime ta pire game',
    rarity: 'L',
    glyph: '🌊',
    description: 'Ta pire game est supprimée, tout de suite : elle ne compte plus, et tu peux la rejouer.',
    effect: { kind: 'supprime_pire' },
    nature: 'bonus',
    power: 92,
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
  {
    // Gardée, jouée par la modération sur les deux games choisies. Décidée le 02/11/2026.
    id: 'pacte-du-givre',
    name: 'Pacte du Givre',
    subtitle: 'Échange de games',
    rarity: 'L',
    glyph: '🤝',
    description: 'Tu la gardes. Dès ta 15e game, échange une de tes games contre une game d’un autre joueur, au choix : chacune prend la place de l’autre.',
    effect: { kind: 'echange_choisi', minGames: 15 },
    nature: 'bonus',
    power: 94,
    packs: ['perso'],
    cible: 'HASARD',
  },
  {
    // Se mérite : rien hors du Top 1. Légendaire depuis le 02/11/2026 (rare jusque-là).
    id: 'luge',
    name: 'Luge',
    subtitle: '+15 pts si Top 1',
    rarity: 'L',
    glyph: '🛷',
    description: '+15 points sur ta prochaine game, si tu fais Top 1.',
    effect: { kind: 'bonus_top', top: 1, value: 15 },
    nature: 'bonus',
    power: 90,
    packs: ['perso'],
    cible: 'HASARD',
  },
  /* ===================== Booster Commu — la Roue Communautaire ===================== */
  // Les roues de la Summer Ligue, reprises telles quelles le 03/11/2026.
  {
    // Changée le 12/11/2026 : plus de game sup, 100 flocons pour chacun.
    id: 'flocon-de-plus',
    name: 'Flocon de Plus',
    subtitle: '+100 flocons pour tous',
    rarity: 'C',
    glyph: '❄️',
    description: 'Chaque joueur de la ligue reçoit 100 flocons, dès la carte révélée.',
    effect: { kind: 'roue', action: { quoi: 'flocons', montant: 100 } },
    nature: 'bonus',
    power: 6,
    packs: ['commu'],
    cible: 'TOUS',
  },
  {
    // Changée le 12/11/2026 : commune → rare, +3 au lieu de +5 ; revenue en
    // commune le 14/11/2026.
    id: 'petits-pas',
    name: 'Petits Pas',
    subtitle: '+3 pts petites games',
    rarity: 'C',
    glyph: '👣',
    description:
      '+3 points pour chaque game de moins de 5 kills, à chaque joueur.',
    effect: { kind: 'roue', action: { quoi: 'petites_games', moinsDe: 5, points: 3 } },
    nature: 'bonus',
    power: 12,
    packs: ['commu'],
    cible: 'TOUS',
  },
  {
    // Changée le 12/11/2026 : commune → ultra rare.
    id: 'couronnes-de-givre',
    name: 'Couronnes de Givre',
    subtitle: '+5 pts par Top 1',
    rarity: 'UR',
    glyph: '👑',
    description:
      '+5 points par Top 1 fait depuis la dernière fois que cette carte est tombée, à chaque joueur.',
    effect: { kind: 'roue', action: { quoi: 'par_top1', points: 5 } },
    nature: 'bonus',
    power: 69,
    packs: ['commu'],
    cible: 'TOUS',
  },
  {
    // Changée le 12/11/2026 : commune → ultra rare.
    id: 'givre-errant',
    name: 'Givre Errant',
    subtitle: '3 joueurs figent une game au hasard',
    rarity: 'UR',
    glyph: '🧊',
    description:
      'Trois joueurs tirés au sort figent une de leurs games au hasard, ni la meilleure ni la pire : plus aucune carte ne peut la toucher.',
    effect: { kind: 'roue', action: { quoi: 'fige_hasard', meilleureExclue: true } },
    nature: 'bonus',
    power: 65,
    packs: ['commu'],
    cible: 'TROIS',
  },
  {
    id: 'neige-melee',
    name: 'Neige Mêlée',
    subtitle: 'Échange 2 games aléatoires',
    rarity: 'C',
    glyph: '🔀',
    description:
      'Deux joueurs tirés au sort échangent une game au hasard : chacune prend le score de l’autre.',
    effect: { kind: 'roue', action: { quoi: 'echange_hasard' } },
    nature: 'bonus',
    power: 10,
    packs: ['commu'],
    cible: 'DEUX',
  },
  {
    // Changée le 12/11/2026 : rare → ultra rare.
    id: 'deneigement',
    name: 'Déneigement',
    subtitle: 'Suppression de la pire game',
    rarity: 'UR',
    glyph: '🧹',
    description:
      'La pire game libre de chaque joueur est supprimée : elle ne compte plus, son créneau est rendu.',
    effect: { kind: 'roue', action: { quoi: 'supprime_pire' } },
    nature: 'bonus',
    power: 73,
    packs: ['commu'],
    cible: 'TOUS',
  },
  {
    // Rare → légendaire le 14/11/2026.
    id: 'trois-glacons',
    name: 'Trois Glaçons',
    subtitle: '3 joueurs figent leur meilleure game',
    rarity: 'L',
    glyph: '🧊',
    description:
      'Trois joueurs tirés au sort parmi ceux qui ont joué au moins 30 games figent leur meilleure game pas encore figée.',
    effect: { kind: 'roue', action: { quoi: 'fige_meilleure', minGames: 30 } },
    nature: 'bonus',
    power: 91,
    packs: ['commu'],
    cible: 'TROIS',
  },
  {
    id: 'degel-double',
    name: 'Dégel Double',
    subtitle: 'Pire game ×2',
    rarity: 'R',
    glyph: '✖️',
    description:
      'La pire game libre de chaque joueur compte double.',
    effect: { kind: 'roue', action: { quoi: 'pire_fois', facteur: 2 } },
    nature: 'bonus',
    power: 34,
    packs: ['commu'],
    cible: 'TOUS',
  },
  {
    id: 'cime-eclatante',
    name: 'Cime Éclatante',
    subtitle: 'Meilleure game ×1,5',
    rarity: 'R',
    glyph: '⛰',
    description:
      'La meilleure game de chaque joueur compte ×1,5. Une game qui a déjà un multiplicateur n’en reçoit pas un second : c’est alors la meilleure qui n’en a pas. Jamais une game figée.',
    effect: { kind: 'roue', action: { quoi: 'meilleure_fois', facteur: 1.5 } },
    nature: 'bonus',
    power: 38,
    packs: ['commu'],
    cible: 'TOUS',
  },
  {
    // Rare → commune le 14/11/2026.
    id: 'triple-echo',
    name: 'Triple Écho',
    subtitle: 'Game aléatoire ×2 — 3 joueurs',
    rarity: 'C',
    glyph: '🎲',
    description:
      'Trois joueurs tirés au sort voient une game libre au hasard compter double.',
    effect: { kind: 'roue', action: { quoi: 'hasard_fois', facteur: 2 } },
    nature: 'bonus',
    power: 12,
    packs: ['commu'],
    cible: 'TROIS',
  },
  {
    id: 'contre-vent',
    name: 'Contre-Vent',
    subtitle: 'Échange meilleure ↔ pire',
    rarity: 'R',
    glyph: '↔️',
    description:
      'Deux joueurs tirés au sort : la meilleure game du premier et la pire du second échangent leur score — une carte déjà jouée dessus n’y change rien, seule une game figée y échappe.',
    effect: { kind: 'roue', action: { quoi: 'echange_meilleure_pire' } },
    nature: 'bonus',
    power: 46,
    packs: ['commu'],
    cible: 'DEUX',
  },
  {
    id: 'ronde-des-cimes',
    name: 'Ronde des Cimes',
    subtitle: 'Échange entre les 10 premiers',
    rarity: 'R',
    glyph: '🔄',
    description:
      'Les dix premiers du classement échangent une game en chaîne, dans un ordre tiré au sort — ni leur meilleure ni leur pire. Aucun point n’est créé ni perdu.',
    effect: { kind: 'roue', action: { quoi: 'chaine_tete' } },
    nature: 'bonus',
    power: 50,
    packs: ['commu'],
    cible: 'DIX_PREMIERS',
  },
  {
    id: 'miroir-des-cimes',
    name: 'Miroir des Cimes',
    subtitle: 'Clone meilleure → joueur aléatoire',
    rarity: 'UR',
    glyph: '🪞',
    description:
      'Un joueur tiré au sort reçoit, en points bonus, la meilleure game de toute la ligue. Son propriétaire la garde.',
    effect: { kind: 'roue', action: { quoi: 'clone_ligue' } },
    nature: 'bonus',
    power: 66,
    packs: ['commu'],
    cible: 'HASARD',
  },
  {
    id: 'calque-de-givre',
    name: 'Calque de Givre',
    subtitle: 'Clone meilleure → pire aléatoire',
    rarity: 'UR',
    glyph: '📋',
    description:
      'Deux joueurs tirés au sort : la pire game du premier prend le score de la meilleure game du second, qui garde la sienne. Seule une game figée y échappe.',
    effect: { kind: 'roue', action: { quoi: 'clone_sur_pire' } },
    nature: 'bonus',
    power: 70,
    packs: ['commu'],
    cible: 'DEUX',
  },
  {
    id: 'voleur-d-hiver',
    name: 'Voleur d’Hiver',
    subtitle: 'Vol de score',
    rarity: 'L',
    glyph: '🦹',
    description:
      'Un joueur tiré au sort prend le score total du joueur juste au-dessus de lui au classement. Celui du dessus garde le sien.',
    effect: { kind: 'roue', action: { quoi: 'vol_score' } },
    nature: 'bonus',
    power: 92,
    packs: ['commu'],
    cible: 'HASARD',
  },
  /* ===================== Booster Folie — la Roue de Folie ===================== */
  // Les roues de la Summer Ligue, reprises telles quelles le 03/11/2026.
  {
    id: 'morsure-du-froid',
    name: 'Morsure du Froid',
    subtitle: 'Une game au hasard ÷ 2',
    rarity: 'R',
    glyph: '🥶',
    description:
      'Pour chaque joueur, une game libre tirée au hasard est divisée par 2 (÷2, arrondi au supérieur). Les joueurs immunisés y échappent.',
    effect: { kind: 'roue', action: { quoi: 'hasard_divise', diviseur: 2 } },
    nature: 'malus',
    power: 36,
    packs: ['folie'],
    cible: 'TOUS',
  },
  {
    // Changée le 12/11/2026 : rare → ultra rare.
    id: 'grand-gel',
    name: 'Grand Gel',
    subtitle: 'Chacun fige une game au hasard',
    rarity: 'UR',
    glyph: '❄️',
    description:
      'Chaque joueur fige une de ses games au hasard, jamais la pire : plus aucune carte ne peut la toucher.',
    effect: { kind: 'roue', action: { quoi: 'fige_hasard', meilleureExclue: false } },
    nature: 'bonus',
    power: 67,
    packs: ['folie'],
    cible: 'TOUS',
  },
  {
    // Changée le 12/11/2026 : un Joker au lieu de trois.
    id: 'pluie-de-jokers',
    name: 'Pluie de Jokers',
    subtitle: '1 Joker pour tout le monde',
    rarity: 'R',
    glyph: '🃏',
    description:
      'Chaque joueur reçoit un Joker, dans la limite de 5 en main.',
    effect: { kind: 'roue', action: { quoi: 'jokers', nombre: 1 } },
    nature: 'bonus',
    power: 30,
    packs: ['folie'],
    cible: 'TOUS',
  },
  {
    id: 'nuit-blanche',
    name: 'Nuit Blanche',
    subtitle: 'Pire game à 0',
    rarity: 'UR',
    glyph: '🌑',
    description:
      'La pire game de chaque joueur tombe à 0 point, même si une carte l’a déjà touchée — sauf une game figée, et les joueurs immunisés.',
    effect: { kind: 'roue', action: { quoi: 'pire_a_zero' } },
    nature: 'malus',
    power: 72,
    packs: ['folie'],
    cible: 'TOUS',
  },
  {
    id: 'blizzard-general',
    name: 'Blizzard Général',
    subtitle: 'Échange général',
    rarity: 'UR',
    glyph: '🌪',
    description:
      'Tous les joueurs entrent dans une chaîne tirée au sort : chacun donne une game au hasard, pas figée, au suivant. Les immunisés n’y entrent pas.',
    effect: { kind: 'roue', action: { quoi: 'echange_general' } },
    nature: 'bonus',
    power: 76,
    packs: ['folie'],
    cible: 'TOUS',
  },
  {
    id: 'barillet-de-glace',
    name: 'Barillet de Glace',
    subtitle: 'Roulette russe',
    rarity: 'L',
    glyph: '🔫',
    description:
      'Six joueurs tirés au sort font la course, comme en duel : le seul qui ne passe pas la ligne perd définitivement sa meilleure game. Les immunisés n’y entrent pas.',
    effect: { kind: 'roue', action: { quoi: 'roulette' } },
    nature: 'malus',
    power: 96,
    packs: ['folie'],
    cible: 'SIX',
  },
  /* ===================== Booster Finisseur — la Roue des Finisseurs ===================== */
  // Les roues de la Summer Ligue, reprises telles quelles le 03/11/2026.
  {
    id: 'neige-fondue',
    name: 'Neige Fondue',
    subtitle: 'Pas de chance',
    rarity: 'C',
    glyph: '💧',
    description:
      'Pas de chance : rien ne change, ni points, ni games, ni protection.',
    effect: { kind: 'roue', action: { quoi: 'rien' } },
    nature: 'bonus',
    power: 4,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'sommet-atteint',
    name: 'Sommet Atteint',
    subtitle: '+10 pts bonus',
    rarity: 'C',
    glyph: '🚩',
    description:
      '+10 points bonus sur ton total, tout de suite.',
    effect: { kind: 'bonus_total', value: 10 },
    nature: 'bonus',
    power: 11,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'drapeau-plante',
    name: 'Drapeau Planté',
    subtitle: '+15 pts bonus',
    rarity: 'R',
    glyph: '🏳',
    description:
      '+15 points bonus sur ton total, tout de suite.',
    effect: { kind: 'bonus_total', value: 15 },
    nature: 'bonus',
    power: 31,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'remontee',
    name: 'Remontée',
    subtitle: 'Pire game ramenée à la moyenne',
    rarity: 'R',
    glyph: '📈',
    description:
      'Ta pire game libre remonte au niveau de la moyenne de toutes tes games.',
    effect: { kind: 'roue', action: { quoi: 'pire_moyenne' } },
    nature: 'bonus',
    power: 44,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'abri-de-glace',
    name: 'Abri de Glace',
    subtitle: 'Immunité 2 jours',
    rarity: 'R',
    glyph: '🛡',
    description:
      'Pendant 2 jours (48 h), aucune action négative ne peut te viser. Une immunité en cours est prolongée.',
    effect: { kind: 'immunite', heures: 48 },
    nature: 'bonus',
    power: 48,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'soudure-de-glace',
    name: 'Soudure de Glace',
    subtitle: 'Fusion des 2 pires games',
    rarity: 'UR',
    glyph: '🔗',
    description:
      'Tes 2 pires games libres n’en font plus qu’une, qui vaut leur somme : tu ne perds aucun point, et un créneau de game se libère.',
    effect: { kind: 'roue', action: { quoi: 'fusion_pires' } },
    nature: 'bonus',
    power: 64,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    // Changée le 12/11/2026 : −15 au lieu de −20.
    id: 'eboulement',
    name: 'Éboulement',
    subtitle: '−15 pts à un joueur',
    rarity: 'UR',
    glyph: '🪨',
    description:
      'Tu la gardes et désignes un joueur : il perd −15 points sur son total. Tu n’y gagnes rien. Un joueur immunisé ne peut pas être visé.',
    effect: { kind: 'malus_choisi', value: 15 },
    nature: 'malus',
    power: 68,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'statue-de-givre',
    name: 'Statue de Givre',
    subtitle: 'Fige ta meilleure game',
    rarity: 'UR',
    glyph: '🗿',
    description:
      'Ta meilleure game est figée — jamais ta pire : plus aucune carte ne peut la toucher. Si elle l’est déjà, c’est la suivante.',
    effect: { kind: 'roue', action: { quoi: 'fige_meilleure', minGames: 0 } },
    nature: 'bonus',
    power: 80,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    id: 'troc-des-neiges',
    name: 'Troc des Neiges',
    subtitle: 'Échange pire contre meilleure',
    rarity: 'L',
    glyph: '🔁',
    description:
      'Tu la gardes et désignes un joueur : ta pire game et sa meilleure, pas figées, échangent leur score. Une seule fois par joueur, sauf la revanche contre qui t’a visé. Un joueur immunisé ne peut pas être visé.',
    effect: { kind: 'echange_cible' },
    nature: 'bonus',
    power: 94,
    packs: ['finisseur'],
    cible: 'HASARD',
  },
  {
    // Folie, ajoutée le 12/11/2026 : la game figée du Perso, mais quand on veut.
    id: 'cryogenisation',
    name: 'Cryogénisation',
    subtitle: 'Fige ta meilleure game, quand tu veux',
    rarity: 'L',
    glyph: '🧊',
    description:
      'Tu la gardes, et tu dis quand : ta meilleure game est figée, jamais ta pire. Plus aucune carte ne peut la toucher.',
    effect: { kind: 'fige_garde' },
    nature: 'bonus',
    power: 93,
    packs: ['folie'],
    cible: 'HASARD',
  },
];

/**
 * Le coup du Verglas, reçu par sa victime quand la modération le joue : −10 pts
 * sur son total, tout de suite, hors de toute game (`CarteEnAttente.points`).
 * Il ne sort d'aucun booster (il n'est pas dans `CARDS`) ; `getCard` le
 * connaît, pour l'afficher.
 */
export const COUP_DE_VERGLAS: CardDefinition = {
  id: 'plaque-verglas-coup',
  name: 'Verglas',
  subtitle: '−10 pts',
  rarity: 'UR',
  glyph: '🧊',
  description: '−10 points sur ton total, envoyé par un autre joueur.',
  effect: { kind: 'malus_points', value: 10 },
  nature: 'malus',
  power: 64,
  packs: ['perso'],
  cible: 'HASARD',
};

/**
 * La trace d'un Pacte du Givre sur la game de l'autre joueur : elle y dit d'où
 * vient l'échange, et en fait une game qui porte une carte — aucune autre ne
 * s'y posera, et elle ne se corrige pas. Elle ne sort d'aucun booster.
 */
export const PACTE_SUBI: CardDefinition = {
  id: 'pacte-du-givre-subi',
  name: 'Pacte du Givre',
  subtitle: 'Game échangée',
  rarity: 'L',
  glyph: '🤝',
  description: 'Ta game a échangé son score avec celle d’un autre joueur, qui a joué un Pacte du Givre.',
  effect: { kind: 'echange_choisi', minGames: 0 },
  nature: 'malus',
  power: 94,
  packs: ['perso'],
  cible: 'HASARD',
};

/**
 * La trace d'un Troc des Neiges sur la game du joueur visé : elle dit d'où
 * vient l'échange, en fait une game qui porte une carte, et retient qui l'a
 * visé (`paireId`) — pour la revanche. Elle ne sort d'aucun booster.
 */
export const TROC_SUBI: CardDefinition = {
  id: 'troc-des-neiges-subi',
  name: 'Troc des Neiges',
  subtitle: 'Game échangée',
  rarity: 'L',
  glyph: '🔁',
  description: 'Ta meilleure game a échangé son score avec la pire game d’un finisseur, qui a joué un Troc des Neiges.',
  effect: { kind: 'echange_cible' },
  nature: 'malus',
  power: 94,
  packs: ['finisseur'],
  cible: 'HASARD',
};

const CARD_INDEX = new Map([...CARDS, COUP_DE_VERGLAS, PACTE_SUBI, TROC_SUBI].map((c) => [c.id, c]));

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
  if (cible === 'TROIS') return 3;
  if (cible === 'SIX') return 6;
  return 0;
}

/**
 * La carte se joue-t-elle en course, comme un duel ? La Roulette russe du
 * Folie : pas de rail de joueurs, une course à six, où le premier tiré est
 * celui qui ne passe pas la ligne.
 */
export function estUneCourse(card: Pick<CardDefinition, 'effect'>): boolean {
  return card.effect.kind === 'roue' && card.effect.action.quoi === 'roulette';
}

/** Quand une carte se joue : à la prochaine game, sur une game jouée, ou tout de suite. */
export function momentDe(effect: CardEffect): MomentCarte {
  switch (effect.kind) {
    case 'releve_pire':
    case 'multiplie_jouee':
    case 'fige_meilleure':
    case 'supprime_pire':
      return 'JOUEE';
    case 'snowflakes':
    case 'bonus_total':
    case 'game_supplementaire':
    case 'immunite':
    case 'roue':
      return 'INSTANT';
    case 'joker':
    case 'malus_choisi':
    case 'echange_choisi':
    case 'echange_cible':
    case 'fige_garde':
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
    case 'bonus_total':
    case 'malus_points':
    case 'malus_choisi':
    case 'plancher':
    case 'bonus_top':
    case 'petite_game':
    case 'progression_kills':
      return Math.abs(effect.value);
    case 'kills_paliers':
      return effect.cap;
    case 'multiplicateur_game':
      // Sans plafond, la carte suit la game : pas de « au plus » à annoncer.
      return effect.cap === undefined ? null : Math.min(effect.cap, Math.round(SCORE_MAX * (effect.value - 1)));
    case 'diviseur_game':
      return Math.min(effect.cap, Math.round(SCORE_MAX * (1 - 1 / effect.value)));
    case 'multiplie_jouee':
      return Math.min(effect.cap, Math.round(SCORE_MAX * (effect.value - 1)));
    case 'clone_kills':
      // Sans plafond, elle suit la partie : pas de « au plus » à annoncer.
      return effect.cap === undefined ? null : Math.min(effect.cap, GAME_LIMITS.maxKills);
    case 'echange':
      // Sans plafond, c'est la game entière qui change de mains.
      return effect.cap ?? null;
    case 'releve_pire':
      return effect.cap;
    case 'snowflakes':
    case 'flocons_doubles':
    case 'game_supplementaire':
    case 'immunite':
    case 'fige_meilleure':
    case 'supprime_pire':
    case 'joker':
    case 'echange_choisi':
    case 'echange_cible':
    case 'fige_garde':
    case 'roue':
      // Les roues de la Summer suivent les games : pas de « au plus ».
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
    case 'bonus_total':
      return `+${effect.value} pts bonus`;
    case 'malus_points':
      return `−${effect.value} pts`;
    case 'multiplicateur_game':
      return effect.cap === undefined
        ? `game ×${fr(effect.value)}`
        : `score ×${fr(effect.value)}, max +${effect.cap}`;
    case 'diviseur_game':
      return `score ÷${fr(effect.value)}, max −${effect.cap}`;
    case 'clone_kills':
      return effect.cap === undefined ? 'kills du meilleur' : `kills du meilleur, max +${effect.cap}`;
    case 'plancher':
      return `au moins ${effect.value} pts`;
    case 'bonus_top':
      return `+${effect.value} pts si Top ${effect.top}`;
    case 'petite_game':
      return `+${effect.value} pts sous ${effect.moinsDe} kills`;
    case 'kills_paliers':
      return `+${effect.value} pts par ${effect.par} kills, max +${effect.cap}`;
    case 'progression_kills':
      return `+${effect.value} pts si plus de kills`;
    case 'flocons_doubles':
      return 'flocons ×2';
    case 'echange':
      return effect.cap === undefined
        ? `échange de ${effect.sur === 'kills' ? 'kills' : 'games'}`
        : `échange de ${effect.sur === 'kills' ? 'kills' : 'points'}, max ${effect.cap}`;
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
    case 'supprime_pire':
      return 'pire game supprimée';
    case 'malus_choisi':
      return `−${effect.value} pts au joueur choisi`;
    case 'joker':
      return 'une game annulable';
    case 'echange_choisi':
      return 'échange de games choisi';
    case 'echange_cible':
      return 'pire contre meilleure';
    case 'fige_garde':
      return 'meilleure game figée, quand tu veux';
    case 'roue':
      return resumeRoue(effect.action);
  }
}

/** Une action des roues de la Summer, en quelques mots. */
function resumeRoue(action: ActionRoue): string {
  const fr = (n: number) => n.toLocaleString('fr-FR');
  switch (action.quoi) {
    case 'meilleure_fois':
      return `meilleure game ×${fr(action.facteur)}`;
    case 'pire_fois':
      return `pire game ×${fr(action.facteur)}`;
    case 'hasard_fois':
      return `une game ×${fr(action.facteur)}`;
    case 'hasard_divise':
      return `une game ÷${fr(action.diviseur)}`;
    case 'flocons':
      return `+${fr(action.montant)} flocons pour tous`;
    case 'supprime_pire':
      return 'pire game supprimée';
    case 'echange_meilleure_pire':
      return 'meilleure ↔ pire';
    case 'echange_hasard':
      return 'échange de games';
    case 'tempete':
      return 'Tempête de neige';
    case 'clone_ligue':
      return 'meilleure game de la ligue';
    case 'clone_sur_pire':
      return 'pire game clonée';
    case 'meilleure_aux_derniers':
      return 'aux cinq derniers';
    case 'par_top1':
      return `+${action.points} pts par Top 1`;
    case 'vol_score':
      return 'vol de score';
    case 'fige_meilleure':
      return 'meilleure game figée';
    case 'fige_hasard':
      return 'une game figée';
    case 'chaine_tete':
      return 'échange des 10 premiers';
    case 'echange_general':
      return 'échange général';
    case 'petites_games':
      return `+${action.points} pts par petite game`;
    case 'roulette':
      return 'roulette russe';
    case 'pire_a_zero':
      return 'pire game à 0';
    case 'jokers':
      return `+${action.nombre} Jokers`;
    case 'fusion_pires':
      return 'deux pires fusionnées';
    case 'pire_moyenne':
      return 'pire game à la moyenne';
    case 'rien':
      return 'rien ne change';
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

/**
 * Les vignettes de l'illustration d'une carte (200 et 480 px de large), et le
 * `srcset` qui les propose avec l'illustration entière : une petite carte n'a
 * pas à télécharger ni à décoder une image de 1 000 px. Null si la carte n'en a
 * pas — elle garde alors son illustration entière.
 */
export function cardVignettes(id: string): { petite: string; moyenne: string; srcset: string } | null {
  return CARD_VIGNETTES[id] ?? null;
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
    declencheur: 'Tous les trente-cinq subs de la saison.',
    glyph: '📣',
    gradient: ['#2f6f8f', '#10283a'],
    portee: 'TOUS',
    pourQui: 'ceux que le sort désigne',
    // Une légendaire sur soixante-sept, une ultra rare sur quarante : un peu
    // plus de légendaires qu'au Perso sans chance (02/11/2026).
    weights: { C: 74_000, R: 22_000, UR: 2_500, L: 1_500 },
  },
  {
    id: 'folie',
    name: 'Booster Folie',
    tagline: 'Rien en dessous de rare',
    declencheur: 'Tous les cent cinquante subs de la saison.',
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
    declencheur: 'À la 35ᵉ game de la Mini Ligue ; à la dernière game de la saison ensuite.',
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
