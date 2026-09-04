/**
 * La bande de leurres qui défile devant le repère.
 *
 * Module **pur**, comme `courbe.ts`, et testé avec lui. Il ne décide de rien :
 * la gagnante lui est donnée, il ne fabrique que le décor qui passe devant.
 *
 * ## Ce qui compte ici, et qui n'est pas évident
 *
 * Cette bande est de l'**affichage**. Le serveur a déjà tiré, débité et renvoyé
 * les cartes avant qu'une seule tuile n'existe — invariant n°1 de `AGENTS.md`.
 * Un joueur qui lirait le tableau dans la console n'y verrait rien qu'il ne
 * puisse déjà lire dans le catalogue des taux, affiché sous le sachet.
 *
 * Les leurres sont tirés aux **vrais taux du booster**, et non à des taux
 * gonflés. C'est le contraire de ce que font la plupart des sites du genre, qui
 * saupoudrent la bande de légendaires pour faire monter la tension. Deux raisons
 * de s'en abstenir : le joueur qui compte les anneaux dorés qui passent en tire
 * une idée fausse de ses chances, et il n'a aucun moyen de savoir qu'il se
 * trompe. Une bande honnête montre exactement à quoi ressemble le sachet.
 */

import { RANG_GAGNANT, RANG_JETON, RANG_RELANCE, TUILES, TUILES_RELANCE } from './courbe';

/** Le minimum qu'une tuile doit porter pour que la bande sache la placer. */
export interface TuileRail {
  cardId: string;
  rarity: string;
}

/** Aucun doublon à moins de trois cases : c'est ce qui se remarque à l'œil. */
const ECART_MINIMAL = 3;

/**
 * Construit la bande : `TUILES` cartes, la gagnante au rang `RANG_GAGNANT`.
 *
 * `hasard` est injectable pour que le test soit déterministe — et seulement pour
 * ça. En production c'est `Math.random`, ce qui suffit amplement : rien de ce qui
 * sort d'ici n'a de valeur, et un générateur cryptographique côté client
 * donnerait l'impression trompeuse que quelque chose se joue au navigateur.
 *
 * @param pioche  Les cartes qu'on peut montrer — le pool complet du booster.
 * @param gagnante La carte réellement tirée par le serveur.
 * @param poids   Les taux d'affichage du booster, sur 100 000.
 */
export interface OptionsBande<T> {
  /**
   * Le jeton Winter Spin, s'il doit apparaître.
   *
   * Semé en leurre dans toute bande, et **imposé** au rang du jeton quand le
   * serveur a fait rejouer cette colonne.
   */
  jeton?: T;
  /** Vrai quand cette colonne a été rejouée : la bande porte alors deux courses. */
  relance?: boolean;
}

/**
 * À quelle fréquence le jeton apparaît en leurre dans une bande.
 *
 * Une tuile sur vingt-cinq, soit une ou deux par bande. C'est **sans rapport
 * avec sa vraie probabilité**, qui est de 0,08 % par emplacement, et il faut le
 * dire : un appât qu'on ne voit jamais n'appâte personne, et le voir passer sans
 * s'arrêter dessus est précisément ce qui fait qu'on le reconnaît le jour où il
 * s'arrête.
 *
 * C'est le seul endroit du rail où l'affichage s'écarte des taux réels, et il ne
 * porte sur aucune carte : le jeton n'est pas une rareté, c'est un évènement, et
 * son taux est écrit dans `docs/SPEC.md` comme dans `rules.ts`.
 */
const FREQUENCE_JETON = 0.04;

export function construitBande<T extends TuileRail>(
  pioche: readonly T[],
  gagnante: T,
  poids: Readonly<Record<string, number>>,
  hasard: () => number = Math.random,
  options: OptionsBande<T> = {},
): T[] {
  const { jeton, relance = false } = options;
  const longueur = relance ? TUILES_RELANCE : TUILES;
  const rangGagnant = relance ? RANG_RELANCE : RANG_GAGNANT;

  if (pioche.length === 0) return Array.from({ length: longueur }, () => gagnante);

  /*
   * Les cartes rangées par rareté, et les raretés qu'on peut réellement servir.
   *
   * Une rareté dont le pool ne contient aucune carte doit sortir du tirage
   * plutôt que d'y rester à zéro : sans quoi son poids serait perdu et toutes
   * les autres seraient sous-représentées d'autant, sans que rien ne le signale.
   */
  const parRarete = new Map<string, T[]>();
  for (const carte of pioche) {
    const lot = parRarete.get(carte.rarity);
    if (lot) lot.push(carte);
    else parRarete.set(carte.rarity, [carte]);
  }

  const raretes = [...parRarete.keys()];
  const total = raretes.reduce((somme, r) => somme + Math.max(0, poids[r] ?? 0), 0);

  /** Une rareté au hasard, selon les taux — ou au hasard tout court s'ils sont muets. */
  const tireRarete = (): string => {
    if (total <= 0) return raretes[Math.floor(hasard() * raretes.length)];
    let reste = hasard() * total;
    for (const r of raretes) {
      reste -= Math.max(0, poids[r] ?? 0);
      if (reste < 0) return r;
    }
    return raretes[raretes.length - 1];
  };

  const bande: T[] = [];

  for (let i = 0; i < longueur; i += 1) {
    if (i === rangGagnant) {
      bande.push(gagnante);
      continue;
    }

    // Le jeton, imposé là où la première course s'arrête quand la colonne a été
    // rejouée. C'est le seul rang dont le contenu ne soit pas décoratif.
    if (relance && jeton && i === RANG_JETON) {
      bande.push(jeton);
      continue;
    }

    // Les voisines déjà connues : les trois précédentes, plus la gagnante quand
    // elle est sur le point d'arriver. Sans ce second terme, la carte gagnée
    // pourrait être précédée de son propre double, et l'arrêt se lirait mal.
    const recents = new Set(bande.slice(-ECART_MINIMAL).map((c) => c.cardId));
    if (i >= rangGagnant - ECART_MINIMAL && i < rangGagnant) recents.add(gagnante.cardId);

    /*
     * Le jeton en leurre.
     *
     * Jamais dans les trois cases qui précèdent un arrêt : un jeton qui frôle le
     * repère juste avant la carte gagnée ferait croire à une relance manquée, ce
     * qui est le contraire de l'effet voulu.
     */
    const proche =
      Math.abs(i - rangGagnant) <= ECART_MINIMAL ||
      (relance && Math.abs(i - RANG_JETON) <= ECART_MINIMAL);
    if (jeton && !proche && hasard() < FREQUENCE_JETON) {
      bande.push(jeton);
      continue;
    }

    const lot = parRarete.get(tireRarete()) ?? pioche;
    const libres = lot.filter((c) => !recents.has(c.cardId));
    const source = libres.length ? libres : lot;
    bande.push(source[Math.floor(hasard() * source.length)]);
  }

  return bande;
}

/**
 * L'identifiant du jeton Winter Spin dans une bande.
 *
 * Ce n'est pas une carte : il n'est pas au catalogue, ne se collectionne pas, ne
 * se revend pas et n'a aucun effet en jeu. C'est un rang de bande, que le rendu
 * reconnaît pour y peindre le logo au lieu d'un cadre.
 */
export const JETON_ID = 'winter-spin';
