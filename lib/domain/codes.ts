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

/**
 * Le message qui annonce un code dans le tchat : court, et tout ce qu'il faut
 * pour s'en servir. Composé ici, à partir du code lui-même — jamais d'un texte
 * venu de l'écran.
 */
export function annonceDuCode(
  code: { code: string; montant: number; utilisationsMax: number },
  site: string,
): string {
  const qui = code.utilisationsMax === 1 ? 'pour le premier' : `pour les ${code.utilisationsMax} premiers`;
  return `🎁 Code cadeau : ${code.code} — ${code.montant} ❄ ${qui} ! À taper sur ${site}, derrière le cadeau près de ton solde.`;
}

export type EtatCode = 'actif' | 'epuise' | 'desactive';

export function etatDuCode(code: { actif: boolean; utilisationsMax: number }, utilisations: number): EtatCode {
  if (!code.actif) return 'desactive';
  return utilisations >= code.utilisationsMax ? 'epuise' : 'actif';
}
