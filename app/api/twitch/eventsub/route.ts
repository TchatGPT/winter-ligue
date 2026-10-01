import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { eventSubSchema } from '@/lib/api/schemas';
import { chaineDeLaLigue, isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { gesteDuMessage, messageFrais, roleDuMessage } from '@/lib/domain/twitchSubs';
import { LIMITS } from '@/lib/security/ratelimit';
import { suisModerationTwitch } from '@/lib/services/comptes';
import { audit } from '@/lib/services/ledger';
import { ajouteSubsTwitch } from '@/lib/services/subs';
import { signatureValide } from '@/lib/services/twitchSubs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Un message EventSub tient en quelques kilo-octets ; au-delà, ce n'est pas Twitch. */
const CORPS_MAX = 64 * 1024;

const reponse = (status: number) => new NextResponse(null, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Les messages de Twitch : chaque annonce du tchat de la chaîne — dont les
 * subs, les resubs et les cadeaux —, et chaque modérateur ajouté ou retiré, en
 * direct (EventSub, en webhook). Branchement : `lib/services/twitchSubs.ts`.
 * Ce qui compte pour un sub : `gesteDuMessage`, dans `lib/domain/twitchSubs.ts`.
 *
 * Personne d'autre que Twitch ne fait rien compter ici. La signature — un
 * HMAC-SHA256 dont le secret, tiré d'`AUTH_SECRET`, n'est connu que du site et
 * de Twitch — est vérifiée avant de lire le message ; un message de plus de dix
 * minutes est ignoré ; et chaque message ne compte qu'une fois, car Twitch
 * renvoie ce qu'il croit perdu. Le compteur avance par `addSubs()`, comme depuis
 * l'administration : paliers, flocons pour tous, boosters en file.
 *
 * Twitch attend une réponse en quelques secondes : un 2xx dit « reçu », tout le
 * reste le fait réessayer.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Pas d'origine (ce n'est pas un navigateur), pas de session : le garde
  // limite le débit, large — un cadeau de masse arrive d'un coup, un message
  // par destinataire.
  const g = await guard(request, { scope: 'twitch-eventsub', limit: LIMITS.eventsub });
  if (!g.ok) return g.response;
  if (!isTwitchEnabled()) return reponse(404);

  const id = request.headers.get('twitch-eventsub-message-id');
  const horodatage = request.headers.get('twitch-eventsub-message-timestamp');
  const signature = request.headers.get('twitch-eventsub-message-signature');
  const genre = request.headers.get('twitch-eventsub-message-type');
  if (!id || !horodatage || !signature || !genre || id.length > 100 || horodatage.length > 64) {
    return reponse(400);
  }

  if (Number(request.headers.get('content-length') ?? '0') > CORPS_MAX) return reponse(413);
  const corps = await request.text();
  if (Buffer.byteLength(corps) > CORPS_MAX) return reponse(413);

  // La signature d'abord : sans elle, rien de ce qui suit n'est lu.
  if (!signatureValide(id, horodatage, corps, signature)) return reponse(403);
  // Un vieux message signé : un rejeu, ou un renvoi trop tardif. Reçu, ignoré.
  if (!messageFrais(horodatage, Date.now())) return reponse(204);

  let brut: unknown;
  try {
    brut = JSON.parse(corps);
  } catch {
    return reponse(400);
  }
  const lu = eventSubSchema.safeParse(brut);
  if (!lu.success) return reponse(400);
  const { subscription, event, challenge } = lu.data;

  if (genre === 'webhook_callback_verification') {
    // Twitch vérifie que l'adresse est bien la nôtre : on lui rend son défi, tel quel.
    if (!challenge) return reponse(400);
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (genre === 'revocation') {
    await getStore().transaction((db) => {
      audit(
        db,
        'twitch',
        'SUBS_TWITCH_COUPES',
        null,
        `Twitch a coupé l’abonnement ${subscription.type} (${subscription.status ?? 'sans motif'}) : à rebrancher depuis Modération → Saison.`,
      );
    });
    return reponse(204);
  }

  if (genre !== 'notification' || !event) return reponse(204);

  // La chaîne de la ligue, et aucune autre.
  const chaine = typeof event.broadcaster_user_login === 'string' ? event.broadcaster_user_login.toLowerCase() : '';
  if (chaine !== chaineDeLaLigue()) return reponse(204);

  // Un modérateur ajouté ou retiré : son rôle suit, tout de suite.
  const role = roleDuMessage(subscription.type);
  if (role) {
    const twitchId = typeof event.user_id === 'string' ? event.user_id : '';
    if (!twitchId || twitchId.length > 64 || twitchId === event.broadcaster_user_id) return reponse(204);
    try {
      await getStore().transaction((db) => suisModerationTwitch(db, { twitchId, role, chaine }));
    } catch {
      return reponse(500);
    }
    return reponse(204);
  }

  // Le tchat annonce bien plus que des subs : un raid, une annonce, un sub
  // Prime, chaque destinataire d'un cadeau de masse. Ce qui ne compte pas
  // s'arrête ici, sans ouvrir de transaction.
  if (!gesteDuMessage(subscription.type, event)) return reponse(204);

  try {
    await getStore().transaction((db) =>
      ajouteSubsTwitch(db, { id, type: subscription.type, evenement: event, maintenant: Date.now() }),
    );
  } catch {
    // Rien n'a été compté : Twitch réessaiera.
    return reponse(500);
  }
  return reponse(204);
}
