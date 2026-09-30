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
 */

/** Le mot de passe posé en clair (variable Secret), s'il l'est. */
export function motDePasseEnClair(): string | null {
  const valeur = process.env.ADMIN_PASSWORD?.trim();
  return valeur ? valeur : null;
}

/**
 * L'empreinte, reprise même collée de travers : avec son nom devant
 * (`ADMIN_PASSWORD_HASH=scrypt:…`, la ligne entière d'une ancienne version du
 * script), ou entre guillemets.
 */
export function empreinteAdmin(): string | null {
  const brut = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!brut) return null;
  const sansNom = brut.replace(/^ADMIN_PASSWORD_HASH\s*=\s*/, '').trim();
  const sansGuillemets = sansNom.replace(/^(["'])(.*)\1$/, '$2').trim();
  return sansGuillemets || null;
}

/** L'empreinte a-t-elle la forme `scrypt:<sel>:<clé>` que produit `npm run hash-password` ? */
export function empreinteBienFormee(empreinte: string): boolean {
  return /^scrypt:[^:\s]+:[0-9a-f]{64,}$/i.test(empreinte);
}

/** L'état de la porte : pas posée, posée de travers, ou prête. */
export function etatMotDePasse(): 'absent' | 'mal-forme' | 'pret' {
  if (motDePasseEnClair()) return 'pret';
  const empreinte = empreinteAdmin();
  if (!empreinte) return 'absent';
  return empreinteBienFormee(empreinte) ? 'pret' : 'mal-forme';
}
