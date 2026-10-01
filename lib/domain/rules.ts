/**
 * Constantes de la saison. Un seul endroit à toucher pour rééquilibrer la ligue.
 *
 * Ces valeurs ne sont jamais lues depuis le client : elles sont importées par
 * les routes serveur et par le rendu, mais un navigateur qui les modifie ne
 * modifie que son propre affichage.
 */

import type { PackId, Placement, Rarity } from './types';

export const SEASON = {
  name: 'Winter Ligue',
  edition: 'Saison 1',
  /** Bornes indicatives affichées dans l'entête. */
  startsAt: '2026-12-01T00:00:00.000Z',
  endsAt: '2027-03-01T00:00:00.000Z',
  /** Nombre de joueurs qualifiés pour la finale. */
  finalistCount: 6,
  /**
   * La chaîne Twitch de la ligue, en minuscules : sa streameuse administre,
   * ne joue pas, et n'a jamais de game. `TWITCH_BROADCASTER_LOGIN` la remplace.
   */
  chaine: 'lriaa',
} as const;

/* ------------------------------- Scoring -------------------------------- */

/** Points fixes accordés au classement de fin de partie. */
export const PLACEMENT_POINTS: Record<'1' | '2' | '3', number> = {
  '1': 20,
  '2': 15,
  '3': 8,
};

export function placementPoints(placement: Placement): number {
  if (placement === null) return 0;
  return PLACEMENT_POINTS[String(placement) as '1' | '2' | '3'] ?? 0;
}

/** Bornes de saisie d'une game. Toute valeur hors bornes est rejetée. */
export const GAME_LIMITS = {
  minKills: 0,
  maxKills: 60,
  /**
   * Bornes du cumul de bonus sur une seule game. Large, mais pas infini : une
   * game ne doit jamais peser plus que quelques bonnes parties réunies.
   */
  minBonusPoints: -80,
  maxBonusPoints: 80,
} as const;

/**
 * Nombre de games comptabilisées par joueur, ajustable par la modération.
 *
 * Aligné sur la Summer Ligue. À ce volume, un joueur assidu termine autour de
 * 1 000 points : une carte plafonnée à 25 points pèse alors 2 % de sa saison,
 * mais 17 % de celle d'un joueur occasionnel. Les cartes sont donc surtout un
 * outil de rattrapage.
 *
 * C'est aussi le seuil du pack Finisseur : la dernière game saisie l'ouvre.
 */
export const DEFAULT_MAX_GAMES_PER_PLAYER = 60;

/* ------------------------------- Économie ------------------------------- */

/**
 * Les flocons ont deux sources, et c'est volontaire :
 *
 *   1. **Le jeu** — kills et placements. C'est la seule source qui crée un
 *      écart *entre* joueurs. Un bon joueur est plus riche qu'un mauvais.
 *   2. **Les subs Twitch** — versés à *tous* les joueurs actifs à parts égales
 *      (voir SUBS plus bas). Le chat fait grossir l'économie entière, sans
 *      jamais faire monter quelqu'un en particulier.
 *
 * Ils servent à deux choses : se miser dans les affrontements, et améliorer
 * les taux de rareté quand un pack s'ouvre pour soi — voir `CHANCE`. Ils ne
 * s'échangent contre rien d'autre.
 */
export const ECONOMY = {
  /** Flocons gagnés par kill. La récompense de base du skill. */
  perKill: 25,
  /** Flocons gagnés selon le placement. Un Top 1 vaut environ 16 kills. */
  perPlacement: { '1': 400, '2': 250, '3': 120 } as Record<'1' | '2' | '3', number>,
  /** Flocons gagnés simplement en enregistrant une game. */
  participation: 150,
  /** Dotation de départ à l'inscription : de quoi miser un premier affrontement. */
  welcomeGrant: 400,
  /**
   * Le solde maximum. Ce qui dépasse est perdu.
   *
   * Vingt mille : une game rapporte cinq cents flocons en moyenne, un joueur
   * assidu en joue une quinzaine par semaine, et les paliers de subs ajoutent
   * deux mille par semaine dans une bonne semaine. On approche donc du plafond
   * en un mois et demi de jeu sans rien miser — pas en une semaine — sur une
   * saison de deux à trois mois et de soixante games. C'est aussi ce qui borne
   * la chance : elle est pleine au plafond, jamais avant.
   */
  soldeMax: 20_000,
} as const;

