import 'server-only';

/**
 * Écrire dans le tchat de la chaîne — pour annoncer un code cadeau.
 *
 * Le message part au nom de la chaîne, avec le jeton de l'application : le
 * site ne garde aucun jeton de personne. Twitch l'accepte si la streameuse a
 * autorisé l'application à écrire pour elle (`user:write:chat`, `user:bot`) et dans son tchat
 * (`channel:bot`) — c'est le branchement, depuis Modération → Saison.
 *
 * Le texte est composé par le serveur (`annonceDuCode`), jamais repris d'une
 * requête : personne ne fait écrire à la chaîne ce qu'il veut.
 */

import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { entetes, jetonApplication, oublieJeton } from './twitchApp';

const USERS_URL = 'https://api.twitch.tv/helix/users';
const CHAT_URL = 'https://api.twitch.tv/helix/chat/messages';

let idEnCache: { chaine: string; id: string } | null = null;

/** L'identifiant Twitch de la chaîne de la ligue, gardé en mémoire. */
async function idDeLaChaine(jeton: string): Promise<string | null> {
  const chaine = chaineDeLaLigue();
  if (idEnCache?.chaine === chaine) return idEnCache.id;
  const reponse = await fetch(`${USERS_URL}?login=${encodeURIComponent(chaine)}`, {
    headers: entetes(jeton),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!reponse.ok) {
    if (reponse.status === 401) oublieJeton();
    return null;
  }
  const charge = (await reponse.json()) as { data?: { id: string }[] };
  const id = charge.data?.[0]?.id ?? null;
  if (id) idEnCache = { chaine, id };
  return id;
}

export type AnnonceTchat =
  | { envoye: true }
  | {
      envoye: false;
      raison: 'jeton' | 'chaine' | 'autorisation' | 'refus' | 'reseau';
      /** Ce que Twitch a répondu, borné : pour le journal et l'écran de modération. */
      detail: string;
    };

/** La réponse de Twitch, lisible et bornée — jamais un jeton, Twitch n'en renvoie pas ici. */
async function detailDe(reponse: Response): Promise<string> {
  const texte = await reponse.text().catch(() => '');
  return `${reponse.status} ${texte}`.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Écrit ce message dans le tchat de la chaîne. Ne lève jamais : dit seulement si c'est parti. */
export async function annonceDansLeTchat(message: string): Promise<AnnonceTchat> {
  try {
    const jeton = await jetonApplication();
    if (!jeton) return { envoye: false, raison: 'jeton', detail: 'jeton de l’application refusé' };
    const id = await idDeLaChaine(jeton);
    if (!id) return { envoye: false, raison: 'chaine', detail: 'chaîne introuvable chez Twitch' };

    const reponse = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { ...entetes(jeton), 'content-type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: id, sender_id: id, message: message.slice(0, 500) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (reponse.status === 401 || reponse.status === 403) {
      return { envoye: false, raison: 'autorisation', detail: await detailDe(reponse) };
    }
    if (!reponse.ok) return { envoye: false, raison: 'refus', detail: await detailDe(reponse) };
    const charge = (await reponse.json()) as {
      data?: { is_sent?: boolean; drop_reason?: { code?: string; message?: string } | null }[];
    };
    const envoi = charge.data?.[0];
    if (envoi?.is_sent) return { envoye: true };
    const motif = envoi?.drop_reason;
    return {
      envoye: false,
      raison: 'refus',
      detail: `non envoyé : ${motif?.code ?? '?'} ${motif?.message ?? ''}`.trim().slice(0, 300),
    };
  } catch (e) {
    return { envoye: false, raison: 'reseau', detail: e instanceof Error ? e.message.slice(0, 200) : 'réseau' };
  }
}
