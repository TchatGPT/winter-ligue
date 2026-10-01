import 'server-only';

/**
 * La chaîne de la ligue est-elle en direct ?
 *
 * Twitch est interrogé au plus une fois par minute et par instance du serveur,
 * quel que soit le nombre de visiteurs : la réponse est gardée en mémoire. Si
 * Twitch se tait — pas configuré, jeton refusé, réseau lent —, on ne sait pas,
 * et on le dit (null) plutôt que d'annoncer « hors ligne » à tort.
 *
 * Rien de ce qui compte n'en dépend : c'est une indication pour les joueurs,
 * avec un lien vers la chaîne.
 */

import { chaineDeLaLigue, isTwitchEnabled } from '@/lib/auth/twitch';
import { entetes, jetonApplication, oublieJeton } from './twitchApp';

const STREAMS_URL = 'https://api.twitch.tv/helix/streams';

/** Une minute : assez frais pour un début de live, assez rare pour Twitch. */
const DUREE_MEMOIRE = 60_000;

export interface EtatDirect {
  enDirect: boolean;
  /** Le nom affiché de la chaîne (« Lriaa »). */
  nom: string;
  /** Le titre du live, s'il y en a un. */
  titre: string | null;
  jeu: string | null;
  spectateurs: number | null;
}

let memoire: { etat: EtatDirect; jusqua: number } | null = null;

/** Le login de la chaîne, une capitale en tête : « lriaa » devient « Lriaa ». */
export function nomDeLaChaine(login: string): string {
  return login.charAt(0).toUpperCase() + login.slice(1);
}

export async function etatDuDirect(): Promise<EtatDirect | null> {
  if (memoire && memoire.jusqua > Date.now()) return memoire.etat;
  if (!isTwitchEnabled()) return null;
  const chaine = chaineDeLaLigue();
  try {
    const jeton = await jetonApplication();
    if (!jeton) return null;
    const reponse = await fetch(`${STREAMS_URL}?user_login=${encodeURIComponent(chaine)}`, {
      headers: entetes(jeton),
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (reponse.status === 401) oublieJeton();
    if (!reponse.ok) return null;
    const charge = (await reponse.json()) as {
      data?: { type?: string; user_name?: string; title?: string; game_name?: string; viewer_count?: number }[];
    };
    const flux = (charge.data ?? []).find((f) => f.type === 'live');
    const etat: EtatDirect = {
      enDirect: flux !== undefined,
      nom: flux?.user_name || nomDeLaChaine(chaine),
      titre: flux?.title || null,
      jeu: flux?.game_name || null,
      spectateurs: typeof flux?.viewer_count === 'number' ? flux.viewer_count : null,
    };
    memoire = { etat, jusqua: Date.now() + DUREE_MEMOIRE };
    return etat;
  } catch {
    return null;
  }
}
