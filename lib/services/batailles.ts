import 'server-only';

/**
 * Les affrontements.
 *
 * Deux camps misent la même somme de flocons, tirent le même nombre de cartes
 * manche par manche, et celui dont les cartes totalisent la plus haute somme
 * de raretés **remporte le pot** — les deux mises réunies.
 *
 * ## Ce qui n'est jamais laissé au client
 *
 * Le tirage, la comparaison, le versement. Le navigateur reçoit le résultat
 * complet une fois qu'il est acquis et ne fait que le mettre en scène : rejouer
 * la requête, recharger la page ou fermer l'onglet ne change pas une carte.
 *
 * ## Le bot ne triche pas
 *
 * Il tire aux **mêmes tables**, par la même fonction et la même source
 * d'entropie que le joueur. Il gagne donc à peu près une fois sur deux. Jouer
 * contre lui est neutre : une fois sur deux on perd sa mise, une fois sur deux
 * on la double. Le mode n'enrichit personne, il ajoute du risque à ceux qui en
 * veulent — et c'est le seul endroit où les flocons se risquent.
 */

import { CAMP_BOT, type Bataille, type Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN, scoreCamp, vainqueur } from '@/lib/domain/bataille';
import { getCard } from '@/lib/domain/catalog';
import { secureInt, tireDuel } from '@/lib/domain/rng';
import { DUEL } from '@/lib/domain/rules';
import { credit, debit } from '@/lib/services/ledger';

export class BatailleError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'MISE_INVALIDE'
      | 'MANCHES_INVALIDES'
      | 'BATAILLE_INCONNUE'
      | 'DEJA_RESOLUE'
      | 'PAS_TA_BATAILLE'
      | 'TA_PROPRE_BATAILLE',
  ) {
    super(message);
    this.name = 'BatailleError';
  }
}

function raretesDe(cardIds: readonly string[]): string[] {
  return cardIds.map((id) => getCard(id)?.rarity ?? 'C');
}

/**
 * Tire les cartes d'un camp, toutes manches confondues.
 *
 * Les manches sont mises bout à bout : l'affrontement compare des lots, pas
 * des manches gagnées. Les rangs de relance sont recalés sur le lot complet,
 * pour que l'écran sache quelle colonne rejouer.
 */
function tirePour(manches: number): { cardIds: string[]; relances: number[] } {
  const cardIds: string[] = [];
  const relances: number[] = [];
  for (let i = 0; i < manches; i += 1) {
    const tirage = tireDuel(DUEL.weights, DUEL.cartesParManche);
    for (const rang of tirage.relances) relances.push(cardIds.length + rang);
    cardIds.push(...tirage.cards);
  }
  return { cardIds, relances };
}

/**
 * Crée un affrontement et met l'hôte à l'enjeu. À appeler dans une transaction.
 *
 * La mise est **débitée tout de suite**, avant que quiconque ne rejoigne. C'est
 * ce qui rend le lobby honnête : un affrontement affiché est un affrontement
 * dont l'hôte a déjà payé, et personne ne rejoint une mise qui n'existe pas.
 */
export function creeBataille(db: Database, hoteId: string, mise: number, manches: number): Bataille {
  if (!Number.isInteger(manches) || manches < MANCHES_MIN || manches > MANCHES_MAX) {
    throw new BatailleError(
      `Un duel se joue en ${MANCHES_MIN} à ${MANCHES_MAX} manches.`,
      'MANCHES_INVALIDES',
    );
  }
  if (!Number.isInteger(mise) || mise < DUEL.miseMin || mise > DUEL.miseMax) {
    throw new BatailleError(
      `La mise va de ${DUEL.miseMin} à ${DUEL.miseMax.toLocaleString('fr-FR')} flocons.`,
      'MISE_INVALIDE',
    );
  }

  // Lève si le solde est insuffisant : la transaction est alors annulée.
  debit(db, hoteId, mise, 'MISE_BATAILLE', null);

  const bataille: Bataille = {
    id: newId(),
    manches,
    mise,
    hoteId,
    adversaireId: null,
    statut: 'ATTENTE',
    tirages: [],
    vainqueurId: null,
    creeeA: new Date().toISOString(),
    resolueA: null,
  };
  db.batailles.push(bataille);
  return bataille;
}

