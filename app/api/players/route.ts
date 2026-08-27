import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { createPlayerSchema } from '@/lib/api/schemas';
import { getStore, newId } from '@/lib/db/store';
import { ECONOMY } from '@/lib/domain/rules';
import { LIMITS } from '@/lib/security/ratelimit';
import { getRanking, makeSlug } from '@/lib/services/league';
import { audit, credit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Classement public. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'ranking' });
  if (!g.ok) return g.response;
  return ok({ ranking: await getRanking() });
}

/**
 * Inscription manuelle par la modération, en attendant la connexion Twitch.
 * Le joueur reçoit sa dotation de départ pour pouvoir acheter un premier booster.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'player-create',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: createPlayerSchema,
  });
  if (!g.ok) return g.response;

  try {
    const player = await getStore().transaction((db) => {
      const created = {
        id: newId(),
        slug: makeSlug(db, g.body.pseudo),
        pseudo: g.body.pseudo,
        twitchId: null,
        twitchLogin: g.body.twitchLogin ?? null,
        avatarUrl: null,
        snowflakes: 0,
        joinedAt: new Date().toISOString(),
        active: true,
      };
      db.players.push(created);
      credit(db, created.id, ECONOMY.welcomeGrant, 'INSCRIPTION', null);
      audit(db, 'admin', 'JOUEUR_CREE', created.id, created.pseudo);
      return created;
    });
    return ok(player);
  } catch (error) {
    return toResponse(error);
  }
}
