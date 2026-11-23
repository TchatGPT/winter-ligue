/**
 * Les kills d'une ligne de capture de fin de game (23/11/2026).
 *
 * Le modèle recopie les en-têtes des colonnes et les nombres de chaque ligne,
 * tels qu'ils sont, dans l'ordre ; c'est ici que se décide ce qui compte, et
 * non par le modèle, qui confondait ÉLIM./ASSIST. et ÉLIM. Les kills valent
 * ÉLIM./ASSIST. moins ASSIST. — ce qui redonne ÉLIM. — ; la colonne ÉLIM., lue
 * à part, sert de contrôle : si les deux ne tombent pas pareil, un chiffre a
 * été mal lu, et l'écran de saisie le dit.
 */

export type GenreColonne = 'score' | 'elimAssist' | 'elim' | 'assist' | 'autre';

/** « ÉLIM./ASSIST. » → « ELIM/ASSIST » : sans accents, sans points ni espaces. */
function normalise(entete: string): string {
  return entete
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z/]/g, '');
}

/** Ce que dit un en-tête de colonne, en français comme en anglais. */
export function genreColonne(entete: string): GenreColonne {
  const n = normalise(entete);
  const elim = n.includes('ELIM') || n.includes('KILL');
  const assist = n.includes('ASSIST');
  if (elim && (assist || n.includes('/'))) return 'elimAssist';
  if (elim) return 'elim';
  if (assist) return 'assist';
  if (n.includes('SCORE')) return 'score';
  return 'autre';
}

export interface KillsLus {
  /** Les kills retenus : ÉLIM./ASSIST. − ASSIST., sinon ÉLIM., sinon la lecture du modèle. */
  kills: number | null;
  /** La colonne ÉLIM., lue à part : le contrôle. */
  elim: number | null;
  elimAssist: number | null;
  assists: number | null;
  /** ÉLIM./ASSIST. − ASSIST., quand les deux colonnes sont là. */
  attendu: number | null;
}

/**
 * Les kills d'une ligne, d'après les en-têtes et les nombres lus. `repli` est
 * la lecture du modèle, quand la capture n'a pas de colonnes reconnaissables.
 */
export function killsDeLaLigne(
  entetes: readonly string[],
  valeurs: readonly (number | null)[],
  repli: number | null = null,
): KillsLus {
  const colonne = (genre: GenreColonne): number | null => {
    const i = entetes.findIndex((e) => genreColonne(e) === genre);
    if (i < 0 || entetes.length !== valeurs.length) return null;
    const v = valeurs[i];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  };
  const elim = colonne('elim');
  const elimAssist = colonne('elimAssist');
  const assists = colonne('assist');
  const attendu = elimAssist !== null && assists !== null && elimAssist >= assists ? elimAssist - assists : null;
  return { kills: attendu ?? elim ?? repli, elim, elimAssist, assists, attendu };
}
