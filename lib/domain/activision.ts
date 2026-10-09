/**
 * Les bornes d'un pseudo en jeu (Warzone, identifiant Activision), une fois
 * retirés ses caractères invisibles (`sansInvisibles`). Tout caractère visible
 * est accepté — symboles, katakana… — : c'est le pseudo tel qu'il s'affiche
 * en jeu, au caractère près, que la modération cherche sur les captures. Le
 * serveur (`activisionId`, `lib/api/schemas.ts`) et la fenêtre d'inscription
 * lisent les mêmes bornes.
 */
export const LONGUEUR_ACTIVISION = { min: 1, max: 60 } as const;

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
