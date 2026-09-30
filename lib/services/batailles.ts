import 'server-only';

/**
 * Les affrontements.
 *
 * Deux camps misent la même somme de flocons et s'affrontent en une bataille
 * de boules de neige (`lib/domain/bataille.ts`) : manche par manche, le lancer
 * le plus fort l'emporte, et le premier à la majorité des manches **remporte
 * le pot** — les deux mises réunies.
 *
 * ## Ce qui n'est jamais laissé au client
 *
 * Le tirage, la comparaison, le versement. Le navigateur reçoit le résultat
 * complet une fois qu'il est acquis et ne fait que le mettre en scène : rejouer
 * la requête, recharger la page ou fermer l'onglet ne change pas une carte.
 *
 * ## Joueur contre joueur
 *
 * Un duel se joue entre deux joueurs : l'un le lance, un autre le relève. Il
 * n'y a plus de bot — un duel sans adversaire attend, ou s'annule. Les lancers
 * viennent de la même source pour les deux camps : une fois sur deux on perd sa
 * mise, une fois sur deux on rafle le pot. C'est le seul endroit où les
 * flocons se risquent.
 */

import { CAMP_BOT, type Bataille, type Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import {
  type Echange,
  joueDuel,
  MANCHES_POSSIBLES,
  PUISSANCE_MAX,
  score,
} from '@/lib/domain/bataille';
import { secureInt } from '@/lib/domain/rng';
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
      | 'TA_PROPRE_BATAILLE'
      | 'TROP_EN_ATTENTE',
  ) {
    super(message);
    this.name = 'BatailleError';
  }
}

/**
 * Crée un affrontement et met l'hôte à l'enjeu. À appeler dans une transaction.
 *
 * La mise est **débitée tout de suite**, avant que quiconque ne rejoigne. C'est
 * ce qui rend le lobby honnête : un affrontement affiché est un affrontement
 * dont l'hôte a déjà payé, et personne ne rejoint une mise qui n'existe pas.
 */
/** Les duels que ce joueur a lancés et qui attendent encore un adversaire. */
export function duelsEnAttente(db: Database, hoteId: string): number {
  return db.batailles.filter((b) => b.hoteId === hoteId && b.statut === 'ATTENTE').length;
}

/**
 * Lève si ce joueur a déjà `DUEL.enAttenteMax` duels en attente : chacun est
 * annoncé sur le stream.
 */
export function verifieAttente(db: Database, hoteId: string): void {
  if (duelsEnAttente(db, hoteId) >= DUEL.enAttenteMax) {
    throw new BatailleError(
      `Tu as déjà ${DUEL.enAttenteMax} duels en attente : attends qu’on les relève, ou annules-en un.`,
      'TROP_EN_ATTENTE',
    );
  }
}

export function creeBataille(db: Database, hoteId: string, mise: number, manches: number): Bataille {
  if (!(MANCHES_POSSIBLES as readonly number[]).includes(manches)) {
    throw new BatailleError('Un duel se joue en une seule manche.', 'MANCHES_INVALIDES');
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
    echanges: [],
    vainqueurId: null,
    creeeA: new Date().toISOString(),
    resolueA: null,
  };
  db.batailles.push(bataille);
  return bataille;
}

/**
 * Résout un duel : la bataille de boules de neige se joue, le vainqueur prend
 * le pot.
 *
 * Chaque lancer vient du générateur cryptographique du serveur : `Math.random`
 * n'a rien à faire dans une décision qui verse des flocons.
 */
function resout(db: Database, bataille: Bataille): Bataille {
  const { echanges, vainqueur } = joueDuel(
    bataille.manches,
    () => secureInt(PUISSANCE_MAX) + 1,
    () => secureInt(2) === 0,
  );

  bataille.echanges = echanges;
  bataille.vainqueurId = vainqueur === 'hote' ? bataille.hoteId : bataille.adversaireId!;
  bataille.statut = 'TERMINEE';
  bataille.resolueA = new Date().toISOString();

  credit(db, bataille.vainqueurId, bataille.mise * 2, 'GAIN_BATAILLE', bataille.id);

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
      'On ne rejoint pas son propre duel : il attend qu’un autre joueur le relève.',
      'TA_PROPRE_BATAILLE',
    );
  }

  debit(db, joueurId, bataille.mise, 'MISE_BATAILLE', bataille.id);
  bataille.adversaireId = joueurId;
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
  /** L'identifiant du camp : celui d'un joueur, ou `BOT` dans les duels d'avant son retrait. */
  id: string;
  pseudo: string;
  bot: boolean;
  /** Les manches gagnées. */
  manches: number;
}

export interface BatailleVue {
  id: string;
  /** Le format : 1, 3 ou 5 manches. */
  manches: number;
  mise: number;
  statut: Bataille['statut'];
  hoteId: string;
  /** L'hôte d'abord, puis l'adversaire s'il y en a un. */
  camps: CampVue[];
  /** Les lancers, échange par échange, pour rejouer le duel à l'écran. */
  echanges: Echange[];
  /** Vrai pour un duel d'avant le duel de flocons, joué aux cartes. */
  ancien: boolean;
  vainqueurId: string | null;
  creeeA: string;
  resolueA: string | null;
}

/**
 * Ce qu'un duel montre au navigateur.
 *
 * Tout y est déjà décidé : chaque lancer, le score, le vainqueur. Renvoyer les
 * lancers plutôt que le seul verdict est délibéré — c'est ce qui permet de
 * rejouer le duel, et ce qui le rend vérifiable à l'œil par les deux joueurs.
 */
export function vueBataille(db: Database, bataille: Bataille): BatailleVue {
  const nomDe = (id: string): string => {
    if (id === CAMP_BOT) return 'Le Bot';
    return db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
  };
  const echanges = bataille.echanges ?? [];
  const ancien = echanges.length === 0 && bataille.tirages.length > 0;
  const points = score(echanges);

  const camps: CampVue[] = [
    { id: bataille.hoteId, pseudo: nomDe(bataille.hoteId), bot: false, manches: points.hote },
  ];
  if (bataille.adversaireId) {
    camps.push({
      id: bataille.adversaireId,
      pseudo: nomDe(bataille.adversaireId),
      bot: bataille.adversaireId === CAMP_BOT,
      manches: points.adversaire,
    });
  }
  // Un ancien duel n'a que les scores de ses cartes : on les reprend, pour
  // que la ligne dise encore qui a gagné et de combien.
  if (ancien) {
    for (const camp of camps) camp.manches = bataille.tirages.find((t) => t.camp === camp.id)?.score ?? 0;
  }

  return {
    id: bataille.id,
    manches: bataille.manches,
    mise: bataille.mise,
    statut: bataille.statut,
    hoteId: bataille.hoteId,
    camps,
    echanges,
    ancien,
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
