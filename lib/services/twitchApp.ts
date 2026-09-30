import 'server-only';

/**
 * Le jeton de l'application Twitch (« client credentials ») et les en-têtes
 * qui vont avec.
 *
 * C'est avec lui que le site gère ses abonnements EventSub et écrit dans le
 * tchat de la chaîne — jamais avec le jeton d'une personne, qu'il faudrait
 * garder et renouveler. Ce que Twitch exige de la streameuse, elle l'accorde
 * une fois, au branchement ; Twitch s'en souvient.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';

let jetonEnCache: { valeur: string; expire: number } | null = null;

/** Le jeton, gardé en mémoire tant qu'il vaut. Null si Twitch le refuse. */
export async function jetonApplication(): Promise<string | null> {
  if (jetonEnCache && jetonEnCache.expire > Date.now()) return jetonEnCache.valeur;
  const reponse = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID ?? '',
      client_secret: process.env.TWITCH_CLIENT_SECRET ?? '',
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!reponse.ok) return null;
  const charge = (await reponse.json()) as { access_token?: string; expires_in?: number };
  if (!charge.access_token) return null;
  // Une marge d'une minute : on ne s'en sert jamais au bord de l'expiration.
  const duree = Math.max(0, (charge.expires_in ?? 3600) - 60) * 1000;
  jetonEnCache = { valeur: charge.access_token, expire: Date.now() + duree };
  return charge.access_token;
}

/** Twitch a refusé le jeton : le prochain appel en redemandera un. */
export function oublieJeton(): void {
  jetonEnCache = null;
}

export function entetes(jeton: string): Record<string, string> {
  return { authorization: `Bearer ${jeton}`, 'client-id': process.env.TWITCH_CLIENT_ID ?? '' };
}
