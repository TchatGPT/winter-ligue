import 'server-only';

import { cookies } from 'next/headers';
import { COOKIE_OPTIONS } from '@/lib/auth/jeton';

/**
 * Le mode visiteur (décidé le 16/11/2026) : depuis l'accueil, « Entrer en mode
 * visiteur » laisse voir la ligue sans compte — le classement, les boosters,
 * les duels, les fiches des joueurs, les règles —, sans rien pouvoir y faire.
 *
 * Ce cookie n'est **pas** une session : il ne désigne personne, ne porte aucun
 * rôle et n'ouvre aucune route qui écrit. Il ne fait que dire aux pages de
 * lecture de s'afficher au lieu de renvoyer à l'accueil. Le forger ne donne
 * donc rien de plus que le bouton.
 */
export const VISITEUR_COOKIE = 'wl_visiteur';

/** Trente jours, comme une session : on revient en visiteur sans repasser par l'accueil. */
const VISITEUR_MAX_AGE = 30 * 24 * 60 * 60;

/** Le visiteur a choisi d'entrer sans compte. Une session, elle, prime toujours. */
export async function estVisiteur(): Promise<boolean> {
  return (await cookies()).get(VISITEUR_COOKIE)?.value === '1';
}

export async function ouvreModeVisiteur(): Promise<void> {
  (await cookies()).set(VISITEUR_COOKIE, '1', { ...COOKIE_OPTIONS, maxAge: VISITEUR_MAX_AGE });
}

export async function fermeModeVisiteur(): Promise<void> {
  (await cookies()).set(VISITEUR_COOKIE, '', { ...COOKIE_OPTIONS, maxAge: 0 });
}