/**
 * Résout un affrontement : les deux camps tirent, on compare, le vainqueur
 * prend le pot.
 *
 * Le bot ne possède rien : s'il gagne, le pot disparaît, et c'est exactement
 * ce que le joueur a accepté en misant.
 */
function resout(db: Database, bataille: Bataille): Bataille {
  const camps = [bataille.hoteId, bataille.adversaireId!];
  const tirages = camps.map((camp) => {
    const { cardIds, relances } = tirePour(bataille.manches);
    return { camp, cardIds, relances, score: scoreCamp(raretesDe(cardIds)) };
  });

  const gagnant = vainqueur(
    tirages.map((t) => ({ raretes: raretesDe(t.cardIds) })),
    // Le départage se fait sur la même entropie que le tirage : `Math.random`
    // n'a rien à faire dans une décision qui verse des flocons.
    () => secureInt(1_000_000) / 1_000_000,
  );

  bataille.tirages = tirages;
  bataille.vainqueurId = tirages[gagnant].camp;
  bataille.statut = 'TERMINEE';
  bataille.resolueA = new Date().toISOString();

  if (bataille.vainqueurId !== CAMP_BOT) {
    credit(db, bataille.vainqueurId, bataille.mise * 2, 'GAIN_BATAILLE', bataille.id);
  }

  return bataille;
}

/** Rejoint un affrontement en attente, mise à l'appui, et le résout aussitôt. */
export function rejointBataille(db: Database, joueurId: string, batailleId: string): Bataille {
  const bataille = db.batailles.find((b) => b.id === batailleId);
  if (!bataille) throw new BatailleError('Duel inconnu.', 'BATAILLE_INCONNUE');
  if (bataille.statut !== 'ATTENTE') {
    throw new BatailleError('Ce duel est déjà joué.', 'DEJA_RESOLUE');
  }
  if (bataille.hoteId === joueurId) {
    throw new BatailleError(
      'On ne rejoint pas son propre duel — lance contre le bot.',
      'TA_PROPRE_BATAILLE',
    );
  }

  debit(db, joueurId, bataille.mise, 'MISE_BATAILLE', bataille.id);
  bataille.adversaireId = joueurId;
  return resout(db, bataille);
}

/** Lance l'affrontement contre le bot. Réservé à l'hôte. */
export function batailleContreBot(db: Database, joueurId: string, batailleId: string): Bataille {
  const bataille = db.batailles.find((b) => b.id === batailleId);
  if (!bataille) throw new BatailleError('Duel inconnu.', 'BATAILLE_INCONNUE');
  if (bataille.statut !== 'ATTENTE') {
    throw new BatailleError('Ce duel est déjà joué.', 'DEJA_RESOLUE');
  }
  if (bataille.hoteId !== joueurId) {
    throw new BatailleError('Seul l’hôte peut lancer contre le bot.', 'PAS_TA_BATAILLE');
  }

  bataille.adversaireId = CAMP_BOT;
  return resout(db, bataille);
}

/**
 * Annule un affrontement que personne n'a rejoint, et rend la mise.
 *
 * Sans cette sortie, un affrontement créé un soir sans adversaire
 * immobiliserait les flocons de l'hôte pour toujours.
 */
export function annuleBataille(db: Database, joueurId: string, batailleId: string): Bataille {
  const bataille = db.batailles.find((b) => b.id === batailleId);
  if (!bataille) throw new BatailleError('Duel inconnu.', 'BATAILLE_INCONNUE');
  if (bataille.statut !== 'ATTENTE') {
    throw new BatailleError('Ce duel est déjà joué.', 'DEJA_RESOLUE');
  }
  if (bataille.hoteId !== joueurId) {
    throw new BatailleError('Seul l’hôte peut annuler son duel.', 'PAS_TA_BATAILLE');
  }

  credit(db, joueurId, bataille.mise, 'REMBOURSEMENT_BATAILLE', bataille.id);
  bataille.statut = 'ANNULEE';
  bataille.resolueA = new Date().toISOString();
  return bataille;
}

