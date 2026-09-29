import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { rattacheCompteTwitch } from '@/lib/services/comptes';

export const runtime = 'nodejs';

const demoSchema = z.object({
  login: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,25}$/, 'Pseudo Twitch invalide : 3 à 25 lettres, chiffres ou « _ ».'),
  role: z.enum(['joueur', 'moderateur', 'admin']),
});

/**
 * La connexion Twitch simulée.
 *
 * Temporaire : elle tient la place du vrai flux OAuth tant que l'application
 * Twitch n'est pas déclarée. On choisit son pseudo Twitch et son rôle sur la
 * chaîne — ce que le vrai flux lira chez Twitch — et le compte est créé ou
 * retrouvé exactement comme au retour du vrai Twitch.
 *
 * Elle se ferme d'elle-même : dès que `TWITCH_CLIENT_ID` et
 * `TWITCH_CLIENT_SECRET` sont définis, cette route répond 404.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (isTwitchEnabled()) {
    return fail('INTROUVABLE', 'La connexion simulée est fermée : la vraie connexion Twitch est active.');
  }

  const g = await guard(request, { scope: 'twitch-demo', limit: LIMITS.mutation, schema: demoSchema });
  if (!g.ok) return g.response;

  try {
    const login = g.body.login;
    const joueur = await getStore().transaction((db) =>
      rattacheCompteTwitch(db, {
        id: `demo:${login.toLowerCase()}`,
        login: login.toLowerCase(),
        displayName: login,
        avatarUrl: null,
        roleChaine: g.body.role,
      }),
    );

    let jeton: string;
    try {
      jeton = createToken(joueur.id, joueur.role);
    } catch {
      return fail('ERREUR_SERVEUR', 'Connexion impossible : AUTH_SECRET manque côté serveur (32 caractères minimum).');
    }
    await setSessionCookie(jeton);

    return ok({ destination: joueur.activisionId ? '/' : '/bienvenue' });
  } catch (error) {
    return toResponse(error);
  }
}