/* --------------------------- Subs Twitch --------------------------------- */

export type SubRewardKind = 'FLOCONS' | 'PACK';

export interface SubMilestone {
  /** Tous les N subs cumulés de la saison. */
  every: number;
  kind: SubRewardKind;
  /** Flocons versés à chaque joueur actif, ou identifiant du pack mis en file. */
  amount?: number;
  packId?: PackId;
  label: string;
  description: string;
}

/**
 * Paliers de subs. Chaque palier se déclenche à *chaque* multiple atteint.
 *
 * Les flocons vont à **tous les joueurs actifs**. Les packs sont mis en file :
 * la streameuse les ouvre à l'antenne, et la carte tombe sur tout le monde ou
 * sur un joueur tiré au sort — jamais sur quelqu'un que le chat aurait choisi.
 */
export const SUB_MILESTONES: readonly SubMilestone[] = [
  {
    every: 5,
    kind: 'FLOCONS',
    amount: 40,
    label: 'Bourrasque',
    description: '40 flocons pour chaque joueur actif.',
  },
  {
    every: 25,
    kind: 'FLOCONS',
    amount: 200,
    label: 'Rafale',
    description: '200 flocons de plus pour tout le monde.',
  },
  {
    every: 50,
    kind: 'PACK',
    packId: 'commu',
    label: 'Booster Commu',
    description: 'Un Booster Commu à ouvrir à l’antenne : sa carte tombe sur ceux que le sort désigne.',
  },
  {
    every: 200,
    kind: 'PACK',
    packId: 'folie',
    label: 'Booster Folie',
    description: 'Un Booster Folie à ouvrir à l’antenne : la carte la plus forte de la saison.',
  },
];

export const SUBS = {
  milestones: SUB_MILESTONES,
  /** Incréments proposés dans le panneau de modération. */
  adminSteps: [1, 5, 10, 25, 50, 100] as const,
} as const;

/* ------------------------------- Les packs ------------------------------- */

export const PACKS_REGLES = {
  /**
   * Un pack Perso tous les N subs offerts par un même joueur, de niveau 1 ou
   * 2 — et un par sub de niveau 3, voir `packsPersoAcquis`.
   *
   * C'est la seule chose qu'un sub achète à quelqu'un en particulier, et elle
   * est bornée deux fois : le pack ne contient que des bonus, et chacun est
   * plafonné à `CARD_IMPACT_CAP` sur une seule game.
   */
  persoTousLes: 5,
} as const;

/**
 * Les packs Perso que valent les subs payés par un même joueur : un tous les
 * `persoTousLes` subs offerts de niveau 1 ou 2, et un par sub de niveau 3 —
 * pris pour soi ou offert, nouveau ou resub. Un sub de niveau 3 coûte à peu
 * près cinq subs simples : il vaut ce que valent cinq subs offerts. Il compte
 * pour un au compteur de la saison, comme les autres.
 *
 * La modération les ajoute à la main ; ceci ne fait que dire combien.
 */
export function packsPersoAcquis(offerts: number, niveau3 = 0): number {
  return Math.floor(Math.max(0, offerts) / PACKS_REGLES.persoTousLes) + Math.max(0, Math.floor(niveau3));
}

/* ----------------------- Évènements de subs ------------------------------ */

/**
 * Ce qu'un évènement change, le temps qu'il dure.
 *
 *  - `FLOCONS_DOUBLES`   — les gains de game doublés ;
 *  - `CARTES_RENFORCEES` — les points des cartes majorés de moitié.
 */
export type EvenementKind = 'FLOCONS_DOUBLES' | 'CARTES_RENFORCEES';

