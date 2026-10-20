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
import { COUP_DE_VERGLAS, getCard, momentDe } from '@/lib/domain/catalog';
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
    // La meilleure game encore sans carte ; à égalité, la plus récente. La
    // carte s'y pose sans en changer le score : elle prend la place, et plus
    // aucune autre ne peut la toucher.
    const libres = gamesSansCarte(db, pendante.joueurId);
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
      // Un seul Joker à la fois : le plus ancien est gardé, un autre ne fait
      // rien. Il est consommé tout de suite, pour qu'on lise pourquoi. Les
      // autres cartes gardées (le Verglas) s'accumulent : chacune attend
      // que la modération la joue.
      if (card.effect.kind === 'joker' && jokerDe(db, joueurId) !== pendante) {
        faites.push(consomme(pendante, card, sansEffet('déjà un Joker en main : celui-ci ne fait rien'), now));
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

/* --------------------------- Pas de stock de cartes ---------------------- */

/**
 * La carte qui attend encore de jouer pour ce joueur, s'il en a une : une
 * carte de prochaine game, ou une qui attend une game jouée à relever.
 *
 * Il n'y a jamais de stock de cartes : un joueur n'a qu'une carte en attente
 * à la fois. Tant qu'elle n'a pas joué, aucun booster ne s'ouvre pour lui, et
 * le sort d'un booster de la ligue ne tombe pas sur lui (`ouvrePack`). Le
 * Joker n'en est pas une : il se garde, un seul, sans rien bloquer.
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

/** Le Joker que garde ce joueur, s'il en a un : le plus ancien. */
export function jokerDe(db: Database, joueurId: string): CarteEnAttente | null {
  return (
    enAttenteDe(db, joueurId).find((c) => {
      const card = getCard(c.cardId);
      return card !== null && card.effect.kind === 'joker';
    }) ?? null
  );
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
      ? `Verglas de ${porteur}, paré par l’immunité`
      : `Verglas de ${porteur} : −${valeur} pts sur le total`,
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
  if (card.effect.kind === 'clone_kills' || card.effect.kind === 'echange') return 'bloque';
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

    const demandeAvant = demande(card.effect, ancienne, {})?.points ?? 0;
    const voulu = demande(card.effect, game, {});
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
 * suivante ; un Joker revient en main. Jamais deux cartes en attente, ni deux
 * Jokers : si le joueur en a déjà une, celle de la game supprimée est perdue,
 * et le dit. À appeler avant de retirer la game.
 */
export function rendCartesDeLaGame(db: Database, game: Game): { rendues: string[]; perdues: string[] } {
  const rendues: string[] = [];
  const perdues: string[] = [];
  for (const pendante of cartesSurLaGame(db, game)) {
    const card = getCard(pendante.cardId);
    if (!card) continue;
    const libre =
      momentDe(card.effect) === 'GARDEE'
        ? card.effect.kind !== 'joker' || jokerDe(db, pendante.joueurId) === null
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

