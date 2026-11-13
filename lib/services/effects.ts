import 'server-only';

/**
 * La résolution des cartes.
 *
 * C'est le seul endroit où une carte touche un score, un solde ou un joueur.
 * Deux portes d'entrée, et pas une de plus :
 *
 *  - `appliqueCartesEnAttente` — à la saisie d'une game : la carte active du
 *    joueur tombe sur cette game, puis disparaît ;
 *  - `regleCartesSansAttendre` — à l'ouverture d'un booster, et après chaque
 *    saisie : tout ce qui n'a pas besoin d'une nouvelle game se règle. Les
 *    flocons, le créneau de game, l'immunité ; les cartes qui relèvent une
 *    game déjà jouée ; et, pour un joueur qui a joué toutes ses games, les
 *    cartes qui attendaient une prochaine game qui ne viendra plus.
 *
 * Quatre invariants tenus ici :
 *
 *   1. Chaque modification de points passe par `applyPoints`, qui borne le
 *      cumul et journalise le delta **effectif** — pas le delta demandé.
 *   2. **Une game ne porte jamais deux cartes.** Une carte ne tombe que sur
 *      une game encore sans carte : c'est ce qui garde le budget de chaque
 *      rareté vrai game par game.
 *   3. Un malus retire des points à sa cible et n'en donne jamais à personne
 *      d'autre — sauf la carte à deux, qui oppose deux joueurs tirés au sort
 *      et reste bornée de chaque côté.
 *   4. Un malus ne touche pas un joueur immunisé : il est paré, et disparaît.
 */

import type { CarteEnAttente, Database, Game, GameMontree, GamesTirees, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { COUP_DE_VERGLAS, getCard, momentDe, PACTE_SUBI, TROC_SUBI } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import { CRENEAUX_BONUS, GAME_LIMITS, JOKERS, placementPoints } from '@/lib/domain/rules';
import { pick } from '@/lib/domain/rng';
import { rank, totalsFor } from '@/lib/domain/scoring';
import type { ActionRoue, CardDefinition, CardEffect } from '@/lib/domain/types';
import { shortDateTime } from '@/lib/format';
import { declencheTempete, facteurCartes } from '@/lib/services/evenements';
import { aJoueToutesSesGames, estImmunise, gamesOf, limiteDe, pointsHorsGame, recomputeGame } from './league';
import { credit } from './ledger';

/** Ce que la saisie sait de la partie, au-delà de la game elle-même. */
export interface ContexteGame {
  /**
   * Les kills du meilleur tueur de la partie, lus sur la capture — la
   * streameuse et les coéquipiers hors ligue compris. Nul si on l'ignore.
   */
  meilleurKills?: number | null;
  /**
   * Les kills de la game jouée juste avant par le même joueur (voir
   * `killsPrecedents`) : nul s'il n'en a pas joué.
   */
  killsPrecedents?: number | null;
}

/**
 * Les kills de la game jouée juste avant celle-ci par le même joueur — une
 * game passée ne compte pas —, ou `null` si c'est sa première. Pour la
 * « Marche Gelée ».
 */
export function killsPrecedents(db: Database, game: Game): number | null {
  const ordre = (g: Game) => [Date.parse(g.playedAt), Date.parse(g.createdAt)] as const;
  const [jouee, creee] = ordre(game);
  let precedente: Game | null = null;
  for (const g of db.games) {
    if (g.playerId !== game.playerId || g.id === game.id || g.skipped) continue;
    const [j, c] = ordre(g);
    if (j > jouee || (j === jouee && c >= creee)) continue;
    if (!precedente) {
      precedente = g;
      continue;
    }
    const [pj, pc] = ordre(precedente);
    if (j > pj || (j === pj && c > pc)) precedente = g;
  }
  return precedente ? precedente.kills : null;
}

/** Le contexte d'une game, complété de ce qui se lit en base : les kills de la game d'avant. */
function contexteDe(db: Database, game: Game, contexte: ContexteGame = {}): ContexteGame {
  return { ...contexte, killsPrecedents: killsPrecedents(db, game) };
}

export interface CarteAppliquee {
  cardId: string;
  nom: string;
  joueurId: string;
  /** La game sur laquelle la carte est tombée, s'il y en a une. */
  gameId: string | null;
  points: number;
  resultat: string;
}

export interface ApplicationCartes {
  cartes: CarteAppliquee[];
  /** Ce que les cartes font aux flocons de la game : 1, ou 2 avec une Manne. */
  facteurFlocons: number;
}

const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const fr = (n: number) => n.toLocaleString('fr-FR');
const pts = (n: number) => `${signe(n)} pt${Math.abs(n) > 1 ? 's' : ''}`;

/**
 * Applique un delta de points à une game et le journalise.
 *
 * Le delta réellement appliqué peut être plus petit que demandé : le cumul de
 * bonus sur une même game est borné. Un évènement « cartes renforcées » majore
 * la demande **avant** le plafond — le plafond reste, une carte majorée n'en
 * sort pas. Le signe est conservé : un malus renforcé retire davantage.
 */
function applyPoints(
  db: Database,
  game: Game,
  card: CardDefinition,
  ouvertureId: string,
  requested: number,
): number {
  const before = game.bonusPoints;
  const majore = Math.round(requested * facteurCartes(db));
  const after = Math.max(
    GAME_LIMITS.minBonusPoints,
    Math.min(GAME_LIMITS.maxBonusPoints, before + majore),
  );
  const effective = after - before;

  game.applied.push({
    id: newId(),
    cardId: card.id,
    ouvertureId,
    points: effective,
    at: new Date().toISOString(),
  });
  game.bonusPoints = after;
  recomputeGame(db, game);
  return effective;
}

/* ------------------------------ Les lectures ----------------------------- */

/** Le score d'une game sans ses cartes : kills et top. */
const scoreNu = (game: Pick<Game, 'kills' | 'placement'>) => game.kills + placementPoints(game.placement);

/** Les cartes d'un joueur qui attendent encore, la plus ancienne en tête. */
function enAttenteDe(db: Database, joueurId: string): CarteEnAttente[] {
  return db.cartesEnAttente
    .filter((c) => c.joueurId === joueurId && c.consommeeA === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA));
}

/**
 * Les games d'un joueur encore **sans carte** : comptées, jamais touchées par
 * un effet, et sur lesquelles aucune carte n'a été consommée — même sans
 * effet. Les plus récentes en tête.
 */
