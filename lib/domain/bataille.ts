/**
 * Le duel de flocons : une bataille de boules de neige.
 *
 * Module **pur** — aucune entrée-sortie, aucun accès base, et pas de hasard à
 * lui : on lui fournit la source de tirage, il dit comment le duel s'est joué.
 * C'est ce découpage qui rend la règle testable et vérifiable par n'importe
 * qui lisant `tests/`.
 *
 * ## La règle
 *
 * À chaque échange, les deux camps lancent une boule de neige, dont la
 * puissance est tirée entre 1 et 100. La plus forte gagne la manche. Une
 * égalité ne compte pour personne : on relance. Un duel se joue **en une
 * seule manche** : le premier lancer plus fort que l'autre gagne le duel, et
 * le pot. Le perdant perd toute sa mise.
 *
 * Des duels en 3 ou 5 manches ont existé ; `joueDuel` et `score` savent
 * encore les lire, pour que l'historique reste juste, mais on n'en crée plus.
 *
 * ## Pourquoi c'est juste
 *
 * Les deux camps tirent de la même façon, dans la même table, à la même
 * source : la règle est symétrique, chacun gagne une fois sur deux. Ni le
 * solde, ni le rôle, ni le fait d'avoir créé le duel ne pèsent. Les flocons
 * se risquent ici, ils ne s'y achètent pas d'avantage.
 */

/** Le seul format qu'on crée : une manche, un vainqueur. */
export const MANCHES_POSSIBLES = [1] as const;
export type Manches = (typeof MANCHES_POSSIBLES)[number];
export const MANCHES_MIN = 1;
export const MANCHES_MAX = 1;

/** La puissance maximale d'un lancer ; la minimale est 1. */
export const PUISSANCE_MAX = 100;

/**
 * Au-delà de ce nombre d'échanges, on tranche au hasard plutôt que de relancer
 * sans fin. Il faudrait des dizaines d'égalités d'affilée — une chance sur
 * cent chacune — pour l'atteindre : c'est un garde-fou, pas une règle.
 */
const ECHANGES_MAX = 60;

export interface Echange {
  /** La puissance du lancer de l'hôte, de 1 à 100. */
  hote: number;
  /** Celle de l'adversaire — le joueur qui a rejoint, ou le bot. */
  adversaire: number;
}

export type Camp = 'hote' | 'adversaire';

/** Qui gagne un échange ; `null` pour une égalité, qui se rejoue. */
export function gagnantEchange(e: Echange): Camp | null {
  if (e.hote > e.adversaire) return 'hote';
  if (e.adversaire > e.hote) return 'adversaire';
  return null;
}

/** Les manches qu'il faut gagner pour remporter le duel. */
export function manchesAGagner(manches: number): number {
  return Math.floor(manches / 2) + 1;
}

/** Le score, en manches gagnées, après une suite d'échanges. */
export function score(echanges: readonly Echange[]): Record<Camp, number> {
  const total: Record<Camp, number> = { hote: 0, adversaire: 0 };
  for (const e of echanges) {
    const g = gagnantEchange(e);
    if (g) total[g] += 1;
  }
  return total;
}

/**
 * Joue un duel jusqu'au bout.
 *
 * `lance` rend une puissance entière entre 1 et `PUISSANCE_MAX` ; le serveur y
 * branche son générateur cryptographique, les tests un générateur fixé.
 * `pile` tranche le cas extrême où les égalités s'enchaîneraient sans fin.
 */
export function joueDuel(
  manches: number,
  lance: () => number,
  pile: () => boolean = () => Math.random() < 0.5,
): { echanges: Echange[]; vainqueur: Camp } {
  const cible = manchesAGagner(manches);
  const echanges: Echange[] = [];
  const total: Record<Camp, number> = { hote: 0, adversaire: 0 };

  while (total.hote < cible && total.adversaire < cible) {
    if (echanges.length >= ECHANGES_MAX) {
      return { echanges, vainqueur: pile() ? 'hote' : 'adversaire' };
    }
    const e: Echange = { hote: lance(), adversaire: lance() };
    echanges.push(e);
    const g = gagnantEchange(e);
    if (g) total[g] += 1;
  }
  return { echanges, vainqueur: total.hote >= cible ? 'hote' : 'adversaire' };
}
