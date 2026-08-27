/**
 * Doublure de `server-only` pour les tests.
 *
 * Le vrai paquet lève à l'import : c'est tout son intérêt, il fait échouer le
 * build si un module serveur part dans un bundle client. Mais Vitest tourne
 * hors du contexte Next et déclencherait cette garde à chaque test touchant
 * `lib/services`. Cette doublure la neutralise pour les tests seuls — le build
 * de production, lui, utilise toujours le vrai paquet.
 */
export {};
