/**
 * Les auteurs du journal qui ne sont pas des joueurs, en clair.
 *
 * Le journal inscrit l'identifiant de qui agit : celui d'un joueur la plupart
 * du temps, qu'on affiche par son pseudo, et sinon l'un de ceux-ci.
 */
export const ACTEURS_SYSTEME: Readonly<Record<string, string>> = {
  // Les entrées d'avant le retrait de la connexion par mot de passe.
  admin: 'Session de secours',
  twitch: 'Twitch',
  systeme: 'Système',
};
