/**
 * Ce qu'un pseudo Warzone (identifiant Activision) peut contenir : lettres,
 * chiffres, `_ - .` et espace, puis le suffixe `#chiffres`, facultatif. Le
 * même motif sert au serveur (`activisionId`, `lib/api/schemas.ts`) et à la
 * fenêtre d'inscription, pour prévenir avant d'envoyer.
 */
export const MOTIF_ACTIVISION = /^[\p{L}\p{N}_\-. ]+(#\d{2,10})?$/u;

/** Les bornes de sa longueur, après avoir retiré les espaces autour. */
export const LONGUEUR_ACTIVISION = { min: 2, max: 40 } as const;

/**
 * La forme sous laquelle deux pseudos Activision se comparent.
 *
 * La lecture des captures compare le nom affiché au tableau de fin de game,
 * sans son suffixe numérique : « Givre#1234567 » et « givre » y sont le même
 * joueur. Deux comptes ne peuvent donc pas revendiquer le même nom — sinon
 * l'un se ferait attribuer les games de l'autre.
 *
 * On retire le suffixe, les accents, la casse et les espaces en trop.
 */
export function cleActivision(pseudo: string): string {
  return pseudo.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/#\d+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Ce pseudo est-il déjà celui d'un autre joueur ? */
export function activisionPris(
  pseudo: string,
  joueurs: readonly { id: string; activisionId: string | null }[],
  sauf: string | null,
): boolean {
  const cle = cleActivision(pseudo);
  return joueurs.some((j) => j.id !== sauf && j.activisionId !== null && cleActivision(j.activisionId) === cle);
}
