import 'server-only';

/**
 * Le cadeau du jour : un clic par jour, quelques flocons, et une série qui
 * grandit — quarante flocons, deux cents le septième jour d'affilée.
 *
 * Tout se décide ici : le jour (à Paris), la série, le montant, le droit d'y
 * prétendre. Le navigateur n'envoie rien d'autre que « je le prends ». Chaque
 * cadeau est un `credit()` au grand livre, le jour en référence : c'est le
 * grand livre qui prouve qu'on ne l'a pris qu'une fois.
 */

import type { Database } from '@/lib/db/entities';
import { jourDeParis, jourDuCycle, montantDuJour, serieDuJour } from '@/lib/domain/cadeauDuJour';
import { CADEAU_DU_JOUR } from '@/lib/domain/rules';
import { credit } from './ledger';
import { gamesOf } from './league';

export class CadeauError extends Error {
  constructor(
    message: string,
    readonly code: 'DEJA_PRIS' | 'PAS_ENCORE_JOUE' | 'JOUEUR_INTROUVABLE',
  ) {
    super(message);
    this.name = 'CadeauError';
  }
}

export interface EtatCadeau {
  /** Il y a droit : au moins une game saisie. */
  eligible: boolean;
  /** Il l'a déjà pris aujourd'hui. */
  dejaPris: boolean;
  /** La série s'il le prend aujourd'hui — ou celle du jour, s'il l'a pris. */
  serie: number;
  /** Le rang du jour dans la semaine, de 1 à 7. */
  jour: number;
  /** Ce que vaut le cadeau du jour. */
  montant: number;
}

/** Où en est un joueur, pour le bouton du menu. */
export function etatCadeau(db: Readonly<Database>, joueurId: string, now = new Date()): EtatCadeau | null {
  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  if (!joueur) return null;
  const aujourdhui = jourDeParis(now);
  const dejaPris = joueur.cadeauDernier === aujourdhui;
  const serie = dejaPris
    ? Math.max(1, joueur.cadeauSerie ?? 1)
    : serieDuJour(joueur.cadeauDernier ?? null, joueur.cadeauSerie ?? 0, aujourdhui);
  return {
    eligible: gamesOf(db as Database, joueurId).some((g) => !g.skipped),
    dejaPris,
    serie,
    jour: jourDuCycle(serie),
    montant: montantDuJour(serie),
  };
}

/**
 * Prend le cadeau du jour. À appeler dans une transaction.
 *
 * Une fois par jour, à Paris ; seulement avec au moins une game saisie. Le solde
 * reste plafonné : ce qui dépasserait est perdu, et `recu` le dit.
 */
export function prendsCadeauDuJour(
  db: Database,
  joueurId: string,
  now = new Date(),
): { montant: number; recu: number; serie: number; jour: number; cycle: number } {
  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  if (!joueur) throw new CadeauError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
  const etat = etatCadeau(db, joueurId, now)!;
  if (etat.dejaPris) throw new CadeauError('Tu as déjà pris ton cadeau aujourd’hui : reviens demain.', 'DEJA_PRIS');
  if (!etat.eligible) {
    throw new CadeauError('Le cadeau du jour s’ouvre après ta première game dans la ligue.', 'PAS_ENCORE_JOUE');
  }

  const aujourdhui = jourDeParis(now);
  const avant = joueur.snowflakes;
  credit(db, joueurId, etat.montant, 'CADEAU_DU_JOUR', aujourdhui);
  joueur.cadeauDernier = aujourdhui;
  joueur.cadeauSerie = etat.serie;
  return {
    montant: etat.montant,
    recu: joueur.snowflakes - avant,
    serie: etat.serie,
    jour: etat.jour,
    cycle: CADEAU_DU_JOUR.cycle,
  };
}