export interface EvenementSubs {
  /** Tous les N subs cumulés. */
  every: number;
  kind: EvenementKind;
  dureeMinutes: number;
  label: string;
  /** La phrase entière, pour le bandeau et les règles. */
  description: string;
  /** Le même effet en trois mots, pour une carte : « Flocons ×2 ». */
  resume: string;
}

/**
 * Les paliers qui déclenchent un évènement, et ce qu'ils déclenchent.
 *
 * Ils s'ajoutent aux paliers de flocons et de packs, ils ne les remplacent
 * pas : un palier de flocons donne quelque chose à garder, un évènement donne
 * quelque chose à **faire maintenant**. C'est pour ça que les fenêtres sont
 * courtes — une ou deux heures, le temps d'un live.
 *
 * Tous s'appliquent à tout le monde. Ils ne versent rien à personne, ils
 * changent les règles pendant leur fenêtre.
 */
export const EVENEMENTS_SUBS: readonly EvenementSubs[] = [
  {
    every: 100,
    kind: 'FLOCONS_DOUBLES',
    dureeMinutes: 60,
    label: 'Avalanche',
    description: 'Les flocons de chaque game sont doublés pendant une heure.',
    resume: 'Flocons ×2',
  },
  {
    every: 200,
    kind: 'CARTES_RENFORCEES',
    dureeMinutes: 60,
    label: 'Blizzard',
    description: 'Les cartes de booster valent une fois et demie leurs points pendant une heure.',
    resume: 'Cartes ×1,5',
  },
  {
    every: 500,
    kind: 'FLOCONS_DOUBLES',
    dureeMinutes: 120,
    label: 'Tempête',
    description: 'Les flocons de chaque game sont doublés pendant deux heures.',
    resume: 'Flocons ×2',
  },
];

/** Les facteurs qu'un évènement applique. Un seul par genre, jamais cumulés. */
export const FACTEURS_EVENEMENTS: Record<EvenementKind, number> = {
  FLOCONS_DOUBLES: 2,
  CARTES_RENFORCEES: 1.5,
};

/** Les évènements dont un palier a été franchi entre deux totaux de subs. */
export function evenementsDeclenches(from: number, to: number): EvenementSubs[] {
  const declenches: EvenementSubs[] = [];
  for (const e of EVENEMENTS_SUBS) {
    const avant = Math.floor(from / e.every);
    const apres = Math.floor(to / e.every);
    for (let i = 0; i < apres - avant; i += 1) declenches.push(e);
  }
  return declenches;
}

/**
 * Le facteur en vigueur pour un genre, à partir des genres actifs.
 *
 * Pas de cumul : plusieurs évènements du même genre donnent le facteur du
 * genre, une fois.
 */
export function facteurEvenement(kind: EvenementKind, actifs: readonly EvenementKind[]): number {
  return actifs.includes(kind) ? FACTEURS_EVENEMENTS[kind] : 1;
}

/**
 * Le prochain évènement à tomber, celui dont le palier est le plus proche.
 *
 * À égalité de distance, le plus grand palier gagne : c'est lui qu'on annonce,
 * les autres tombent de toute façon en même temps.
 */
export function prochainEvenement(totalSubs: number): {
  evenement: EvenementSubs;
  remaining: number;
  progress: number;
} | null {
  let meilleur: { evenement: EvenementSubs; remaining: number; progress: number } | null = null;
  for (const e of EVENEMENTS_SUBS) {
    const dans = e.every - (totalSubs % e.every);
    const candidat = { evenement: e, remaining: dans, progress: (totalSubs % e.every) / e.every };
    if (
      !meilleur ||
      dans < meilleur.remaining ||
      (dans === meilleur.remaining && e.every > meilleur.evenement.every)
    ) {
      meilleur = candidat;
    }
  }
  return meilleur;
}

/** Un palier à venir, quel que soit son genre : flocons, booster ou évènement. */
export interface PalierAVenir {
  genre: 'FLOCONS' | 'PACK' | 'EVENEMENT';
  label: string;
  every: number;
  /** Ce qu'il donne, en quelques mots : « +40 ❄ pour chacun », « Flocons ×2 · 1 h ». */
  resume: string;
  /** Combien de subs il manque. */
  remaining: number;
  /** Où l'on en est du cycle, de 0 à 1. */
  progress: number;
}

