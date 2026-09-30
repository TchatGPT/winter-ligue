/**
 * L'aiguillage des pages de jeu : où envoyer une session avant de lui montrer
 * le classement, les boosters ou les duels.
 *
 * Fonction pure — elle ne lit ni cookie ni base, on lui donne ce qu'on sait.
 * `lib/auth/acces.ts` rassemble les faits et suit la destination.
 *
 * ## La session sans joueur
 *
 * La session de secours n'a aucun compte derrière elle : elle administre, elle
 * ne joue pas. Laissée sur une page de jeu, elle voit tout mais ne peut ni
 * miser, ni affronter le bot, ni ouvrir un booster — et rien ne dit pourquoi.
 * C'est arrivé : ouverte quand le site n'avait pas encore de base, elle a
 * survécu au branchement de la base et bloquait les duels.
 *
 * Dès que le site a une base qui dure, elle est donc renvoyée à la page de
 * connexion, qui lui ouvre l'administration. Sans base durable, elle reste la
 * seule session qui tienne, et passe.
 */

export type Destination = '/' | '/connexion' | '/bienvenue';

export interface FaitsSession {
  /** Une session valide existe. */
  connecte: boolean;
  /** Elle désigne un joueur — la session de secours n'en désigne aucun. */
  designeUnJoueur: boolean;
  /** Ce joueur existe encore en base. */
  compteTrouve: boolean;
  /** Son pseudo Activision est renseigné. */
  activision: boolean;
  /** Le site a une base qui dure (faux sur Vercel sans base). */
  baseDurable: boolean;
}

/** Où envoyer cette session, ou `null` si elle peut entrer. */
export function destination(faits: FaitsSession): Destination | null {
  if (!faits.connecte) return '/';

  if (!faits.designeUnJoueur) return faits.baseDurable ? '/connexion' : null;

  // Le compte n'existe plus (joueur supprimé, base vidée) : on renvoie se
  // reconnecter, plutôt que de faire tourner l'accueil et la bienvenue l'un
  // sur l'autre.
  if (!faits.compteTrouve) return '/connexion';

  // Sans pseudo Activision, la modération ne peut pas reconnaître le joueur
  // sur les captures : ses games ne seraient pas saisies.
  if (!faits.activision) return '/bienvenue';

  return null;
}
