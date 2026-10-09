/**
 * L'aiguillage des pages de jeu : où envoyer une session avant de lui montrer
 * le classement, les boosters ou les duels.
 *
 * Fonction pure — elle ne lit ni cookie ni base, on lui donne ce qu'on sait.
 * `lib/auth/acces.ts` rassemble les faits et suit la destination.
 *
 * Toute session désigne un joueur : la session « de secours », sans compte
 * derrière, a disparu avec l'entrée par mot de passe.
 */

export type Destination = '/' | '/connexion';

export interface FaitsSession {
  /** Une session valide existe. */
  connecte: boolean;
  /** Son joueur existe encore en base. */
  compteTrouve: boolean;
}

/** Où envoyer cette session, ou `null` si elle peut entrer. */
export function destination(faits: FaitsSession): Destination | null {
  if (!faits.connecte) return '/';

  // Le compte n'existe plus (joueur supprimé, base vidée) : on renvoie se
  // reconnecter.
  if (!faits.compteTrouve) return '/connexion';

  // Sans pseudo Warzone, on entre quand même : la fenêtre d'inscription
  // (`InscriptionWarzone`, posée par la mise en page) le demande par-dessus
  // la page, avant tout le reste.
  return null;
}
