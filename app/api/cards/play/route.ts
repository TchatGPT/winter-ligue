import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { playCardSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { playCard } from '@/lib/services/cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Joue une carte de sa main.
 *
 * Le corps ne contient que des identifiants : la copie de carte, et la cible
 * éventuelle. L'effet, sa puissance et les protections adverses sont résolus
 * dans `playCard`, à partir du catalogue serveur. Rejouer la requête avec la
 * même clé d'idempotence ne consomme pas une seconde carte.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'card-play',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: playCardSchema,
  });
  if (!g.ok) return g.response;
  if (g.session!.role !== 'joueur') {
    return fail('NON_AUTORISE', 'Seul un joueur peut jouer une carte.');
  }

  try {
    const result = await getStore().transaction((db) =>
      playCard(db, g.session!.sub, {
        cardInstanceId: g.body.cardInstanceId,
        gameId: g.body.gameId,
        targetPlayerId: g.body.targetPlayerId,
        idempotencyKey: g.body.idempotencyKey,
      }),
    );
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
