import 'server-only';

/**
 * L'empreinte du mot de passe d'administration, telle que Vercel la donne.
 *
 * Elle se colle facilement de travers : avec son nom devant
 * (`ADMIN_PASSWORD_HASH=scrypt:…`, la ligne entière que sort le script), ou
 * entre guillemets. On reprend l'empreinte seule — sans quoi la vérification
 * échouait avec un simple « Mot de passe incorrect », sans rien dire de la cause.
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
  const empreinte = empreinteAdmin();
  if (!empreinte) return 'absent';
  return empreinteBienFormee(empreinte) ? 'pret' : 'mal-forme';
}
