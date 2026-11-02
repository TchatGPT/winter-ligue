import 'server-only';

/**
 * Le cadeau du jour : un clic par jour, quelques flocons, et une série qui
 * grandit — quarante flocons, et le septième jour d'affilée un Booster Perso.
 *
 * Tout se décide ici : le jour (à Paris), la série, le montant, le droit d'y
 * prétendre. Le navigateur n'envoie rien d'autre que « je le prends ». Un jour
 * de flocons est un `credit()` au grand livre, le jour en référence ; le jour
 * du booster le met en file, le jour dans sa raison. Le jour pris
 * (`cadeauDernier`) s'écrit dans la même transaction : un seul par jour.
 */

import type { Database } from '@/lib/db/entities';
import { boosterDuJour, jourDeParis, jourDuCycle, montantDuJour, serieDuJour } from '@/lib/domain/cadeauDuJour';
import { CADEAU_DU_JOUR, ECONOMY } from '@/lib/domain/rules';
import { credit } from './ledger';
import { gamesOf } from './league';
import { ajoutePackDu } from './packs';

export class CadeauError extends Error {
  constructor(
    message: string,
    readonly code: 'DEJA_PRIS' | 'PAS_ENCORE_JOUE' | 'JOUEUR_INTROUVABLE' | 'SOLDE_PLEIN',
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
  /**
   * Son solde est plein (`ECONOMY.soldeMax`) : le cadeau en flocons est fermé
   * jusqu'à ce qu'il repasse dessous, s'il y repasse — décidé par
   * l'organisation le 13/10/2026. Le jour du booster reste ouvert : un booster
   * lui sert encore.
   */
  plein: boolean;
  /** La série s'il le prend aujourd'hui — ou celle du jour, s'il l'a pris. */
  serie: number;
  /** Le rang du jour dans la semaine, de 1 à 7. */
  jour: number;
  /** Les flocons du cadeau du jour : zéro le jour du booster. */
  montant: number;
  /** Le cadeau du jour est un Booster Perso — le septième jour d'affilée. */
  booster: boolean;
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
  const booster = boosterDuJour(serie);
  return {
    eligible: gamesOf(db as Database, joueurId).some((g) => !g.skipped),
    dejaPris,
    plein: !booster && joueur.snowflakes >= ECONOMY.soldeMax,
    serie,
    jour: jourDuCycle(serie),
    montant: montantDuJour(serie),
    booster,
  };
}

/**
 * Prend le cadeau du jour. À appeler dans une transaction.
 *
 * Une fois par jour, à Paris ; seulement avec au moins une game saisie. Le solde
 * reste plafonné : ce qui dépasserait est perdu, et `recu` le dit. Le jour du
 * booster, rien au grand livre : un Booster Perso en file, à ouvrir comme ceux
 * des subs.
 */
export function prendsCadeauDuJour(
  db: Database,
  joueurId: string,
  now = new Date(),
): { montant: number; recu: number; booster: boolean; serie: number; jour: number; cycle: number } {
  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  if (!joueur) throw new CadeauError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
  const etat = etatCadeau(db, joueurId, now)!;
  if (etat.dejaPris) throw new CadeauError('Tu as déjà pris ton cadeau aujourd’hui : reviens demain.', 'DEJA_PRIS');
  if (!etat.eligible) {
    throw new CadeauError('Le cadeau du jour s’ouvre après ta première game dans la ligue.', 'PAS_ENCORE_JOUE');
  }
  if (etat.plein) {
    throw new CadeauError(
      `Ton solde est plein (${ECONOMY.soldeMax.toLocaleString('fr-FR')} ❄) : ta chance est au maximum, le cadeau du jour ne t’apporterait rien.`,
      'SOLDE_PLEIN',
    );
  }

  const aujourdhui = jourDeParis(now);
  const avant = joueur.snowflakes;
  if (etat.booster) {
    ajoutePackDu(db, 'perso', joueurId, `cadeau du jour du ${aujourdhui}, ${etat.serie}ᵉ jour d’affilée`);
  } else {
    credit(db, joueurId, etat.montant, 'CADEAU_DU_JOUR', aujourdhui);
  }
  joueur.cadeauDernier = aujourdhui;
  joueur.cadeauSerie = etat.serie;
  return {
    montant: etat.montant,
    recu: joueur.snowflakes - avant,
    booster: etat.booster,
    serie: etat.serie,
    jour: etat.jour,
    cycle: CADEAU_DU_JOUR.cycle,
  };
}
