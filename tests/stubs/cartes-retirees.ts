import type { CardDefinition, PackId, Rarity } from '@/lib/domain/types';

/**
 * Les cartes retirées du catalogue le 2 octobre 2026, quand il a été ramené à
 * une carte par rareté le temps de repenser toutes les cartes.
 *
 * Elles restent ici, telles qu'elles étaient, pour que les tests continuent
 * d'exercer chaque genre d'effet de `lib/services/effects.ts` — multiplicateurs,
 * malus, échanges, cartes sur une game jouée, effets immédiats. Elles ne sont
 * dans aucun booster : `avecCartesRetirees` les rend seulement trouvables par
 * `getCard`, dans les tests qui le demandent.
 *
 * Ne rien importer ici de `@/lib/domain/catalog` : le module est remplacé par
 * le mock qui s'appuie sur ce fichier.
 */
export const CARTES_RETIREES: readonly CardDefinition[] = [
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
  {
    id: 'poudreuse',
    name: 'Poudreuse',
    subtitle: '+5 pts bonus',
    rarity: 'C',
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
    rarity: 'C',
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
    rarity: 'C',
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
    rarity: 'C',
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
    rarity: 'R'  /* un malus : jamais parmi les communes */,
    glyph: '🥶',
    description: 'MALUS : un joueur tiré au sort perd 4 points sur sa prochaine game.',
    effect: { kind: 'malus_points', value: 4 },
    nature: 'malus',
    power: 28,
    packs: ['commu'],
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
  {
    id: 'second-souffle',
    name: 'Second Souffle',
    subtitle: '+12 pts bonus',
    rarity: 'R',
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
    rarity: 'R',
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
    rarity: 'R',
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
    rarity: 'R',
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
    rarity: 'R',
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
    rarity: 'R',
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
    rarity: 'R',
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
    rarity: 'R',
    glyph: '⛸',
    description:
      'MALUS : la prochaine game d’un joueur tiré au sort est divisée par 2, jusqu’à −15 points.',
    effect: { kind: 'diviseur_game', value: 2, cap: 15 },
    nature: 'malus',
    power: 68,
    packs: ['commu', 'folie'],
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

/**
 * Le catalogue, augmenté des cartes retirées pour `getCard` seulement. À
 * passer à `vi.mock` :
 *
 *     vi.mock('@/lib/domain/catalog', async (vrai) =>
 *       (await import('./stubs/cartes-retirees')).avecCartesRetirees(await vrai()),
 *     );
 */
export function avecCartesRetirees<M extends { getCard: (id: string) => CardDefinition | null }>(vrai: M): M {
  const index = new Map(CARTES_RETIREES.map((c) => [c.id, c]));
  return { ...vrai, getCard: (id: string) => vrai.getCard(id) ?? index.get(id) ?? null };
}

interface Catalogue {
  CARDS: readonly CardDefinition[];
  getCard: (id: string) => CardDefinition | null;
  cartesDuPack: (packId: PackId) => CardDefinition[];
  poolDuPack: (packId: PackId) => Record<Rarity, string[]>;
}

/**
 * Les boosters tels qu'ils étaient : les cartes retirées y sont tirées de
 * nouveau, chacune dans ses boosters d'alors. Pour les tests qui doivent
 * *tirer* un genre de carte que le catalogue n'a plus — une carte de flocons,
 * une carte à deux, un malus sur la tête du classement — et vérifier ce que
 * l'ouverture en fait. `tirePack` passe par `poolDuPack` : le mock suffit.
 */
export function avecAnciensBoosters<M extends Catalogue>(vrai: M): M {
  const toutes = [...vrai.CARDS, ...CARTES_RETIREES];
  const cartesDuPack = (packId: PackId) => toutes.filter((c) => c.packs.includes(packId));
  const poolDuPack = (packId: PackId) => {
    const pool = { C: [], PC: [], R: [], SR: [], UR: [], L: [] } as unknown as Record<Rarity, string[]>;
    for (const c of cartesDuPack(packId)) pool[c.rarity].push(c.id);
    return pool;
  };
  return { ...avecCartesRetirees(vrai), cartesDuPack, poolDuPack };
}
