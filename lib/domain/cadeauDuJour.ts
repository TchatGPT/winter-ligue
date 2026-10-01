/**
 * Le cadeau du jour, en fonctions pures : quel jour il est à Paris, où en est
 * la série, et combien le cadeau vaut. Le crédit, la base et la route vivent
 * ailleurs (`lib/services/cadeauDuJour.ts`, `app/api/cadeau-du-jour/route.ts`).
 *
 * La journée change à minuit, heure de Paris — celle du stream —, et non à
 * minuit UTC, qui tombe à une ou deux heures du matin chez les joueurs.
 */

import { CADEAU_DU_JOUR } from './rules';

/** Le jour d'une date à Paris, en « AAAA-MM-JJ ». */
export function jourDeParis(date: Date): string {
  // `en-CA` écrit les dates en AAAA-MM-JJ.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** La veille d'un jour « AAAA-MM-JJ ». */
export function veille(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j - 1)).toISOString().slice(0, 10);
}

/**
 * La série si l'on prend le cadeau aujourd'hui : un de plus si le dernier a été
 * pris la veille, un sinon — un jour manqué la fait repartir.
 */
export function serieDuJour(dernier: string | null, serie: number, aujourdhui: string): number {
  return dernier !== null && dernier === veille(aujourdhui) ? Math.max(0, serie) + 1 : 1;
}

/** Ce que vaut le cadeau au jour `serie` de la série : le septième vaut plus. */
export function montantDuJour(serie: number): number {
  return serie > 0 && serie % CADEAU_DU_JOUR.cycle === 0 ? CADEAU_DU_JOUR.septiemeJour : CADEAU_DU_JOUR.parJour;
}

/** Le rang dans la semaine en cours, de 1 à 7. */
export function jourDuCycle(serie: number): number {
  return ((Math.max(1, serie) - 1) % CADEAU_DU_JOUR.cycle) + 1;
}
