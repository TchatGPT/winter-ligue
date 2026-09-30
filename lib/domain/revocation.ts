/**
 * Une session est-elle encore bonne ? Fonction pure : on lui donne le jeton
 * (déjà vérifié : signature et expiration) et ce que la base dit du joueur.
 *
 * - un joueur disparu ou désactivé n'a plus de session ;
 * - un jeton émis avant la dernière déconnexion est révoqué ;
 * - le rôle est celui de la base, jamais celui du jeton : une promotion ou
 *   une rétrogradation vaut dès la requête suivante.
 *
 * `lib/auth/session.ts` rassemble les faits ; `tests/revocation.test.ts`
 * verrouille la décision.
 */

export type RoleCompte = 'joueur' | 'admin';

export interface EtatCompte {
  role: RoleCompte;
  actif: boolean;
  /** Date ISO de la dernière déconnexion, ou null. */
  sessionsDepuis: string | null;
}

/** Le rôle qui vaut pour ce jeton, ou null s'il ne vaut plus rien. */
export function roleConfirme(jeton: { iat: number }, etat: EtatCompte | null): RoleCompte | null {
  if (!etat || !etat.actif) return null;
  if (etat.sessionsDepuis) {
    const depuis = Math.floor(Date.parse(etat.sessionsDepuis) / 1000);
    // Une date illisible révoque : dans le doute, on refuse.
    if (!Number.isFinite(depuis) || jeton.iat < depuis) return null;
  }
  return etat.role;
}
