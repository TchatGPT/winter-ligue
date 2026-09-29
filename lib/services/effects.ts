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

import type { CarteEnAttente, Database, Game, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getCard, momentDe } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import { CRENEAUX_BONUS, GAME_LIMITS, placementPoints } from '@/lib/domain/rules';
import type { CardDefinition, CardEffect } from '@/lib/domain/types';
import { shortDateTime } from '@/lib/format';
import { facteurCartes } from '@/lib/services/evenements';
import { aJoueToutesSesGames, estImmunise, limiteDe, recomputeGame } from './league';
import { credit } from './ledger';

/** Ce que la saisie sait de la partie, au-delà de la game elle-même. */
export interface ContexteGame {
  /**
   * Les kills du meilleur tueur de la partie, lus sur la capture — la
   * streameuse et les coéquipiers hors ligue compris. Nul si on l'ignore.
   */
  meilleurKills?: number | null;
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
      const points = Math.min(effect.cap, Math.round(nu * (effect.value - 1)));
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
      if (ecart <= 0) return { points: 0, resultat: 'déjà le meilleur tueur de la partie, sans effet' };
      const points = Math.min(effect.cap, ecart);
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

  const voulu = demande(effect, game, contexte);
  if (!voulu) return sansEffet('sans effet sur une game', game.id);
  if (voulu.points === 0) return sansEffet(voulu.resultat, game.id);

  const points = applyPoints(db, game, card, pendante.ouvertureId, voulu.points);
  // Pendant un évènement « cartes renforcées », le delta diffère de la
  // demande : on le dit.
  const resultat = points === voulu.points ? voulu.resultat : `${voulu.resultat}, renforcé : ${pts(points)}`;
  return { points, resultat, facteurFlocons: 1, regle: true, gameId: game.id };
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
  // est borné par le plafond de la carte.
  const ecart = Math.max(-effect.cap, Math.min(effect.cap, mesure(autreGame) - mesure(game)));
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
    case 'game_supplementaire': {
      if (joueur.creneauxBonus >= CRENEAUX_BONUS.max) {
        credit(db, joueur.id, CRENEAUX_BONUS.floconsDeRepli, 'CARTE', pendante.ouvertureId);
        return sansEffet(
          `déjà ${CRENEAUX_BONUS.max} games supplémentaires : +${fr(CRENEAUX_BONUS.floconsDeRepli)} flocons à la place`,
        );
      }
      joueur.creneauxBonus += 1;
      return sansEffet(`+1 game : ${limiteDe(db, joueur)} games à jouer cette saison`);
    }
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
export function regleCartesSansAttendre(db: Database, joueurId: string, now = new Date()): CarteAppliquee[] {
  const joueur = db.players.find((p) => p.id === joueurId);
  if (!joueur) return [];
  const faites: CarteAppliquee[] = [];

  for (const pendante of enAttenteDe(db, joueurId)) {
    const card = getCard(pendante.cardId);
    if (!card) continue;
    const moment = momentDe(card.effect);
    if (moment === 'PROCHAINE') continue;

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

      const cible = card.nature === 'malus' ? libres[0] : meilleureCible(card.effect, libres);
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

/** La game où un bonus rapporte le plus ; à égalité, la plus récente. */
function meilleureCible(effect: CardEffect, libres: Game[]): Game {
  let meilleure = libres[0];
  let gain = demande(effect, meilleure, {})?.points ?? 0;
  for (const game of libres.slice(1)) {
    const g = demande(effect, game, {})?.points ?? 0;
    if (g > gain) {
      meilleure = game;
      gain = g;
    }
  }
  return meilleure;
}
