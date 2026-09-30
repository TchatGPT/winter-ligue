import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createToken, setSessionCookie } from '@/lib/auth/session';
import { fail, guard, ok } from '@/lib/api/respond';
import { uuid } from '@/lib/api/schemas';
import { connexionDeDeveloppement } from '@/lib/auth/dev';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';

const schema = z.object({ playerId: uuid });

/**
 * Connexion joueur de développement — voir `lib/auth/dev.ts`. Fermée, la
 * route répond 404, comme si elle n'existait pas.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!connexionDeDeveloppement()) {
    return fail('INTROUVABLE', 'Route indisponible.');
  }

  const g = await guard(request, { scope: 'dev-login', limit: LIMITS.login, schema });
  if (!g.ok) return g.response;

  const player = await getStore().read((db) =>
    db.players.find((p) => p.id === g.body.playerId && p.active),
  );
  if (!player) return fail('INTROUVABLE', 'Joueur introuvable.');

  // Le rôle vient de la base, pas d'une valeur figée : c'est ce qui fait qu'un
  // joueur promu administrateur l'est vraiment à sa prochaine connexion.
  await setSessionCookie(createToken(player.id, player.role));
  return ok({ id: player.id, pseudo: player.pseudo, slug: player.slug });
}
