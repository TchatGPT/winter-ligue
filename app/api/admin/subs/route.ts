import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { uuid } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { addSubs, giftCard, subsOverview } from '@/lib/services/subs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.union([
  z.object({ action: z.literal('subs'), delta: z.number().int().min(1).max(10_000) }),
  z.object({ action: z.literal('gift'), playerId: uuid }),
]);

/** État public du compteur de subs, pour la bannière du classement. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'subs-read' });
  if (!g.ok) return g.response;
  return ok(await getStore().read((db) => subsOverview(db)));
}

/**
 * Saisie des subs par la modération, et carte offerte à un joueur nommé.
 *
 * Les versements de paliers vont à tous les joueurs actifs à parts égales : il
 * n'existe volontairement aucun moyen d'attribuer des flocons de subs à un
 * joueur en particulier.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-subs',
    role: 'admin',
    limit: LIMITS.mutation,
    schema,
  });
  if (!g.ok) return g.response;

  // Extrait dans une constante locale : TypeScript ne sait pas restreindre
  // une union discriminée à travers l'accès répété `g.body`.
  const body = g.body;

  try {
    if (body.action === 'gift') {
      const cardId = await getStore().transaction((db) => giftCard(db, body.playerId, 'admin'));
      return ok({ cardId });
    }

    const result = await getStore().transaction((db) => addSubs(db, body.delta, 'admin'));
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
