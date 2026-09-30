/**
 * Les codes cadeaux : leur forme, et leur état.
 *
 * Fonctions pures. Un code se lit souvent sur le stream et se tape à la main :
 * on n'en garde que les lettres et les chiffres, sans accents, en majuscules —
 * « noël-26 » et « NOEL26 » sont le même code.
 */

/** L'alphabet des codes tirés au sort : ni 0 ni O, ni 1, I ou L, qui se confondent à l'écran. */
export const ALPHABET_CODES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Huit signes tirés au sort : près de mille milliards de codes, introuvables en devinant. */
export const LONGUEUR_CODE_TIRE = 8;

export const CODE_MIN = 4;
export const CODE_MAX = 24;

/** Le plus de joueurs qu'un même code peut servir. */
export const UTILISATIONS_MAX = 1000;

/** Le code tel qu'on le compare : majuscules, sans accents, sans espaces ni tirets. */
export function normaliseCode(brut: string): string {
  return brut
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Un code choisi par la modération : de quatre à vingt-quatre lettres ou chiffres. */
export function codeValide(code: string): boolean {
  return code.length >= CODE_MIN && code.length <= CODE_MAX && /^[A-Z0-9]+$/.test(code);
}

export type EtatCode = 'actif' | 'epuise' | 'desactive';

export function etatDuCode(code: { actif: boolean; utilisationsMax: number }, utilisations: number): EtatCode {
  if (!code.actif) return 'desactive';
  return utilisations >= code.utilisationsMax ? 'epuise' : 'actif';
}
