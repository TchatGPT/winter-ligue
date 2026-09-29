/**
 * La streameuse ne joue pas dans la ligue.
 *
 * Elle a un compte — c'est elle qui administre, et les captures de ses games
 * la montrent dans le tableau de son escouade — mais aucune game ne doit
 * jamais lui être attribuée, ni figurer au classement. On la reconnaît par sa
 * chaîne Twitch (`chaine`, en minuscules) : sur son pseudo Twitch, ou sur
 * l'identifiant de son profil.
 *
 * Fonction pure : la chaîne est fournie par l'appelant.
 */
export function estLaStreameuse(
  joueur: { twitchLogin: string | null; slug: string },
  chaine: string,
): boolean {
  const c = chaine.trim().toLowerCase();
  if (!c) return false;
  return joueur.twitchLogin?.toLowerCase() === c || joueur.slug.toLowerCase() === c;
}
