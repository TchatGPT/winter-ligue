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
  return pseudo
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/#\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
