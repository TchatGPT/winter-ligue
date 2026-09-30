import 'server-only';

/**
 * Le mot de passe d'administration, tel que Vercel le donne. Deux façons de le
 * poser, au choix :
 *
 *  - `ADMIN_PASSWORD` : le mot de passe lui-même, en variable de type *Secret*.
 *    Le plus simple — rien à générer, rien à copier. Pas moins sûr que le
 *    reste : `AUTH_SECRET` et le mot de passe de la base vivent au même endroit,
 *    et qui les lirait aurait déjà la main sur tout.
 *  - `ADMIN_PASSWORD_HASH` : son empreinte scrypt (`npm run hash-password`), pour
 *    ne jamais stocker le mot de passe lui-même.
 *
 * Les deux peuvent coexister ; chacune ouvre la porte.
 *
 * ## `ADMIN_PASSWORD_HASH` se lit avec indulgence
 *
 * Elle a été collée de toutes les façons : la ligne entière avec son nom, entre
 * guillemets, toute la sortie du script, ou le mot de passe lui-même — et un
 * mot de passe juste recevait « incorrect », sans rien dire de la cause. On y
 * cherche donc une empreinte, où qu'elle soit ; s'il n'y en a pas et que la
 * valeur n'en a pas même l'air, c'est le mot de passe lui-même. Seule une
 * empreinte tronquée reste « mal formée » : on ne devine pas ce qui manque.
 */

/** Une empreinte complète, où qu'elle soit dans la valeur. */
const JETON = /scrypt:[0-9a-f]+:[0-9a-f]{64,}/i;

type LectureHash = { empreinte: string } | { clair: string } | { malFormee: true } | null;

function lisVariableHash(): LectureHash {
  const brut = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!brut) return null;
  const jeton = brut.match(JETON)?.[0];
  if (jeton) return { empreinte: jeton };
  const valeur = brut
    .replace(/^ADMIN_PASSWORD_HASH\s*=\s*/, '')
    .trim()
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
  if (!valeur) return null;
  if (/^scrypt/i.test(valeur)) return { malFormee: true };
  return { clair: valeur };
}

/** Le mot de passe posé en clair — `ADMIN_PASSWORD`, sinon une valeur de `ADMIN_PASSWORD_HASH` qui n'est pas une empreinte. */
export function motDePasseEnClair(): string | null {
  const direct = process.env.ADMIN_PASSWORD?.trim();
  if (direct) return direct;
  const lu = lisVariableHash();
  return lu && 'clair' in lu ? lu.clair : null;
}

/** L'empreinte posée, reprise même collée de travers, ou null. */
export function empreinteAdmin(): string | null {
  const lu = lisVariableHash();
  return lu && 'empreinte' in lu ? lu.empreinte : null;
}

/** L'empreinte a-t-elle la forme `scrypt:<sel>:<clé>` que produit `npm run hash-password` ? */
export function empreinteBienFormee(empreinte: string): boolean {
  return /^scrypt:[^:\s]+:[0-9a-f]{64,}$/i.test(empreinte);
}

/** L'état de la porte : pas posée, posée de travers, ou prête. */
export function etatMotDePasse(): 'absent' | 'mal-forme' | 'pret' {
  if (motDePasseEnClair() || empreinteAdmin()) return 'pret';
  const lu = lisVariableHash();
  return lu && 'malFormee' in lu ? 'mal-forme' : 'absent';
}