/**
 * Les prochains paliers de la saison, tous genres confondus, du plus proche au
 * plus lointain — à égalité, le plus rare d'abord. C'est la route que montre
 * le compteur de subs.
 */
export function prochainsPaliers(totalSubs: number, combien = 4): PalierAVenir[] {
  const position = (every: number) => ({
    remaining: every - (totalSubs % every),
    progress: (totalSubs % every) / every,
  });
  const paliers: PalierAVenir[] = [
    ...SUB_MILESTONES.map((m) => ({
      genre: m.kind,
      label: m.label,
      every: m.every,
      resume: m.kind === 'FLOCONS' ? `+${m.amount} ❄ pour chacun` : 'À ouvrir à l’antenne',
      ...position(m.every),
    })),
    ...EVENEMENTS_SUBS.map((e) => ({
      genre: 'EVENEMENT' as const,
      label: e.label,
      every: e.every,
      resume: `${e.resume} · ${e.dureeMinutes / 60} h`,
      ...position(e.every),
    })),
  ];
  return paliers.sort((a, b) => a.remaining - b.remaining || b.every - a.every).slice(0, combien);
}

/** Prochain palier atteint pour chaque type, à partir d'un total de subs. */
export function nextMilestone(
  totalSubs: number,
): { milestone: SubMilestone; remaining: number; progress: number } | null {
  let best: { milestone: SubMilestone; remaining: number; progress: number } | null = null;
  for (const milestone of SUB_MILESTONES) {
    const remaining = milestone.every - (totalSubs % milestone.every);
    const progress = (milestone.every - remaining) / milestone.every;
    if (!best || remaining < best.remaining) best = { milestone, remaining, progress };
  }
  return best;
}

/**
 * Paliers franchis en passant de `from` à `to` subs. Retourne une entrée par
 * franchissement — passer de 0 à 12 déclenche donc deux Bourrasques.
 */
export function crossedMilestones(from: number, to: number): SubMilestone[] {
  const crossed: SubMilestone[] = [];
  for (const milestone of SUB_MILESTONES) {
    const before = Math.floor(from / milestone.every);
    const after = Math.floor(to / milestone.every);
    for (let i = 0; i < after - before; i += 1) crossed.push(milestone);
  }
  return crossed;
}

/* ----------------------------- Raretés et taux --------------------------- */

/** Ordre d'affichage et de comparaison des raretés. */
export const RARITY_ORDER: Record<Rarity, number> = {
  C: 0,
  R: 1,
  UR: 2,
  L: 3,
};

/**
 * LA table des taux de base. C'est ici, et nulle part ailleurs, qu'on règle la
 * rareté.
 *
 * Les poids sont exprimés **sur 100 000** plutôt qu'en pourcentages : on peut
 * ainsi descendre au millième de pour cent sans jamais manipuler de flottant,
 * et la somme se vérifie exactement (un test échoue si elle ne fait pas
 * 100 000).
 *
 * Un pack ne donne qu'**une** carte. Le Perso tire à ces taux : une
 * légendaire sur cinq cents, une ultra rare sur soixante-dix-sept.
 *
 * Le calibrage, sur une saison de l'ordre de 4 000 subs (la Summer Ligue) :
 * environ 300 Perso, 80 Commu, 15 Finisseur et 7 Folie, soit une ou deux
 * légendaires et une dizaine d'ultra rares sur toute la saison. La légendaire
 * reste un évènement, et personne ne l'a pour une poignée de subs. Le Perso,
 * le seul qui s'obtient en offrant des subs, est volontairement le plus sobre
 * en légendaires : offrir davantage ne doit pas faire tirer mieux que jouer.
 */
export const RARITY_WEIGHTS_BASE: Record<Rarity, number> = {
  C: 83_000, // 83 %
  R: 15_500, // 15,5 %
  UR: 1_300, // 1,3 %
  L: 200, // 0,2 %
};