/** Les affrontements en attente d'adversaire, le plus récent en tête. */
export function batailleslibres(db: Database): Bataille[] {
  return db.batailles
    .filter((b) => b.statut === 'ATTENTE')
    .sort((a, b) => b.creeeA.localeCompare(a.creeeA));
}

/* ------------------------------ Vue client ------------------------------ */

export interface CampVue {
  /** L'identifiant du camp : celui d'un joueur, ou `BOT`. */
  id: string;
  pseudo: string;
  bot: boolean;
  /** Les cartes tirées, dans l'ordre du lot. Vide tant que rien n'est joué. */
  cartes: { cardId: string; relance: boolean }[];
  score: number;
}

export interface BatailleVue {
  id: string;
  manches: number;
  /** Cartes par manche et par camp. */
  cartesParManche: number;
  mise: number;
  statut: Bataille['statut'];
  hoteId: string;
  camps: CampVue[];
  vainqueurId: string | null;
  creeeA: string;
  resolueA: string | null;
}

/**
 * Ce qu'un affrontement montre au navigateur.
 *
 * Tout y est déjà décidé : les cartes des deux camps, les scores, le vainqueur.
 * Renvoyer le tirage complet plutôt que le seul verdict est délibéré — c'est ce
 * qui permet de rejouer les rouleaux, et ce qui rend le résultat vérifiable à
 * l'œil par les deux joueurs.
 */
export function vueBataille(db: Database, bataille: Bataille): BatailleVue {
  const nomDe = (id: string): string => {
    if (id === CAMP_BOT) return 'Le Bot';
    return db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
  };

  const camps: CampVue[] = bataille.tirages.map((tirage) => ({
    id: tirage.camp,
    pseudo: nomDe(tirage.camp),
    bot: tirage.camp === CAMP_BOT,
    cartes: tirage.cardIds.map((cardId, i) => ({
      cardId,
      relance: tirage.relances.includes(i),
    })),
    score: tirage.score,
  }));

  // Tant que rien n'est tiré, il n'y a qu'un camp à montrer : l'hôte qui attend.
  if (camps.length === 0) {
    camps.push({ id: bataille.hoteId, pseudo: nomDe(bataille.hoteId), bot: false, cartes: [], score: 0 });
  }

  return {
    id: bataille.id,
    manches: bataille.manches,
    cartesParManche: DUEL.cartesParManche,
    mise: bataille.mise,
    statut: bataille.statut,
    hoteId: bataille.hoteId,
    camps,
    vainqueurId: bataille.vainqueurId,
    creeeA: bataille.creeeA,
    resolueA: bataille.resolueA,
  };
}

/**
 * Les affrontements à montrer sur la page : ceux qui attendent, et les
 * derniers joués.
 */
export function tableauBatailles(db: Database, recentes = 12): BatailleVue[] {
  const attente = db.batailles
    .filter((b) => b.statut === 'ATTENTE')
    .sort((a, b) => b.creeeA.localeCompare(a.creeeA));
  const jouees = db.batailles
    .filter((b) => b.statut === 'TERMINEE')
    .sort((a, b) => (b.resolueA ?? '').localeCompare(a.resolueA ?? ''))
    .slice(0, recentes);
  return [...attente, ...jouees].map((b) => vueBataille(db, b));
}

/**
 * Les plus gros affrontements des sept derniers jours, classés sur le pot.
 *
 * Sept jours glissants, et non « depuis lundi » : un tableau qui se vide chaque
 * lundi matin n'a rien à montrer au moment où le plus de monde le regarde.
 */
export function topSemaine(db: Database, combien = 5): BatailleVue[] {
  const depuis = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return db.batailles
    .filter((b) => b.statut === 'TERMINEE' && b.resolueA !== null)
    .filter((b) => new Date(b.resolueA!).getTime() >= depuis)
    .sort((a, b) => b.mise - a.mise || (b.resolueA ?? '').localeCompare(a.resolueA ?? ''))
    .slice(0, combien)
    .map((b) => vueBataille(db, b));
}