export function gamesSansCarte(db: Database, joueurId: string): Game[] {
  const prises = new Set(db.cartesEnAttente.filter((c) => c.gameId !== null).map((c) => c.gameId));
  return db.games
    .filter((g) => g.playerId === joueurId && !g.skipped && g.applied.length === 0 && !prises.has(g.id))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

/**
 * Les games qu'une carte peut **prendre** — échanger, copier, figer —
 * (décidé le 13/11/2026) : toute game comptée qui n'est pas figée. Une carte
 * déjà posée dessus (un ×2, un « +10 si Top 3 », un Pacte…) ne la protège
 * pas ; seule une carte qui fige (Cryogénisation, « fige ») le fait. Une game
 * échangée par un Pacte se reprend donc derrière. L'immunité du joueur se
 * vérifie à part. Les plus récentes en tête.
 *
 * Les bonus qu'un joueur pose sur sa propre game gardent, eux, la règle
 * « une game, une carte » (`gamesSansCarte`).
 */
export function gamesPrenables(db: Database, joueurId: string): Game[] {
  return db.games
    .filter((g) => g.playerId === joueurId && !g.skipped && !estFigee(g))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

/* --------------------------- Ce qu'une carte demande --------------------- */

interface Demande {
  /** Les points demandés, avant bornes et majoration. */
  points: number;
  resultat: string;
}

/**
 * Ce qu'une carte de prochaine game demande à une game, sans rien écrire.
 *
 * Fonction pure : c'est elle qui sert à choisir, pour un joueur qui a fini sa
 * saison, la game où la carte rapporte le plus. Rend `null` pour les genres
 * qui ne se résument pas à des points sur une game.
 */
function demande(effect: CardEffect, game: Game, contexte: ContexteGame): Demande | null {
  const nu = scoreNu(game);
  switch (effect.kind) {
    case 'bonus_points':
      return { points: effect.value, resultat: pts(effect.value) };
    case 'malus_points':
      return { points: -effect.value, resultat: pts(-effect.value) };
    case 'multiplicateur_game': {
      const double = Math.round(nu * (effect.value - 1));
      const points = effect.cap === undefined ? double : Math.min(effect.cap, double);
      return points > 0
        ? { points, resultat: `×${fr(effect.value)} sur ${nu} pts → ${pts(points)}` }
        : { points: 0, resultat: 'game à 0 point, sans effet' };
    }
    case 'diviseur_game': {
      const points = Math.min(effect.cap, Math.round(nu * (1 - 1 / effect.value)));
      return points > 0
        ? { points: -points, resultat: `÷${fr(effect.value)} sur ${nu} pts → ${pts(-points)}` }
        : { points: 0, resultat: 'game à 0 point, sans effet' };
    }
    case 'clone_kills': {
      const meilleur = contexte.meilleurKills;
      if (meilleur === null || meilleur === undefined) {
        return { points: 0, resultat: 'meilleur tueur de la partie inconnu, sans effet' };
      }
      const ecart = meilleur - game.kills;
      if (ecart <= 0) {
        // Le meilleur tueur, c'est lui : une consolation fixe, s'il y en a une.
        return effect.consolation
          ? { points: effect.consolation, resultat: `meilleur tueur de la partie lui-même → ${pts(effect.consolation)}` }
          : { points: 0, resultat: 'déjà le meilleur tueur de la partie, sans effet' };
      }
      const points = effect.cap === undefined ? ecart : Math.min(effect.cap, ecart);
      return { points, resultat: `${meilleur} kills du meilleur contre ${game.kills} → ${pts(points)}` };
    }
    case 'plancher': {
      const manque = Math.max(0, effect.value - game.score);
      return manque > 0
        ? { points: manque, resultat: `joker : game remontée à ${effect.value} pts (${pts(manque)})` }
        : { points: 0, resultat: `game déjà à ${game.score} pts, joker sans effet` };
    }
    case 'bonus_top':
      return game.placement !== null && game.placement <= effect.top
        ? { points: effect.value, resultat: `Top ${game.placement} → ${pts(effect.value)}` }
        : { points: 0, resultat: `hors du Top ${effect.top}, sans effet` };
    case 'petite_game':
      return game.kills < effect.moinsDe
        ? { points: effect.value, resultat: `${game.kills} kill${game.kills > 1 ? 's' : ''} → ${pts(effect.value)}` }
        : { points: 0, resultat: `${game.kills} kills, sans effet` };
    case 'kills_paliers': {
      const paliers = Math.floor(game.kills / effect.par);
      const points = Math.min(effect.cap, paliers * effect.value);
      return points > 0
        ? {
            points,
            resultat: `${game.kills} kills, ${paliers} palier${paliers > 1 ? 's' : ''} de ${effect.par} → ${pts(points)}`,
          }
        : {
            points: 0,
            resultat: `${game.kills} kill${game.kills > 1 ? 's' : ''}, moins de ${effect.par} : sans effet`,
          };
    }
    case 'progression_kills': {
      // Sans game précédente, la marche part de zéro : il suffit d'un kill.
      const avant = contexte.killsPrecedents ?? 0;
      return game.kills > avant
        ? { points: effect.value, resultat: `${game.kills} kills contre ${avant} → ${pts(effect.value)}` }
        : { points: 0, resultat: `${game.kills} kills, pas plus que les ${avant} d’avant : sans effet` };
    }
    default:
      return null;
  }
}

/* ------------------------------ Le règlement ----------------------------- */

interface Reglement {
  points: number;
  resultat: string;
  facteurFlocons: number;
  /** Faux si la carte doit encore attendre : elle n'est alors pas consommée. */
  regle: boolean;
  gameId: string | null;
}

const sansEffet = (resultat: string, gameId: string | null = null): Reglement => ({
  points: 0,
  resultat,
  facteurFlocons: 1,
  regle: true,
  gameId,
});

/** Une carte de prochaine game, sur la game donnée. */
function regleSurGame(
  db: Database,
  pendante: CarteEnAttente,
  card: CardDefinition,
  game: Game,
  contexte: ContexteGame,
  now: Date,
): Reglement {
  const effect = card.effect;
  const joueur = db.players.find((p) => p.id === pendante.joueurId);

  // Un malus ne touche pas un joueur immunisé : paré, il disparaît.
  if (card.nature === 'malus' && effect.kind !== 'echange' && joueur && estImmunise(joueur, now)) {
    return sansEffet('paré par l’immunité', game.id);
  }

  if (effect.kind === 'flocons_doubles') {
    return { points: 0, resultat: 'flocons de la game doublés', facteurFlocons: 2, regle: true, gameId: game.id };
  }

  if (effect.kind === 'echange') return regleEchange(db, pendante, card, effect, game, now);
  if (effect.kind === 'clone_kills') return regleClone(db, pendante, card, effect, game, contexte);

  const voulu = demande(effect, game, contexteDe(db, game, contexte));
  if (!voulu) return sansEffet('sans effet sur une game', game.id);
  if (voulu.points === 0) return sansEffet(voulu.resultat, game.id);

  const points = applyPoints(db, game, card, pendante.ouvertureId, voulu.points);
  // Pendant un évènement « cartes renforcées », le delta diffère de la
  // demande : on le dit.
  const resultat = points === voulu.points ? voulu.resultat : `${voulu.resultat}, renforcé : ${pts(points)}`;
  return { points, resultat, facteurFlocons: 1, regle: true, gameId: game.id };
}

/**
 * « Clone kill du meilleur » : la game prend les kills du meilleur tueur de la
 * partie — ses kills changent, pas un bonus à côté. Le classement, la
 * moyenne de kills et les flocons de la game les comptent donc comme les
 * siens. La carte s'inscrit sur la game, à zéro point de bonus, et le
 * résultat garde les kills d'avant. Meilleur tueur lui-même : sa consolation,
 * en points de bonus.
 */
function regleClone(
  db: Database,
  pendante: CarteEnAttente,
  card: CardDefinition,
  effect: Extract<CardEffect, { kind: 'clone_kills' }>,
  game: Game,
  contexte: ContexteGame,
): Reglement {
  const meilleur = contexte.meilleurKills;
  if (meilleur === null || meilleur === undefined) {
    return sansEffet('meilleur tueur de la partie inconnu, sans effet', game.id);
  }
  const ecart = meilleur - game.kills;
  if (ecart <= 0) {
    if (!effect.consolation) return sansEffet('déjà le meilleur tueur de la partie, sans effet', game.id);
    const points = applyPoints(db, game, card, pendante.ouvertureId, effect.consolation);
    return {
      points,
      resultat: `meilleur tueur de la partie lui-même → ${pts(points)}`,
      facteurFlocons: 1,
      regle: true,
      gameId: game.id,
    };
  }
  const gain = effect.cap === undefined ? ecart : Math.min(effect.cap, ecart);
  const avant = game.kills;
  game.kills = Math.min(GAME_LIMITS.maxKills, avant + gain);
  // Inscrite sur la game, à zéro point de bonus : le score suit les kills.
  applyPoints(db, game, card, pendante.ouvertureId, 0);
  return {
    points: game.kills - avant,
    resultat: `${avant} → ${game.kills} kills, ceux du meilleur tueur de la partie`,
    facteurFlocons: 1,
    regle: true,
    gameId: game.id,
  };
}

/**
 * La carte à deux. La première game saisie attend l'autre ; la seconde règle
 * la paire, sur les deux games à la fois. La carte de l'autre joueur garde son
 * `gameId` comme trace de « quelle game » — c'est ce qui permet de retrouver
 * la première quand la seconde arrive.
 */
function regleEchange(
  db: Database,
  pendante: CarteEnAttente,
  card: CardDefinition,
  effect: Extract<CardEffect, { kind: 'echange' }>,
  game: Game,
  now: Date,
): Reglement {
  const autre = db.cartesEnAttente.find(
    (c) => c.paireId !== null && c.paireId === pendante.paireId && c.id !== pendante.id,
  );
  if (!autre) return sansEffet('sans adversaire, sans effet', game.id);

  const lui = db.players.find((p) => p.id === autre.joueurId);
  const moi = db.players.find((p) => p.id === pendante.joueurId);
  const pseudoAutre = lui?.pseudo ?? 'l’autre';
  const autreGame = autre.gameId ? db.games.find((g) => g.id === autre.gameId) : undefined;
  if (!autreGame) {
    return sansEffet(`en attente de la prochaine game de ${pseudoAutre}`, game.id);
  }

  const mesure = (g: Game) => (effect.sur === 'kills' ? g.kills : scoreNu(g));
  const quoi = effect.sur === 'kills' ? 'kills' : 'pts';
  // Ce que l'un reçoit, l'autre le cède : la somme est nulle, et chaque côté
  // est borné par le plafond de la carte — sans plafond, les games entières
  // changent de mains.
  const brut = mesure(autreGame) - mesure(game);
  const ecart = effect.cap === undefined ? brut : Math.max(-effect.cap, Math.min(effect.cap, brut));
  if (ecart === 0) {
    autre.resultat = `égalité à ${mesure(game)} ${quoi}, sans effet`;
    return sansEffet(`égalité à ${mesure(game)} ${quoi}, sans effet`, game.id);
  }

  // Celui qui y perdrait est-il immunisé ? L'échange entier tombe : le
  // laisser gagner à l'autre créerait des points.
  const perdant = ecart > 0 ? lui : moi;
  if (perdant && estImmunise(perdant, now)) {
    const texte = `échange annulé : ${perdant.pseudo} est immunisé`;
    autre.resultat = texte;
    return sansEffet(texte, game.id);
  }

  const points = applyPoints(db, game, card, pendante.ouvertureId, ecart);
  const rendu = applyPoints(db, autreGame, card, autre.ouvertureId, -ecart);
  autre.resultat = `${mesure(autreGame)} ${quoi} contre ${mesure(game)} → ${pts(rendu)}`;
  return {
    points,
    resultat: `${mesure(game)} ${quoi} contre ${mesure(autreGame)} → ${pts(points)}`,
    facteurFlocons: 1,
    regle: true,
    gameId: game.id,
  };
}

/** Une carte qui relève une game déjà jouée. Attend tant qu'il n'y a pas de quoi. */
function regleSurJouee(db: Database, pendante: CarteEnAttente, card: CardDefinition): Reglement {
  const effect = card.effect;
  const attend: Reglement = { points: 0, resultat: '', facteurFlocons: 1, regle: false, gameId: null };
  if (effect.kind === 'supprime_pire') {
    // La pire game encore sans carte ; à égalité, la plus ancienne. La carte
    // s'y inscrit, puis la game est passée : elle ne compte plus, son créneau
    // est rendu. Ses flocons, déjà versés, restent.
    const libres = gamesSansCarte(db, pendante.joueurId);
    if (libres.length === 0) return attend;
    const pire = [...libres].sort((a, b) => a.score - b.score || a.playedAt.localeCompare(b.playedAt))[0];
    applyPoints(db, pire, card, pendante.ouvertureId, 0);
    pire.skipped = true;
    return {
      points: 0,
      resultat: `pire game (${pire.score} pts) supprimée : elle ne compte plus, son créneau est rendu`,
      facteurFlocons: 1,
      regle: true,
      gameId: pire.id,
    };
  }
  if (effect.kind === 'fige_meilleure') {
    // Sa meilleure game pas encore figée — même si une carte y est déjà
    // passée (13/11/2026) — ; à égalité, la plus récente. La carte s'y pose
    // sans en changer le score, et plus aucune autre ne peut la toucher.
    // Jamais sa pire game : il doit pouvoir s'en débarrasser (12/11/2026).
    const libres = gamesPrenables(db, pendante.joueurId).filter((g) => g.id !== pireComptee(db, pendante.joueurId)?.id);
    if (libres.length === 0) return attend;
    const meilleure = [...libres].sort((a, b) => b.score - a.score)[0];
    // Inscrite sur la game, à zéro point : elle s'y voit, et la game n'est
    // plus libre.
    applyPoints(db, meilleure, card, pendante.ouvertureId, 0);
    return {
      points: 0,
      resultat: `meilleure game figée (${meilleure.score} pts) : plus aucune carte ne peut la toucher`,
      facteurFlocons: 1,
      regle: true,
      gameId: meilleure.id,
    };
  }
  if (effect.kind !== 'releve_pire' && effect.kind !== 'multiplie_jouee') return attend;

  // Il faut deux games pour dire laquelle est la pire, ou la meilleure.
  const comptees = db.games.filter((g) => g.playerId === pendante.joueurId && !g.skipped);
  if (comptees.length < 2) return attend;
  const libres = gamesSansCarte(db, pendante.joueurId);
  if (libres.length === 0) return attend;

  if (effect.kind === 'releve_pire') {
    const moyenne = Math.round(comptees.reduce((s, g) => s + g.score, 0) / comptees.length);
    const pire = [...libres].sort((a, b) => a.score - b.score)[0];
    const manque = Math.min(effect.cap, moyenne - pire.score);
    if (manque <= 0) return sansEffet(`pire game déjà à la moyenne (${moyenne} pts), sans effet`);
    const points = applyPoints(db, pire, card, pendante.ouvertureId, manque);
    return {
      points,
      resultat: `pire game de ${pire.score - points} pts ramenée vers la moyenne de ${moyenne} → ${pts(points)}`,
      facteurFlocons: 1,
      regle: true,
      gameId: pire.id,
    };
  }

  // La pire : celle qui a marqué le moins, mais qui a marqué — doubler zéro
  // ne donnerait rien. La meilleure : la plus haute.
  const candidates = libres.filter((g) => g.score > 0);
  if (candidates.length === 0) return attend;
  const cible =
    effect.cible === 'pire'
      ? [...candidates].sort((a, b) => a.score - b.score)[0]
      : [...candidates].sort((a, b) => b.score - a.score)[0];
  const voulu = Math.min(effect.cap, Math.round(cible.score * (effect.value - 1)));
  if (voulu <= 0) return attend;
  const avant = cible.score;
  const points = applyPoints(db, cible, card, pendante.ouvertureId, voulu);
  return {
    points,
    resultat: `${effect.cible === 'pire' ? 'pire' : 'meilleure'} game de ${avant} pts ×${fr(effect.value)} → ${pts(points)}`,
    facteurFlocons: 1,
    regle: true,
    gameId: cible.id,
  };
}

/** Des flocons, un créneau de game, une immunité : dans l'instant. */
function regleInstant(
  db: Database,
  pendante: CarteEnAttente,
  card: CardDefinition,
  joueur: Player,
  now: Date,
): Reglement {
  const effect = card.effect;
  switch (effect.kind) {
    case 'snowflakes': {
      credit(db, joueur.id, effect.value, 'CARTE', pendante.ouvertureId);
      return sansEffet(`+${fr(effect.value)} flocons`);
    }
    case 'bonus_total': {
      // Hors de toute game : `pointsHorsGame()` les ajoute au total.
      pendante.points = effect.value;
      return sansEffet(`${pts(effect.value)} bonus sur le total`);
    }
    case 'game_supplementaire':
      return ajouteCreneau(db, joueur, pendante.ouvertureId);
    case 'roue':
      return regleRoue(db, pendante, card, effect.action, now);
    case 'immunite': {
      // Une immunité qui court encore est prolongée, pas remplacée.
      const depart = estImmunise(joueur, now) ? new Date(joueur.immuniseJusqua!) : now;
      const fin = new Date(depart.getTime() + effect.heures * 3_600_000);
      joueur.immuniseJusqua = fin.toISOString();
      return sansEffet(`immunisé jusqu’au ${shortDateTime(joueur.immuniseJusqua)}`);
    }
    default:
      return { points: 0, resultat: '', facteurFlocons: 1, regle: false, gameId: null };
  }
}

/* --------------------------- Les roues de la Summer ----------------------- */

/**
 * Une game figée : elle porte une carte qui la fige — « Fige ta meilleure
 * game » du Perso ou une action « fige » des roues. Seule une game figée
 * échappe à la « Pire game à 0 ».
 */
export function estFigee(game: Game): boolean {
  return game.applied.some((a) => {
    const c = getCard(a.cardId);
    if (!c) return false;
    if (c.effect.kind === 'fige_meilleure' || c.effect.kind === 'fige_garde') return true;
    return c.effect.kind === 'roue' && (c.effect.action.quoi === 'fige_meilleure' || c.effect.action.quoi === 'fige_hasard');
  });
}

/**
 * Une game déjà multipliée : un multiplicateur du Perso (« Game ×1,2 »…), un
 * multiplicateur sur une game jouée, ou un « ×2 / ×1,5 » des roues. La
 * « Meilleure game ×1,5 » la laisse et passe à la suivante (13/11/2026).
 */
export function estMultipliee(game: Game): boolean {
  return game.applied.some((a) => {
    const c = getCard(a.cardId);
    if (!c) return false;
    if (c.effect.kind === 'multiplicateur_game' || c.effect.kind === 'multiplie_jouee') return true;
    return (
      c.effect.kind === 'roue' &&
      (c.effect.action.quoi === 'meilleure_fois' ||
        c.effect.action.quoi === 'pire_fois' ||
        c.effect.action.quoi === 'hasard_fois')
    );
  });
}

/** Les games comptées d'un joueur. */
const comptees = (db: Database, joueurId: string) => db.games.filter((g) => g.playerId === joueurId && !g.skipped);

/** La pire game comptée d'un joueur : elle ne se fige jamais. */
function pireComptee(db: Database, joueurId: string): Game | undefined {
  return [...comptees(db, joueurId)].sort((a, b) => a.score - b.score)[0];
}

/** Une liste dans un ordre tiré au sort par le serveur. */
function melange<T>(liste: readonly T[]): T[] {
  const reste = [...liste];
  const sortie: T[] = [];
  while (reste.length > 0) {
    const x = pick(reste);
    reste.splice(reste.indexOf(x), 1);
    sortie.push(x);
  }
  return sortie;
}

/** La meilleure game de toute la ligue, parmi les joueurs en lice, et à qui elle est. */
function meilleureDeLaLigue(db: Database): { game: Game; pseudo: string } | null {
  let meilleure: Game | null = null;
  for (const g of db.games) {
    if (g.skipped) continue;
    if (!meilleure || g.score > meilleure.score) meilleure = g;
  }
  if (!meilleure) return null;
  const pseudo = db.players.find((p) => p.id === meilleure!.playerId)?.pseudo ?? 'un joueur';
  return { game: meilleure, pseudo };
}

/**
 * Fait prendre à une game un score donné, au grand livre des points de la
 * game (`applyPoints`) : la carte s'y inscrit, même à zéro point.
 */
function donneLeScore(db: Database, game: Game, card: CardDefinition, ouvertureId: string, score: number): number {
  return applyPoints(db, game, card, ouvertureId, score - game.score);
}

/** Un membre du groupe d'une action : sa carte, et le joueur. */
interface Membre {
  pendante: CarteEnAttente;
  joueur: Player;
}

const regleSur = (resultat: string, points: number, gameId: string | null): Reglement => ({
  points,
  resultat,
  facteurFlocons: 1,
  regle: true,
  gameId,
});

/** Le créneau d'une game supplémentaire, ou des flocons à la place s'il en a déjà trois. */
function ajouteCreneau(db: Database, joueur: Player, ouvertureId: string): Reglement {
  if (joueur.creneauxBonus >= CRENEAUX_BONUS.max) {
    credit(db, joueur.id, CRENEAUX_BONUS.floconsDeRepli, 'CARTE', ouvertureId);
    return sansEffet(
      `déjà ${CRENEAUX_BONUS.max} games supplémentaires : +${fr(CRENEAUX_BONUS.floconsDeRepli)} flocons à la place`,
    );
  }
  joueur.creneauxBonus += 1;
  return sansEffet(`+1 game : ${limiteDe(db, joueur)} games à jouer cette saison`);
}

/**
 * Échange le score de deux games — celle de `a` et celle de `b` —, au grand
 * livre de chacune. Celui qui y perdrait est-il immunisé ? L'échange tombe.
 */
function echangeDeuxGames(
  db: Database,
  card: CardDefinition,
  a: Membre,
  ga: Game,
  b: Membre,
  gb: Game,
  now: Date,
): [Reglement, Reglement] {
  const sa = ga.score;
  const sb = gb.score;
  const perdant = sb > sa ? b : sa > sb ? a : null;
  if (perdant && estImmunise(perdant.joueur, now)) {
    const texte = `échange annulé : ${perdant.joueur.pseudo} est immunisé`;
    return [sansEffet(texte), sansEffet(texte)];
  }
  if (sa === sb) {
    const texte = `égalité à ${sa} pts, sans effet`;
    return [sansEffet(texte, ga.id), sansEffet(texte, gb.id)];
  }
  const pa = donneLeScore(db, ga, card, a.pendante.ouvertureId, sb);
  const pb = donneLeScore(db, gb, card, b.pendante.ouvertureId, sa);
  return [
    regleSur(
      `échange sa ${laGame(db, ga).slice(3)} (${sa} pts) contre ${laGame(db, gb)} de ${b.joueur.pseudo} (${sb} pts) → ${pts(pa)}`,
      pa,
      ga.id,
    ),
    regleSur(
      `échange sa ${laGame(db, gb).slice(3)} (${sb} pts) contre ${laGame(db, ga)} de ${a.joueur.pseudo} (${sa} pts) → ${pts(pb)}`,
      pb,
      gb.id,
    ),
  ];
}

/**
 * Une chaîne d'échanges : chaque participant donne sa game au suivant et
 * reçoit celle du précédent — leurs scores tournent. Aucun point n'est créé
 * ni perdu (aux bornes d'une game près).
 */
function chaine(
  db: Database,
  card: CardDefinition,
  maillons: { membre: Membre; game: Game }[],
  resultats: Map<string, Reglement>,
): void {
  const scores = maillons.map((m) => m.game.score);
  maillons.forEach((m, i) => {
    const precedent = maillons[(i - 1 + maillons.length) % maillons.length];
    const suivant = maillons[(i + 1) % maillons.length];
    const recu = scores[(i - 1 + maillons.length) % maillons.length];
    const points = donneLeScore(db, m.game, card, m.membre.pendante.ouvertureId, recu);
    resultats.set(
      m.membre.pendante.id,
      regleSur(
        `donne ${laGame(db, m.game)} (${scores[i]} pts) à ${suivant.membre.joueur.pseudo}, reçoit celle de ${precedent.membre.joueur.pseudo} (${recu} pts) → ${pts(points)}`,
        points,
        m.game.id,
      ),
    );
  });
}

/** « la game 7 » : son rang parmi les games du joueur, comme au tirage des games. */
function laGame(db: Database, g: Game): string {
  return `la game ${montre(db, g).numero}`;
}

/** Une game telle que l'écran du tirage la montre. */
function montre(db: Database, g: Game): GameMontree {
  const siennes = db.games
    .filter((x) => x.playerId === g.playerId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { id: g.id, numero: siennes.indexOf(g) + 1, score: g.score, kills: g.kills, top: g.placement };
}

const parScore = (l: readonly Game[]) => [...l].sort((x, y) => x.score - y.score);

/** Au-delà, l'écran ne déroule plus les games : la carte tombe sur trop de monde. */
const JOUEURS_AU_TIRAGE_DES_GAMES = 3;

/**
 * Les games que touchera une carte des roues, tirées à l'ouverture
 * (12/11/2026) : l'écran déroule ce tirage après celui des joueurs, et la
 * carte, révélée, frappe ces games-là (`regleRoue`, `retenue`). Les règles de
 * choix sont celles de `regleRoue` — une game sans carte, jamais la pire à
 * figer… — pour que l'écran montre ce que la carte fera. Nul quand la carte
 * ne prend pas de game, ou tombe sur toute la ligue.
 */
export function choisitGamesRoue(db: Database, card: CardDefinition, joueurs: readonly Player[]): GamesTirees | null {
  if (card.effect.kind !== 'roue') return null;
  const action = card.effect.action;
  const roulette = action.quoi === 'roulette';
  if (!roulette && (joueurs.length === 0 || joueurs.length > JOUEURS_AU_TIRAGE_DES_GAMES)) return null;
  const pour = (p: Player, libelle: string, visees: Game[], parmi: Game[]): GamesTirees['parJoueur'][number] =>
    visees.length === 0
      ? null
      : {
          joueurId: p.id,
          pseudo: p.pseudo,
          libelle,
          visees: visees.map((g) => montre(db, g)),
          parmi: parmi.map((g) => montre(db, g)),
        };
  const fait = (hasard: boolean, parJoueur: GamesTirees['parJoueur'], lien: GamesTirees['lien'] = null) =>
    parJoueur.some(Boolean) ? { hasard, lien, parJoueur } : null;

  switch (action.quoi) {
    case 'hasard_fois':
      return fait(
        true,
        joueurs.map((p) => {
          const libres = gamesSansCarte(db, p.id).filter((g) => g.score > 0);
          return libres.length ? pour(p, `une game au hasard, ×${fr(action.facteur)}`, [pick(libres)], libres) : null;
        }),
      );
    case 'fige_hasard':
      return fait(
        true,
        joueurs.map((p) => {
          const toutes = comptees(db, p.id);
          const pire = parScore(toutes)[0];
          const meilleure = parScore(toutes).at(-1);
          let libres = gamesPrenables(db, p.id).filter((g) => g.id !== pire?.id);
          if (action.meilleureExclue) libres = libres.filter((g) => g.id !== meilleure?.id);
          return libres.length ? pour(p, 'une game au hasard, figée', [pick(libres)], libres) : null;
        }),
      );
    case 'fige_meilleure':
      return fait(
        false,
        joueurs.map((p) => {
          const toutes = comptees(db, p.id);
          if (toutes.length < action.minGames) return null;
          const pire = parScore(toutes)[0];
          const libres = gamesPrenables(db, p.id).filter((g) => g.id !== pire?.id);
          const meilleure = parScore(libres).at(-1);
          return meilleure ? pour(p, 'sa meilleure game, figée', [meilleure], libres) : null;
        }),
      );
    case 'echange_hasard':
    case 'echange_meilleure_pire': {
      const [a, b] = joueurs;
      if (!a || !b) return null;
      const libresA = gamesPrenables(db, a.id);
      const libresB = gamesPrenables(db, b.id);
      if (libresA.length === 0 || libresB.length === 0) return null;
      if (action.quoi === 'echange_hasard') {
        // Du hasard pur (12/11/2026) : une game au sort chez chacun, toutes à
        // chances égales. Qui y gagne suit les deux scores tirés.
        return fait(
          true,
          [pour(a, 'une game au hasard', [pick(libresA)], libresA), pour(b, 'une game au hasard', [pick(libresB)], libresB)],
          'echange',
        );
      }
      return fait(
        false,
        [
          pour(a, 'sa meilleure game', [parScore(libresA).at(-1)!], libresA),
          pour(b, 'sa pire game', [parScore(libresB)[0]], libresB),
        ],
        'echange',
      );
    }
    case 'clone_sur_pire': {
      const [a, b] = joueurs;
      if (!a || !b) return null;
      const libresA = gamesPrenables(db, a.id);
      const sources = comptees(db, b.id);
      if (libresA.length === 0 || sources.length === 0) return null;
      return fait(
        false,
        [
          pour(a, 'sa pire game, qui prend le score', [parScore(libresA)[0]], libresA),
          pour(b, 'sa meilleure game, copiée', [parScore(sources).at(-1)!], sources),
        ],
        'copie',
      );
    }
    case 'pire_moyenne':
      return fait(
        false,
        joueurs.map((p) => {
          const libres = gamesSansCarte(db, p.id);
          if (comptees(db, p.id).length < 2 || libres.length === 0) return null;
          return pour(p, 'sa pire game, ramenée à la moyenne', [parScore(libres)[0]], libres);
        }),
      );
    case 'fusion_pires':
      return fait(
        false,
        joueurs.map((p) => {
          const libres = parScore(gamesSansCarte(db, p.id));
          return libres.length >= 2 ? pour(p, 'ses deux pires games, fondues en une', libres.slice(0, 2), libres) : null;
        }),
        'fusion',
      );
    case 'roulette': {
      // Le perdant de la course est le premier tiré (`beneficiairesRoue`) :
      // sa meilleure game encore libre de toute carte qui fige.
      const perdant = joueurs[0];
      if (!perdant || estImmunise(perdant)) return null;
      const candidates = comptees(db, perdant.id).filter((g) => !estFigee(g));
      const meilleure = parScore(candidates).at(-1);
      if (!meilleure) return null;
      return fait(false, [pour(perdant, 'sa meilleure game, perdue', [meilleure], candidates), ...joueurs.slice(1).map(() => null)]);
    }
    default:
      return null;
  }
}

/**
 * Règle une action des roues de la Summer, une seule fois pour tous les
 * joueurs tirés : toutes les cartes de la même ouverture sont réglées
 * ensemble, et celle de ce joueur rend son règlement. Les actions sont celles
 * de la Summer, telles quelles (décidé par l'organisation le 03/11/2026) —
 * voir `ActionRoue`. Ce qui ne peut pas s'appliquer est sans effet : rien
 * n'attend.
 */
function regleRoue(
  db: Database,
  pendante: CarteEnAttente,
  card: CardDefinition,
  action: ActionRoue,
  now: Date,
): Reglement {
  const groupe: Membre[] = db.cartesEnAttente
    .filter((c) => c.ouvertureId === pendante.ouvertureId && c.cardId === card.id && c.consommeeA === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA) || a.id.localeCompare(b.id))
    .flatMap((c) => {
      const joueur = db.players.find((p) => p.id === c.joueurId);
      return joueur ? [{ pendante: c, joueur }] : [];
    });
  const resultats = new Map<string, Reglement>();
  const pour = (m: Membre, r: Reglement) => resultats.set(m.pendante.id, r);
  const o = pendante.ouvertureId;
  // Les games tirées à l'ouverture, que l'écran a montrées (`choisitGamesRoue`) :
  // la carte frappe celles-là, si elles peuvent encore l'être ; sinon elle
  // choisit comme elle l'aurait fait.
  const tirees = db.ouvertures.find((x) => x.id === o)?.games ?? null;
  // Le total de chacun avant la carte : le compte rendu dira ce qu'elle a fait.
  const totalDe = (m: Membre) =>
    comptees(db, m.joueur.id).reduce((s, g) => s + g.score, 0) +
    pointsHorsGame(db, m.joueur.id) +
    (m.pendante.consommeeA === null ? (m.pendante.points ?? 0) : 0);
  const avant = new Map(groupe.map((m) => [m.pendante.id, totalDe(m)]));
  const retenue = (m: Membre, parmi: readonly Game[], rang = 0): Game | undefined => {
    const id = tirees?.parJoueur.find((e) => e?.joueurId === m.joueur.id)?.visees[rang]?.id;
    return id ? parmi.find((g) => g.id === id) : undefined;
  };

  switch (action.quoi) {
    case 'rien':
      for (const m of groupe) pour(m, sansEffet('pas de chance : rien ne change'));
      break;

    case 'flocons':
      // Au grand livre, l'ouverture en référence ; jamais au-delà du plafond.
      for (const m of groupe) {
        const verses = credit(db, m.joueur.id, action.montant, 'CARTE', o);
        pour(m, sansEffet(verses > 0 ? `+${fr(verses)} flocons` : 'solde déjà au plafond, sans effet'));
      }
      break;

    case 'meilleure_fois':
      // La meilleure game de chacun qui n'a pas déjà de multiplicateur — ni
      // du Perso, ni des roues : sinon, la suivante (13/11/2026) —, et
      // jamais une game figée.
      for (const m of groupe) {
        const candidates = comptees(db, m.joueur.id).filter((g) => g.score > 0 && !estFigee(g) && !estMultipliee(g));
        if (candidates.length === 0) {
          pour(m, sansEffet('aucune game à multiplier, sans effet'));
          continue;
        }
        const game = [...candidates].sort((a, b) => b.score - a.score)[0];
        const avant = game.score;
        const points = applyPoints(db, game, card, o, Math.round(avant * (action.facteur - 1)));
        pour(m, regleSur(`sa meilleure game, ${laGame(db, game)} (${avant} pts), ×${fr(action.facteur)} → ${pts(points)}`, points, game.id));
      }
      break;

    case 'pire_fois':
    case 'hasard_fois':
      for (const m of groupe) {
        const libres = gamesSansCarte(db, m.joueur.id).filter((g) => g.score > 0);
        if (libres.length === 0) {
          pour(m, sansEffet('aucune game libre, sans effet'));
          continue;
        }
        const game =
          retenue(m, libres) ?? (action.quoi === 'pire_fois' ? [...libres].sort((a, b) => a.score - b.score)[0] : pick(libres));
        const avant = game.score;
        const points = applyPoints(db, game, card, o, Math.round(avant * (action.facteur - 1)));
        const quelle = action.quoi === 'pire_fois' ? 'sa pire game' : 'tirée au sort';
        pour(m, regleSur(`${quelle}, ${laGame(db, game)} (${avant} pts), ×${fr(action.facteur)} → ${pts(points)}`, points, game.id));
      }
      break;

    case 'hasard_divise':
      for (const m of groupe) {
        if (estImmunise(m.joueur, now)) {
          pour(m, sansEffet('paré par l’immunité'));
          continue;
        }
        const libres = gamesSansCarte(db, m.joueur.id).filter((g) => g.score > 0);
        if (libres.length === 0) {
          pour(m, sansEffet('aucune game libre, sans effet'));
          continue;
        }
        const game = pick(libres);
        const avant = game.score;
        const apres = Math.ceil(avant / action.diviseur);
        const points = donneLeScore(db, game, card, o, apres);
        pour(m, regleSur(`tirée au sort, ${laGame(db, game)} (${avant} pts), ÷${fr(action.diviseur)} → ${pts(points)}`, points, game.id));
      }
      break;

    case 'supprime_pire':
      for (const m of groupe) {
        const libres = gamesSansCarte(db, m.joueur.id);
        if (libres.length === 0) {
          pour(m, sansEffet('aucune game libre, sans effet'));
          continue;
        }
        const pire = [...libres].sort((a, b) => a.score - b.score || a.playedAt.localeCompare(b.playedAt))[0];
        applyPoints(db, pire, card, o, 0);
        pire.skipped = true;
        pour(m, regleSur(`sa pire game, ${laGame(db, pire)} (${pire.score} pts), supprimée : son créneau est rendu`, 0, pire.id));
      }
      break;

    case 'echange_meilleure_pire':
    case 'echange_hasard':
    case 'clone_sur_pire': {
      const [a, b] = groupe;
      if (!a || !b) {
        for (const m of groupe) pour(m, sansEffet('il faut deux joueurs, sans effet'));
        break;
      }
      const libresA = gamesPrenables(db, a.joueur.id);
      const libresB = gamesPrenables(db, b.joueur.id);
      if (action.quoi === 'clone_sur_pire') {
        // La pire game libre du premier prend le score de la meilleure du
        // second, qui la garde : elle est copiée, pas déplacée.
        const sources = comptees(db, b.joueur.id);
        if (libresA.length === 0 || sources.length === 0) {
          for (const m of groupe) pour(m, sansEffet('pas de game à cloner, sans effet'));
          break;
        }
        const pire = retenue(a, libresA) ?? [...libresA].sort((x, y) => x.score - y.score)[0];
        const source = retenue(b, sources) ?? [...sources].sort((x, y) => y.score - x.score)[0];
        if (source.score < pire.score && estImmunise(a.joueur, now)) {
          for (const m of groupe) pour(m, sansEffet(`clone annulé : ${a.joueur.pseudo} est immunisé`));
          break;
        }
        const avant = pire.score;
        const points = donneLeScore(db, pire, card, o, source.score);
        pour(a, regleSur(`sa pire game, ${laGame(db, pire)} (${avant} pts), prend les ${source.score} pts de ${laGame(db, source)} de ${b.joueur.pseudo} → ${pts(points)}`, points, pire.id));
        pour(b, sansEffet(`${laGame(db, source)} (${source.score} pts) est copiée chez ${a.joueur.pseudo} ; il la garde`));
        break;
      }
      if (libresA.length === 0 || libresB.length === 0) {
        for (const m of groupe) pour(m, sansEffet('il faut une game libre de chaque côté, sans effet'));
        break;
      }
      const ga =
        retenue(a, libresA) ??
        (action.quoi === 'echange_meilleure_pire' ? [...libresA].sort((x, y) => y.score - x.score)[0] : pick(libresA));
      const gb =
        retenue(b, libresB) ??
        (action.quoi === 'echange_meilleure_pire' ? [...libresB].sort((x, y) => x.score - y.score)[0] : pick(libresB));
      const [ra, rb] = echangeDeuxGames(db, card, a, ga, b, gb, now);
      pour(a, ra);
      pour(b, rb);
      break;
    }

    case 'tempete': {
      const tempete = declencheTempete(db, now);
      const texte = tempete
        ? `Tempête de neige déclenchée, jusqu’au ${shortDateTime(tempete.endsAt)}`
        : 'pas de Tempête de neige à déclencher, sans effet';
      for (const m of groupe) pour(m, sansEffet(texte));
      break;
    }

    case 'clone_ligue': {
      const meilleure = meilleureDeLaLigue(db);
      for (const m of groupe) {
        if (!meilleure) {
          pour(m, sansEffet('aucune game dans la ligue, sans effet'));
          continue;
        }
        // Hors de toute game : `pointsHorsGame()` les ajoute au total.
        m.pendante.points = meilleure.game.score;
        pour(m, sansEffet(`${pts(meilleure.game.score)} : la meilleure game de la ligue, celle de ${meilleure.pseudo}`));
      }
      break;
    }

    case 'meilleure_aux_derniers': {
      const meilleure = meilleureDeLaLigue(db);
      for (const m of groupe) {
        const libres = gamesSansCarte(db, m.joueur.id);
        if (!meilleure || libres.length === 0) {
          pour(m, sansEffet('aucune game libre, sans effet'));
          continue;
        }
        const pire = [...libres].sort((x, y) => x.score - y.score)[0];
        const avant = pire.score;
        const points = donneLeScore(db, pire, card, o, meilleure.game.score);
        pour(m, regleSur(`sa pire game de ${avant} pts prend les ${meilleure.game.score} pts de la meilleure de la ligue → ${pts(points)}`, points, pire.id));
      }
      break;
    }

    case 'par_top1': {
      // Depuis la dernière fois que cette carte est tombée ; la première fois,
      // depuis le début de la saison.
      const precedente = db.ouvertures
        .filter((x) => x.cardId === card.id && x.id !== o)
        .sort((x, y) => y.openedAt.localeCompare(x.openedAt))[0];
      const depuis = precedente?.openedAt ?? '';
      for (const m of groupe) {
        const tops = comptees(db, m.joueur.id).filter((g) => g.placement === 1 && g.createdAt > depuis).length;
        if (tops === 0) {
          pour(m, sansEffet(depuis ? 'aucun Top 1 depuis la dernière fois, sans effet' : 'aucun Top 1, sans effet'));
          continue;
        }
        m.pendante.points = tops * action.points;
        pour(m, sansEffet(`${tops} Top 1 → ${pts(tops * action.points)} sur le total`));
      }
      break;
    }

    case 'petites_games':
      for (const m of groupe) {
        const petites = comptees(db, m.joueur.id).filter((g) => g.kills < action.moinsDe).length;
        if (petites === 0) {
          pour(m, sansEffet(`aucune game de moins de ${action.moinsDe} kills, sans effet`));
          continue;
        }
        m.pendante.points = petites * action.points;
        pour(m, sansEffet(`${petites} game${petites > 1 ? 's' : ''} de moins de ${action.moinsDe} kills → ${pts(petites * action.points)} sur le total`));
      }
      break;

    case 'vol_score': {
      const ordre = rank(
        db.players
          .filter((p) => p.active)
          .map((player) => ({ player, totals: totalsFor(comptees(db, player.id), pointsHorsGame(db, player.id)) })),
      );
      for (const m of groupe) {
        const i = ordre.findIndex((r) => r.player.id === m.joueur.id);
        const dessus = i > 0 ? ordre[i - 1] : null;
        const sien = ordre[i]?.totals.totalScore ?? 0;
        if (!dessus || dessus.totals.totalScore <= sien) {
          pour(m, sansEffet('personne au-dessus de lui, sans effet'));
          continue;
        }
        const gain = dessus.totals.totalScore - sien;
        m.pendante.points = gain;
        pour(m, sansEffet(`prend le score de ${dessus.player.pseudo} (${dessus.totals.totalScore} pts) → ${pts(gain)} sur le total`));
      }
      break;
    }

    case 'fige_meilleure':
    case 'fige_hasard':
      for (const m of groupe) {
        const toutes = comptees(db, m.joueur.id);
        // Jamais la pire game : il doit pouvoir s'en débarrasser.
        const pire = [...toutes].sort((x, y) => x.score - y.score)[0];
        const meilleure = [...toutes].sort((x, y) => y.score - x.score)[0];
        let libres = gamesPrenables(db, m.joueur.id).filter((g) => g.id !== pire?.id);
        if (action.quoi === 'fige_meilleure' && toutes.length < action.minGames) libres = [];
        if (action.quoi === 'fige_hasard' && action.meilleureExclue) libres = libres.filter((g) => g.id !== meilleure?.id);
        if (libres.length === 0) {
          pour(m, sansEffet('aucune game à figer, sans effet'));
          continue;
        }
        const game =
          retenue(m, libres) ??
          (action.quoi === 'fige_meilleure' ? [...libres].sort((x, y) => y.score - x.score)[0] : pick(libres));
        applyPoints(db, game, card, o, 0);
        pour(m, regleSur(`${laGame(db, game)} (${game.score} pts) figée : plus aucune carte ne peut la toucher`, 0, game.id));
      }
      break;

    case 'chaine_tete':
    case 'echange_general': {
      const maillons: { membre: Membre; game: Game }[] = [];
      for (const m of melange(groupe)) {
        if (estImmunise(m.joueur, now)) {
          pour(m, sansEffet('paré par l’immunité : hors de la chaîne'));
          continue;
        }
        let libres = gamesPrenables(db, m.joueur.id);
        if (action.quoi === 'chaine_tete') {
          // Ni sa meilleure ni sa pire.
          const toutes = comptees(db, m.joueur.id);
          const pire = [...toutes].sort((x, y) => x.score - y.score)[0];
          const meilleure = [...toutes].sort((x, y) => y.score - x.score)[0];
          libres = libres.filter((g) => g.id !== pire?.id && g.id !== meilleure?.id);
        }
        if (libres.length === 0) {
          pour(m, sansEffet('aucune game à échanger : hors de la chaîne'));
          continue;
        }
        maillons.push({ membre: m, game: pick(libres) });
      }
      if (maillons.length < 2) {
        for (const x of maillons) pour(x.membre, sansEffet('pas assez de joueurs dans la chaîne, sans effet'));
        break;
      }
      chaine(db, card, maillons, resultats);
      break;
    }

    case 'roulette': {
      // Le perdant de la course est tiré à l'ouverture, et mis en tête des
      // bénéficiaires (`beneficiairesRoue`) : l'écran et l'overlay le font
      // tomber, la carte le frappe. Sans lui, au sort.
      const barillet = groupe.filter((m) => !estImmunise(m.joueur, now) && comptees(db, m.joueur.id).length > 0);
      const designe = db.ouvertures.find((x) => x.id === o)?.beneficiaires[0];
      const touche = barillet.find((m) => m.joueur.id === designe) ?? (barillet.length > 0 ? pick(barillet) : null);
      for (const m of groupe) {
        if (m !== touche) {
          pour(m, sansEffet(estImmunise(m.joueur, now) ? 'paré par l’immunité' : 'a passé la ligne : épargné'));
          continue;
        }
        const candidates = comptees(db, m.joueur.id).filter((g) => !estFigee(g));
        if (candidates.length === 0) {
          pour(m, sansEffet('touché, mais toutes ses games sont figées : sans effet'));
          continue;
        }
        const meilleure = retenue(m, candidates) ?? [...candidates].sort((x, y) => y.score - x.score)[0];
        applyPoints(db, meilleure, card, o, 0);
        meilleure.skipped = true;
        pour(m, regleSur(`n’a pas passé la ligne : il perd sa meilleure game, ${laGame(db, meilleure)} (${meilleure.score} pts)`, -meilleure.score, meilleure.id));
      }
      break;
    }

    case 'pire_a_zero':
      for (const m of groupe) {
        if (estImmunise(m.joueur, now)) {
          pour(m, sansEffet('paré par l’immunité'));
          continue;
        }
        // Même une game déjà touchée par une carte ; jamais une game figée.
        const candidates = comptees(db, m.joueur.id).filter((g) => !estFigee(g));
        if (candidates.length === 0) {
          pour(m, sansEffet('aucune game, sans effet'));
          continue;
        }
        const pire = [...candidates].sort((x, y) => x.score - y.score)[0];
        if (pire.score === 0) {
          pour(m, sansEffet('sa pire game vaut déjà 0, sans effet'));
          continue;
        }
        const avant = pire.score;
        const points = donneLeScore(db, pire, card, o, 0);
        pour(m, regleSur(`sa pire game, ${laGame(db, pire)} (${avant} pts), ramenée à ${pire.score} → ${pts(points)}`, points, pire.id));
      }
      break;

    case 'jokers':
      for (const m of groupe) {
        const enMain = jokersDe(db, m.joueur.id).length;
        const donnes = Math.max(0, Math.min(action.nombre, JOKERS.max - enMain));
        for (let i = 0; i < donnes; i++) {
          db.cartesEnAttente.push({
            id: newId(),
            joueurId: m.joueur.id,
            cardId: 'joker-givre',
            ouvertureId: o,
            creeA: new Date(now.getTime() + i).toISOString(),
            consommeeA: null,
            gameId: null,
            resultat: null,
            paireId: null,
          });
        }
        pour(
          m,
          sansEffet(
            donnes === 0
              ? `déjà ${JOKERS.max} Jokers en main, sans effet`
              : `+${donnes} Joker${donnes > 1 ? 's' : ''} (${enMain + donnes} en main)`,
          ),
        );
      }
      break;

    case 'fusion_pires':
      for (const m of groupe) {
        const libres = [...gamesSansCarte(db, m.joueur.id)].sort((x, y) => x.score - y.score);
        if (libres.length < 2) {
          pour(m, sansEffet('il faut deux games libres, sans effet'));
          continue;
        }
        const v0 = retenue(m, libres, 0);
        const v1 = retenue(m, libres, 1);
        const [pire, seconde] = v0 && v1 && v0 !== v1 ? [v0, v1].sort((x, y) => x.score - y.score) : libres;
        const somme = pire.score + seconde.score;
        const points = donneLeScore(db, seconde, card, o, somme);
        applyPoints(db, pire, card, o, 0);
        pire.skipped = true;
        pour(m, regleSur(`ses 2 pires games, ${laGame(db, pire)} (${pire.score} pts) et ${laGame(db, seconde).slice(3)} (${somme - pire.score} pts), n’en font plus qu’une de ${seconde.score} pts : un créneau est rendu`, points, seconde.id));
      }
      break;

    case 'pire_moyenne':
      for (const m of groupe) {
        const toutes = comptees(db, m.joueur.id);
        const libres = gamesSansCarte(db, m.joueur.id);
        if (toutes.length < 2 || libres.length === 0) {
          pour(m, sansEffet('il faut deux games, dont une libre : sans effet'));
          continue;
        }
        const moyenne = Math.round(toutes.reduce((s, g) => s + g.score, 0) / toutes.length);
        const pire = retenue(m, libres) ?? [...libres].sort((x, y) => x.score - y.score)[0];
        if (pire.score >= moyenne) {
          pour(m, sansEffet(`pire game déjà à la moyenne (${moyenne} pts), sans effet`));
          continue;
        }
        const avant = pire.score;
        const points = donneLeScore(db, pire, card, o, moyenne);
        pour(m, regleSur(`sa pire game, ${laGame(db, pire)} (${avant} pts), ramenée à la moyenne de ${moyenne} → ${pts(points)}`, points, pire.id));
      }
      break;
  }

  for (const m of groupe) m.pendante.bilan = totalDe(m) - (avant.get(m.pendante.id) ?? 0);
  // Une pire game rendue n'est pas une perte : le créneau se rejoue.
  if (action.quoi === 'supprime_pire') for (const m of groupe) m.pendante.bilan = 0;

  // Les autres cartes du groupe sont réglées ici ; celle-ci, par l'appelant.
  for (const m of groupe) {
    if (m.pendante === pendante) continue;
    consomme(m.pendante, card, resultats.get(m.pendante.id) ?? sansEffet('sans effet'), now);
  }
  return resultats.get(pendante.id) ?? sansEffet('sans effet');
}

/**
 * Joue une Cryogénisation gardée (Folie, 12/11/2026) : la meilleure game
 * encore sans carte de son porteur est figée — jamais sa pire —, et plus
 * aucune carte ne peut la toucher. Rend 'CARTE' si la carte n'est pas une
 * Cryogénisation en main, 'GAMES' s'il n'a pas de game à figer : la carte
 * reste alors en main.
 */
export function joueFigeGarde(db: Database, carteId: string, now = new Date()): CarteAppliquee | 'CARTE' | 'GAMES' {
  const pendante = db.cartesEnAttente.find((c) => c.id === carteId && c.consommeeA === null);
  const card = pendante ? getCard(pendante.cardId) : null;
  if (!pendante || !card || card.effect.kind !== 'fige_garde') return 'CARTE';
  const pire = pireComptee(db, pendante.joueurId);
  const libres = gamesPrenables(db, pendante.joueurId).filter((g) => g.id !== pire?.id);
  if (libres.length === 0) return 'GAMES';
  const meilleure = [...libres].sort((a, b) => b.score - a.score)[0];
  applyPoints(db, meilleure, card, pendante.ouvertureId, 0);
  return consomme(
    pendante,
    card,
    regleSur(`meilleure game figée (${meilleure.score} pts) : plus aucune carte ne peut la toucher`, 0, meilleure.id),
    now,
  );
}

export type RefusEchangeCible = 'CARTE' | 'CIBLE' | 'IMMUNISE' | 'DEJA' | 'GAMES';

/**
 * Joue un Troc des Neiges gardé par un finisseur, sur le joueur qu'il
 * désigne : sa pire game libre et la meilleure game libre de l'autre
 * échangent leur score. Une fois par joueur — sauf la revanche : visé par
 * quelqu'un, on peut le viser à son tour même si on a déjà joué le sien. Un
 * immunisé ne peut pas être visé. Sur la game de l'autre, une trace
 * (`TROC_SUBI`) retient qui l'a visé.
 */
export function joueEchangeCible(
  db: Database,
  carteId: string,
  cible: Player,
  now = new Date(),
): CarteAppliquee | RefusEchangeCible {
  const pendante = db.cartesEnAttente.find((c) => c.id === carteId && c.consommeeA === null);
  const card = pendante ? getCard(pendante.cardId) : null;
  if (!pendante || !card || card.effect.kind !== 'echange_cible') return 'CARTE';
  if (cible.id === pendante.joueurId) return 'CIBLE';
  if (estImmunise(cible, now)) return 'IMMUNISE';
  const dejaJoue = db.cartesEnAttente.some(
    (c) =>
      c.joueurId === pendante.joueurId &&
      c.consommeeA !== null &&
      c.gameId !== null &&
      getCard(c.cardId)?.effect.kind === 'echange_cible' &&
      c.cardId !== TROC_SUBI.id,
  );
  const revanche = db.cartesEnAttente.some(
    (c) => c.joueurId === pendante.joueurId && c.cardId === TROC_SUBI.id && c.paireId === cible.id,
  );
  if (dejaJoue && !revanche) return 'DEJA';
  const miennes = gamesPrenables(db, pendante.joueurId);
  const siennes = gamesPrenables(db, cible.id);
  if (miennes.length === 0 || siennes.length === 0) return 'GAMES';
  const pire = [...miennes].sort((a, b) => a.score - b.score)[0];
  const meilleure = [...siennes].sort((a, b) => b.score - a.score)[0];
  const porteur = db.players.find((p) => p.id === pendante.joueurId)?.pseudo ?? 'un finisseur';
  const sa = pire.score;
  const sb = meilleure.score;
  const points = donneLeScore(db, pire, card, pendante.ouvertureId, sb);
  const rendu = donneLeScore(db, meilleure, TROC_SUBI, pendante.ouvertureId, sa);
  db.cartesEnAttente.push({
    id: newId(),
    joueurId: cible.id,
    cardId: TROC_SUBI.id,
    ouvertureId: pendante.ouvertureId,
    creeA: now.toISOString(),
    consommeeA: now.toISOString(),
    gameId: meilleure.id,
    resultat: `Troc des Neiges de ${porteur} : sa meilleure game de ${sb} pts prend les ${sa} pts de la pire de ${porteur} → ${pts(rendu)}`,
    // Qui l'a visé : pour la revanche.
    paireId: pendante.joueurId,
  });
  return consomme(
    pendante,
    card,
    regleSur(
      `${revanche && dejaJoue ? 'revanche sur' : 'joué sur'} ${cible.pseudo} : sa pire game de ${sa} pts prend les ${sb} pts de la meilleure de ${cible.pseudo} → ${pts(points)}`,
      points,
      pire.id,
    ),
    now,
  );
}

/** Écrit le règlement sur la carte, et en rend la trace. */
function consomme(
  pendante: CarteEnAttente,
  card: CardDefinition,
  reglement: Reglement,
  now: Date,
): CarteAppliquee {
  pendante.consommeeA = now.toISOString();
  pendante.gameId = reglement.gameId;
  pendante.resultat = reglement.resultat;
  return {
    cardId: card.id,
    nom: card.name,
    joueurId: pendante.joueurId,
    gameId: reglement.gameId,
    points: reglement.points,
    resultat: reglement.resultat,
  };
}

/* ------------------------------ Les deux portes -------------------------- */

/**
 * Consomme la carte **active** de ce joueur sur cette game : une seule.
 *
 * La carte active est la plus ancienne de celles qui attendent une prochaine
 * game ; les suivantes restent en réserve et prendront la relève, une par
 * game. Deux cartes ne s'empilent jamais sur une même game.
 */
export function appliqueCartesEnAttente(
  db: Database,
  game: Game,
  contexte: ContexteGame = {},
  now = new Date(),
): ApplicationCartes {
  const cartes: CarteAppliquee[] = [];
  let facteurFlocons = 1;

  for (const pendante of enAttenteDe(db, game.playerId)) {
    const card = getCard(pendante.cardId);
    if (!card) {
      // Une carte retirée du catalogue : elle ne bloque pas la file.
      pendante.consommeeA = now.toISOString();
      pendante.resultat = 'carte inconnue, sans effet';
      continue;
    }
    if (momentDe(card.effect) !== 'PROCHAINE') continue;

    const reglement = regleSurGame(db, pendante, card, game, contexte, now);
    facteurFlocons = reglement.facteurFlocons;
    cartes.push(consomme(pendante, card, reglement, now));
    break;
  }

  return { cartes, facteurFlocons };
}

/**
 * Règle tout ce qui n'attend pas une nouvelle game.
 *
 * À appeler dans la transaction, après l'ouverture d'un booster et après
 * chaque saisie de game. Dans l'ordre :
 *
 *  1. ce qui se règle dans l'instant — flocons, créneau, immunité ;
 *  2. les cartes qui relèvent une game déjà jouée, tant qu'il reste une game
 *     sans carte ;
 *  3. pour un joueur qui a joué toutes ses games, les cartes de prochaine
 *     game : un bonus tombe sur la game sans carte où il rapporte le plus, un
 *     malus sur la plus récente.
 */
/**
 * Le temps laissé à l'écran pour révéler une carte. Passé ce délai, ce qui
 * attendait la révélation se règle quand même : un onglet fermé en pleine
 * ouverture ne garde pas les flocons de quelqu'un pour toujours.
 */
const DELAI_REVELATION_MS = 2 * 60_000;

/**
 * La carte vient d'un booster dont l'ouverture n'est pas encore révélée à
 * l'écran ? Ses flocons — ou la game qu'elle fige — ne doivent pas se voir
 * avant la carte : le solde d'un joueur ne spoile pas son ouverture. Une
 * carte posée sans ouverture (à la main) n'attend rien.
 */
function pasEncoreRevelee(db: Database, pendante: CarteEnAttente, now: Date): boolean {
  const o = db.ouvertures.find((x) => x.id === pendante.ouvertureId);
  if (!o || o.annonceeA) return false;
  return now.getTime() - Date.parse(o.openedAt) < DELAI_REVELATION_MS;
}

/**
 * Règle ce qu'une ouverture laissait en suspens, une fois sa carte révélée
 * (`annonceeA` posé par `annonceOuverture`) : les flocons, la game figée.
 */
export function regleApresRevelation(db: Database, ouvertureId: string, now = new Date()): CarteAppliquee[] {
  const o = db.ouvertures.find((x) => x.id === ouvertureId);
  if (!o) return [];
  return o.beneficiaires.flatMap((id) => regleCartesSansAttendre(db, id, now));
}

export function regleCartesSansAttendre(
  db: Database,
  joueurId: string,
  now = new Date(),
  /** Sans attendre la révélation : on rouvre pour lui, la carte d'avant a été vue. */
  forcer = false,
): CarteAppliquee[] {
  const joueur = db.players.find((p) => p.id === joueurId);
  if (!joueur) return [];
  const faites: CarteAppliquee[] = [];

  for (const pendante of enAttenteDe(db, joueurId)) {
    const card = getCard(pendante.cardId);
    if (!card) continue;
    const moment = momentDe(card.effect);
    if (moment === 'PROCHAINE') continue;
    if (moment === 'GARDEE') {
      // Cinq Jokers au plus : les plus anciens sont gardés, un de trop ne
      // fait rien. Il est consommé tout de suite, pour qu'on lise pourquoi.
      // Les autres cartes gardées (le Verglas) s'accumulent : chacune attend
      // que la modération la joue.
      if (card.effect.kind === 'joker' && jokersDe(db, joueurId).indexOf(pendante) >= JOKERS.max) {
        faites.push(
          consomme(pendante, card, sansEffet(`déjà ${JOKERS.max} Jokers en main : celui-ci ne fait rien`), now),
        );
      }
      continue;
    }
    // Pas avant que la carte soit révélée à l'écran : le solde spoilerait.
    if (!forcer && pasEncoreRevelee(db, pendante, now)) continue;

    const reglement =
      moment === 'INSTANT'
        ? regleInstant(db, pendante, card, joueur, now)
        : regleSurJouee(db, pendante, card);
    if (reglement.regle) faites.push(consomme(pendante, card, reglement, now));
  }

  // Plus de game à jouer : ce qui attendait la prochaine tombe sur une game
  // déjà jouée, une carte par game.
  if (aJoueToutesSesGames(db, joueur)) {
    for (const pendante of enAttenteDe(db, joueurId)) {
      const card = getCard(pendante.cardId);
      if (!card || momentDe(card.effect) !== 'PROCHAINE') continue;
      const libres = gamesSansCarte(db, joueurId);
      if (libres.length === 0) break;

      const cible = card.nature === 'malus' ? libres[0] : meilleureCible(db, card.effect, libres);
      const reglement = regleSurGame(db, pendante, card, cible, {}, now);
      if (reglement.facteurFlocons > 1) {
        // Les flocons de cette game ont déjà été versés : on verse ce qui
        // manque pour les doubler.
        const gain = rewardForGame(cible.kills, cible.placement).total * (reglement.facteurFlocons - 1);
        credit(db, joueurId, gain, 'CARTE', pendante.ouvertureId);
        reglement.resultat = `flocons d’une game doublés : +${fr(gain)} flocons`;
      }
      faites.push(consomme(pendante, card, reglement, now));
    }
  }

  return faites;
}

/* --------------------------- Pas de stock de cartes ---------------------- */

/**
 * La carte qui attend encore de jouer pour ce joueur, s'il en a une : une
 * carte de prochaine game, ou une qui attend une game jouée à relever.
 *
 * Il n'y a jamais de stock de cartes : un joueur n'a qu'une carte en attente
 * à la fois. Tant qu'elle n'a pas joué, aucun booster ne s'ouvre pour lui, et
 * le sort d'un booster de la ligue ne tombe pas sur lui (`ouvrePack`). Le
 * Joker n'en est pas une : il se garde, cinq au plus, sans rien bloquer.
 */
export function carteQuiAttend(db: Database, joueurId: string): CarteEnAttente | null {
  return (
    enAttenteDe(db, joueurId).find((c) => {
      const card = getCard(c.cardId);
      // Ni le Joker, qui se garde, ni une carte qui se règle tout de suite :
      // si elle attend, c'est sa révélation, l'affaire de quelques secondes.
      return card !== null && momentDe(card.effect) !== 'GARDEE' && momentDe(card.effect) !== 'INSTANT';
    }) ?? null
  );
}

/* -------------------------------- Le Joker ------------------------------- */

/** Les Jokers que garde ce joueur, du plus ancien au plus récent. */
export function jokersDe(db: Database, joueurId: string): CarteEnAttente[] {
  return enAttenteDe(db, joueurId).filter((c) => {
    const card = getCard(c.cardId);
    return card !== null && card.effect.kind === 'joker';
  });
}

/** Le Joker que sert la modération, s'il en a un : le plus ancien. */
export function jokerDe(db: Database, joueurId: string): CarteEnAttente | null {
  return jokersDe(db, joueurId)[0] ?? null;
}

/** L'ouverture que référencent les Jokers de départ : ils ne sortent d'aucun booster. */
export const OUVERTURE_INSCRIPTION = 'inscription';

/** Les Jokers d'un joueur qui s'inscrit (`JOKERS.depart`). */
export function donneJokersDeDepart(db: Database, joueurId: string, now = new Date()): void {
  for (let i = 0; i < JOKERS.depart; i++) {
    db.cartesEnAttente.push({
      id: newId(),
      joueurId,
      cardId: 'joker-givre',
      ouvertureId: OUVERTURE_INSCRIPTION,
      // Une milliseconde d'écart : l'ordre d'arrivée reste net.
      creeA: new Date(now.getTime() + i).toISOString(),
      consommeeA: null,
      gameId: null,
      resultat: null,
      paireId: null,
    });
  }
}

export type RefusVerglas = 'CARTE' | 'CIBLE';

/**
 * Joue un Verglas gardé par un joueur, sur la victime qu'il a choisie : le
 * Verglas est consommé, et la victime perd tout de suite 20 points sur son
 * total, hors de toute game — son coup (`COUP_DE_VERGLAS`) s'inscrit chez elle,
 * déjà réglé, avec ses points (`points`). L'immunité le pare : le coup
 * s'inscrit, sans points. À la route de vérifier que la victime est en lice et
 * n'est pas lui.
 */
export function joueVerglas(
  db: Database,
  carteId: string,
  cible: Player,
  now = new Date(),
): CarteAppliquee | RefusVerglas {
  const pendante = db.cartesEnAttente.find((c) => c.id === carteId && c.consommeeA === null);
  const card = pendante ? getCard(pendante.cardId) : null;
  if (!pendante || !card || card.effect.kind !== 'malus_choisi') return 'CARTE';
  if (cible.id === pendante.joueurId) return 'CIBLE';
  const valeur = card.effect.value;
  const pare = estImmunise(cible, now);
  const porteur = db.players.find((p) => p.id === pendante.joueurId)?.pseudo ?? 'un joueur';
  db.cartesEnAttente.push({
    id: newId(),
    joueurId: cible.id,
    cardId: COUP_DE_VERGLAS.id,
    ouvertureId: pendante.ouvertureId,
    creeA: now.toISOString(),
    consommeeA: now.toISOString(),
    gameId: null,
    resultat: pare
      ? `${card.name} de ${porteur}, paré par l’immunité`
      : `${card.name} de ${porteur} : −${valeur} pts sur le total`,
    paireId: null,
    points: pare ? 0 : -valeur,
  });
  return consomme(
    pendante,
    card,
    sansEffet(
      pare
        ? `joué sur ${cible.pseudo}, paré par son immunité`
        : `joué sur ${cible.pseudo} : −${valeur} pts sur son total`,
    ),
    now,
  );
}

export type RefusEchangeChoisi = 'CARTE' | 'TROP_TOT' | 'MA_GAME' | 'AUTRE_GAME';

/** Les games jouées par un joueur, sans celles qu'un Joker a annulées. */
export const gamesJouees = (db: Database, joueurId: string) =>
  gamesOf(db, joueurId).filter((g) => !g.skipped).length;

/**
 * Joue un Pacte du Givre gardé par un joueur : une de ses games et une game
 * d'un autre joueur, toutes deux prenables — pas figées (`gamesPrenables`) —,
 * échangent leur score —
 * chacune repart avec celui de l'autre, au grand livre des points de la game
 * (`applyPoints`). Le Pacte est consommé sur sa game ; sur celle de l'autre,
 * une trace (`PACTE_SUBI`) dit d'où vient l'échange, et en fait une game qui
 * porte une carte. Il ne se joue qu'une fois `minGames` games jouées.
 *
 * Celui qui y perdrait est-il immunisé ? L'échange tombe, et le Pacte est
 * perdu : le laisser gagner à l'autre créerait des points. À la route de
 * vérifier que l'autre joueur est en lice.
 */
export function joueEchangeChoisi(
  db: Database,
  carteId: string,
  maGameId: string,
  autreGameId: string,
  now = new Date(),
): CarteAppliquee | RefusEchangeChoisi {
  const pendante = db.cartesEnAttente.find((c) => c.id === carteId && c.consommeeA === null);
  const card = pendante ? getCard(pendante.cardId) : null;
  if (!pendante || !card || card.effect.kind !== 'echange_choisi') return 'CARTE';
  if (gamesJouees(db, pendante.joueurId) < card.effect.minGames) return 'TROP_TOT';
  const maGame = gamesPrenables(db, pendante.joueurId).find((g) => g.id === maGameId);
  if (!maGame) return 'MA_GAME';
  const autreGame = db.games.find((g) => g.id === autreGameId && g.playerId !== pendante.joueurId);
  if (!autreGame || !gamesPrenables(db, autreGame.playerId).some((g) => g.id === autreGame.id)) return 'AUTRE_GAME';

  const moi = db.players.find((p) => p.id === pendante.joueurId);
  const lui = db.players.find((p) => p.id === autreGame.playerId);
  const porteur = moi?.pseudo ?? 'un joueur';
  const autre = lui?.pseudo ?? 'un joueur';
  const ecart = scoreNu(autreGame) - scoreNu(maGame);
  const perdant = ecart > 0 ? lui : ecart < 0 ? moi : undefined;
  const pare = perdant !== undefined && estImmunise(perdant, now);

  let points = 0;
  let rendu = 0;
  if (!pare && ecart !== 0) {
    points = applyPoints(db, maGame, card, pendante.ouvertureId, ecart);
    rendu = applyPoints(db, autreGame, PACTE_SUBI, pendante.ouvertureId, -ecart);
  }
  const echange = `${scoreNu(maGame)} pts contre ${scoreNu(autreGame)}`;
  db.cartesEnAttente.push({
    id: newId(),
    joueurId: autreGame.playerId,
    cardId: PACTE_SUBI.id,
    ouvertureId: pendante.ouvertureId,
    creeA: now.toISOString(),
    consommeeA: now.toISOString(),
    gameId: autreGame.id,
    resultat: pare
      ? `Pacte du Givre de ${porteur}, annulé : ${perdant?.pseudo} est immunisé`
      : ecart === 0
        ? `Pacte du Givre de ${porteur} : égalité, sans effet`
        : `Pacte du Givre de ${porteur} : ${scoreNu(autreGame)} pts contre ${scoreNu(maGame)} → ${pts(rendu)}`,
    paireId: null,
  });
  return consomme(
    pendante,
    card,
    {
      points,
      resultat: pare
        ? `échange avec ${autre} annulé : ${perdant?.pseudo} est immunisé`
        : ecart === 0
          ? `échange avec ${autre} : égalité, sans effet`
          : `échange avec ${autre} : ${echange} → ${pts(points)}`,
      facteurFlocons: 1,
      regle: true,
      gameId: maGame.id,
    },
    now,
  );
}

/**
 * Sert le Joker de ce joueur sur cette game : elle ne compte pas, et le Joker
 * est consommé. À l'appelant de passer la game (`skipped`) : ni points, ni
 * flocons, ni carte active — celle-ci attend la game suivante. Rend `null`
 * s'il n'a pas de Joker.
 */
export function utiliseJoker(db: Database, game: Game, now = new Date()): CarteAppliquee | null {
  const joker = jokerDe(db, game.playerId);
  const card = joker ? getCard(joker.cardId) : null;
  if (!joker || !card) return null;
  return consomme(joker, card, sansEffet('Joker joué : cette game ne compte pas', game.id), now);
}

/** La game où un bonus rapporte le plus ; à égalité, la plus récente. */
function meilleureCible(db: Database, effect: CardEffect, libres: Game[]): Game {
  let meilleure = libres[0];
  let gain = demande(effect, meilleure, contexteDe(db, meilleure))?.points ?? 0;
  for (const game of libres.slice(1)) {
    const g = demande(effect, game, contexteDe(db, game))?.points ?? 0;
    if (g > gain) {
      meilleure = game;
      gain = g;
    }
  }
  return meilleure;
}

/* ---------------------- Corriger une game déjà saisie --------------------- */

/**
 * Les genres dont les points sur une game se relisent de ses kills et de son
 * placement : ceux de `demande`, sauf « Clone kill du meilleur » — elle a
 * remplacé les kills de la game, les corriger n'aurait pas de sens sûr.
 */
const RECALCULABLES = new Set<CardEffect['kind']>([
  'bonus_points',
  'malus_points',
  'multiplicateur_game',
  'diviseur_game',
  'plancher',
  'bonus_top',
  'petite_game',
  'kills_paliers',
  'progression_kills',
]);

/** Les cartes consommées sur cette game, quel que soit ce qu'elles y ont fait. */
function cartesSurLaGame(db: Database, game: Game): CarteEnAttente[] {
  return db.cartesEnAttente.filter((c) => c.gameId === game.id && c.consommeeA !== null);
}

/**
 * Ce que devient une carte jouée sur une game qu'on corrige : **relue** sur la
 * game corrigée (une carte de prochaine game qui se compte en kills et en
 * top), **gardée** telle qu'elle a joué (une game jouée relevée, figée,
 * supprimée, un Joker), ou **bloquante** — elle a changé les kills de la game
 * (« Clone kill du meilleur ») ou la lie à celle d'un autre joueur
 * (l'échange) : la game ne se corrige pas, elle se supprime et se ressaisit.
 */
export function sortALaCorrection(cardId: string): 'relue' | 'gardee' | 'bloque' {
  const card = getCard(cardId);
  if (!card) return 'gardee';
  if (
    card.effect.kind === 'clone_kills' ||
    card.effect.kind === 'echange' ||
    card.effect.kind === 'echange_choisi' ||
    card.effect.kind === 'echange_cible' ||
    card.effect.kind === 'roue'
  ) {
    return 'bloque';
  }
  return RECALCULABLES.has(card.effect.kind) && momentDe(card.effect) === 'PROCHAINE' ? 'relue' : 'gardee';
}

/** Les cartes d'une game qui empêchent de la corriger : voir `sortALaCorrection`. */
export function cartesQuiFigentLaGame(db: Database, game: Game): string[] {
  return cartesSurLaGame(db, game)
    .filter((c) => sortALaCorrection(c.cardId) === 'bloque')
    .map((c) => getCard(c.cardId)?.name ?? c.cardId);
}

/** Les cartes jouées sur une game, et ce qu'elles y ont fait : pour la fiche du joueur. */
export function cartesJoueesSur(
  db: Database,
  game: Game,
): { cardId: string; nom: string; rarity: string; glyph: string; resultat: string; correction: 'relue' | 'gardee' | 'bloque' }[] {
  return cartesSurLaGame(db, game).flatMap((c) => {
    const card = getCard(c.cardId);
    return card
      ? [
          {
            cardId: card.id,
            nom: card.name,
            rarity: card.rarity,
            glyph: card.glyph,
            resultat: c.resultat ?? '',
            correction: sortALaCorrection(card.id),
          },
        ]
      : [];
  });
}

/**
 * Relit les cartes d'une game dont on vient de corriger les kills ou le
 * placement (`avant` : ce qu'ils valaient). Une carte de prochaine game
 * reprend les points que sa règle donne à la game corrigée — la Luge d'une
 * game passée en Top 1 rapporte ses 15 points, celle d'une game qui n'y est
 * plus les perd —, avec la même majoration qu'à sa saisie (un évènement
 * « cartes renforcées »). Un malus paré par l'immunité reste paré. Les autres
 * cartes — une game jouée relevée, figée, supprimée, un Joker — gardent ce
 * qu'elles avaient donné. Le cumul reste dans les bornes de `GAME_LIMITS`, et
 * le score est réécrit. Rend ce qui a changé, carte par carte.
 */
export function recalculeCartesDeLaGame(
  db: Database,
  game: Game,
  avant: Pick<Game, 'kills' | 'placement'>,
): { nom: string; avant: number; apres: number }[] {
  const changements: { nom: string; avant: number; apres: number }[] = [];
  const ancienne: Game = { ...game, kills: avant.kills, placement: avant.placement };

  for (const pendante of cartesSurLaGame(db, game)) {
    const card = getCard(pendante.cardId);
    if (!card || !RECALCULABLES.has(card.effect.kind) || momentDe(card.effect) !== 'PROCHAINE') continue;
    const index = game.applied.findIndex((a) => a.cardId === card.id && a.ouvertureId === pendante.ouvertureId);
    const entree = index >= 0 ? game.applied[index] : null;
    const pointsAvant = entree?.points ?? 0;
    // Un malus qui n'a rien retiré avait été paré : il le reste.
    if (card.nature === 'malus' && !entree) continue;

    const demandeAvant = demande(card.effect, ancienne, contexteDe(db, game))?.points ?? 0;
    const voulu = demande(card.effect, game, contexteDe(db, game));
    const demandeApres = voulu?.points ?? 0;
    // La majoration d'un évènement « cartes renforcées », telle qu'à la saisie.
    const majoration = demandeAvant !== 0 && pointsAvant !== 0 ? pointsAvant / demandeAvant : 1;
    const pointsApres = Math.round(demandeApres * majoration);
    if (pointsApres === pointsAvant) continue;

    if (pointsApres === 0) {
      if (index >= 0) game.applied.splice(index, 1);
    } else if (entree) {
      entree.points = pointsApres;
    } else {
      game.applied.push({
        id: newId(),
        cardId: card.id,
        ouvertureId: pendante.ouvertureId,
        points: pointsApres,
        at: new Date().toISOString(),
      });
    }
    pendante.resultat = `${voulu?.resultat ?? 'sans effet'} (game corrigée)`;
    changements.push({ nom: card.name, avant: pointsAvant, apres: pointsApres });
  }

  const cumul = game.applied.reduce((n, a) => n + a.points, 0);
  game.bonusPoints = Math.max(GAME_LIMITS.minBonusPoints, Math.min(GAME_LIMITS.maxBonusPoints, cumul));
  recomputeGame(db, game);
  return changements;
}

/**
 * Rend au joueur les cartes consommées sur une game qu'on supprime : une
 * carte qui attendait une game revient en attente, et tombera sur la
 * suivante ; un Joker revient en main. Jamais deux cartes en attente, ni plus
 * de cinq Jokers : si le joueur n'a plus de place, celle de la game supprimée
 * est perdue, et le dit. Un Pacte du Givre — ou sa trace — ne revient jamais : il a déjà
 * changé une game de chaque côté. À appeler avant de retirer la game.
 */
export function rendCartesDeLaGame(db: Database, game: Game): { rendues: string[]; perdues: string[] } {
  const rendues: string[] = [];
  const perdues: string[] = [];
  for (const pendante of cartesSurLaGame(db, game)) {
    const card = getCard(pendante.cardId);
    if (!card) continue;
    const libre =
      card.effect.kind === 'echange_choisi' || card.effect.kind === 'echange_cible' || card.effect.kind === 'roue'
        ? false
        : momentDe(card.effect) === 'GARDEE'
          ? card.effect.kind !== 'joker' || jokersDe(db, pendante.joueurId).length < JOKERS.max
          : carteQuiAttend(db, pendante.joueurId) === null;
    pendante.gameId = null;
    if (libre) {
      pendante.consommeeA = null;
      pendante.resultat = null;
      rendues.push(card.name);
    } else {
      pendante.resultat = `${pendante.resultat ?? 'jouée'} — sa game a été supprimée`;
      perdues.push(card.name);
    }
  }
  return { rendues, perdues };
}