/** Total attendu de n'importe quelle table de poids. */
export const WEIGHT_TOTAL = 100_000;

/**
 * La chance : ce que les flocons font aux taux.
 *
 * Quand un booster s'ouvre **pour un joueur**, son solde de flocons pousse les
 * raretés vers le haut. Le poids de chaque rareté au-dessus de la commune est
 * multiplié par `1 + chance` — le **multiplicateur**, de ×1 à ×1,5 —, la
 * commune absorbe la différence, et la somme reste exactement `WEIGHT_TOTAL`.
 *
 * Le multiplicateur monte linéairement avec le solde, et plafonne à ×1,5 au
 * solde maximum. Il a plafonné à ×2 : un compte plein doublait ses
 * légendaires, ce qui pesait trop pour une saison qui n'en voit qu'une ou
 * deux. Au Booster Perso, ×1,5 fait passer la légendaire de 0,2 % à 0,3 %. Un
 * joueur riche tire mieux, il ne tire pas à coup sûr — et les flocons ne
 * s'achètent pas, ils se gagnent en jouant.
 *
 * Les flocons ne sont **pas dépensés** : les mêmes servent à miser dans les
 * affrontements. Tenir son solde pour tirer mieux, ou le risquer pour le
 * doubler, c'est le seul arbitrage que la monnaie propose.
 *
 * Les Boosters Commu et Folie ne s'ouvrent pour personne : aucune chance ne
 * s'y applique.
 */
export const CHANCE = {
  /** Le solde auquel le multiplicateur est plein : le plafond de flocons. */
  floconsPourPlein: ECONOMY.soldeMax,
  /** La chance maximale : ×1,5. */
  max: 0.5,
} as const;

/** La chance d'un joueur, entre 0 et `CHANCE.max`, d'après son solde. */
export function chanceDe(solde: number): number {
  if (!Number.isFinite(solde) || solde <= 0) return 0;
  return Math.min(CHANCE.max, (solde / CHANCE.floconsPourPlein) * CHANCE.max);
}

/** Le multiplicateur de chance, de 1 à 1,5, tel qu'on l'affiche : « ×1,25 ». */
export function multiplicateurChance(solde: number): number {
  return 1 + chanceDe(solde);
}

