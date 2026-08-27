import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { fail, guard, ok } from '@/lib/api/respond';
import { uuid } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';

const schema = z.object({ playerId: uuid });

/**
 * Connexion joueur de développement, en attendant Twitch.
 *
 * Double verrou volontaire : la route rend 404 si `NODE_ENV === 'production'`
 * OU si `ALLOW_DEV_LOGIN` n'est pas explicitement à `true`. Oublier de retirer
 * la variable ne suffit donc pas à ouvrir une porte en production, et un
 * déploiement de préproduction doit l'activer sciemment.
 */
function devLoginAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true';
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!devLoginAllowed()) {
    return fail('INTROUVABLE', 'Route indisponible.');
  }

  const g = await guard(request, { scope: 'dev-login', limit: LIMITS.login, schema });
  if (!g.ok) return g.response;

  const player = await getStore().read((db) =>
    db.players.find((p) => p.id === g.body.playerId && p.active),
  );
  if (!player) return fail('INTROUVABLE', 'Joueur introuvable.');

  await setSessionCookie(createToken(player.id, 'joueur'));
  return ok({ id: player.id, pseudo: player.pseudo, slug: player.slug });
}