/** « ×1,45 », arrondi au centième. */
export function libelleMultiplicateur(chance: number): string {
  return `×${(1 + chance).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Une table de raretés poussée par la chance. Somme exacte, poids entiers.
 *
 * Si la poussée dépasse ce que la commune peut céder — une table réglée à la
 * main avec très peu de communes — les raretés hautes sont ramenées à
 * proportion pour que la commune ne tombe jamais sous zéro.
 */
export function poidsAvecChance(
  weights: Record<Rarity, number>,
  chance: number,
): Record<Rarity, number> {
  const c = Math.max(0, Math.min(CHANCE.max, chance));
  if (c === 0) return { ...weights };

  const hautes: Rarity[] = ['R', 'UR', 'L'];
  const pousses = {} as Record<Rarity, number>;
  let total = 0;
  for (const r of hautes) {
    pousses[r] = Math.round(weights[r] * (1 + c));
    total += pousses[r];
  }
  if (total > WEIGHT_TOTAL) {
    // On ne peut pas donner plus que tout : on ramène à l'échelle, et la
    // commune tombe à zéro.
    let reparti = 0;
    for (const r of hautes) {
      pousses[r] = Math.floor((pousses[r] * WEIGHT_TOTAL) / total);
      reparti += pousses[r];
    }
    pousses.L += WEIGHT_TOTAL - reparti;
    pousses.C = 0;
    return pousses;
  }
  pousses.C = WEIGHT_TOTAL - total;
  return pousses;
}

/**
 * Le jeton **Winter Spin** : l'emplacement se rejoue, avec de meilleurs taux.
 *
 * Il n'existe que dans les affrontements. Ce n'est pas une carte : le joueur
 * ne le garde pas, il n'a pas d'effet en jeu. C'est un résultat d'emplacement,
 * consommé dans l'instant par un second tirage.
 *
 * `chance` est tirée **avant** la rareté, et séparément d'elle, pour que les
 * tables de raretés gardent leur somme exacte. `weights` sert au second tirage.
 */
export const WINTER_SPIN = {
  /** Chance par emplacement, sur `WEIGHT_TOTAL`. */
  chance: 80,
  /** La table du second tirage. Somme exacte de `WEIGHT_TOTAL`. */
  weights: {
    C: 0,
    R: 40_000,
    UR: 40_000,
    L: 20_000,
  } as Record<Rarity, number>,
} as const;

/** Probabilité d'une rareté, en pourcentage, pour l'affichage. */
export function rarityPercent(weights: Record<Rarity, number>, rarity: Rarity): number {
  return (weights[rarity] / WEIGHT_TOTAL) * 100;
}

/* ------------------------------- Les cartes ------------------------------ */

/**
 * Plafond d'impact d'une carte, en points.
 *
 * Une game moyenne vaut environ 25 points. Une carte au-delà de ce plafond
 * volerait une part visible du classement en un tirage — c'est exactement ce
 * qui rendait certaines roues de la Summer Ligue insupportables. Un test
 * vérifie qu'aucune carte ne le dépasse.
 */
export const CARD_IMPACT_CAP = 25;

/**
 * Le budget de chaque rareté : ce qu'une carte peut faire bouger sur une game,
 * au pire cas, dans un sens comme dans l'autre.
 *
 * Les actions reprennent celles des roues de la Summer Ligue, mais pas leur
 * force : là-bas un ×2 ou un échange de games pouvait valoir cinquante points
 * d'un coup. Ici une commune pèse quatre points, et seules les trois raretés
 * du haut pèsent vraiment — sans jamais dépasser `CARD_IMPACT_CAP`, une bonne
 * game.
 *
 * Un test vérifie chaque carte contre le budget de sa rareté, et que les
 * budgets montent avec elle.
 */
export const IMPACT_PAR_RARETE: Record<Rarity, number> = {
  C: 6,
  R: 15,
  UR: 20,
  L: CARD_IMPACT_CAP,
};

/**
 * Les derniers du classement, pour les cartes qui leur donnent un coup de
 * pouce : le dernier tiers de la ligue, un joueur au moins, trois au plus.
 */
export const QUEUE_DU_CLASSEMENT = { part: 3, max: 3 } as const;

export function tailleDeLaQueue(joueurs: number): number {
  if (joueurs <= 0) return 0;
  return Math.max(
    1,
    Math.min(QUEUE_DU_CLASSEMENT.max, Math.floor(joueurs / QUEUE_DU_CLASSEMENT.part)),
  );
}

/**
 * Les créneaux de game gagnés par une carte « Game supplémentaire ».
 *
 * Trois au plus par joueur et par saison : c'est la seule carte dont l'effet
 * dure au-delà d'une game, et sans borne elle ferait jouer davantage celui
 * pour qui l'on ouvre davantage de boosters. Au-delà, la carte verse des
 * flocons à la place.
 */
export const CRENEAUX_BONUS = {
  max: 3,
  /** Ce que la carte verse quand le joueur a déjà tous ses créneaux. */
  floconsDeRepli: 1_000,
} as const;

/* ---------------------------- Les affrontements -------------------------- */

/**
 * Le duel de flocons : deux camps misent la même somme et s'affrontent en une
 * bataille de boules de neige (`lib/domain/bataille.ts`) ; le gagnant rafle
 * les deux mises.
 *
 * Une chance sur deux pour chacun, et l'espérance est nulle — le site ne
 * prend rien au passage.
 */
export const DUEL = {
  miseMin: 50,
  miseMax: 20_000,
  /**
   * Les duels qu'un joueur peut laisser en attente à la fois. Chacun est
   * annoncé sur le stream : sans borne, un joueur pouvait en lancer cinquante
   * d'affilée et occuper l'écran des minutes durant.
   */
  enAttenteMax: 3,
} as const;
