import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { adminGrantSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { adjust, audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Attribution manuelle de flocons (lots, défis, correction).
 *
 * Chaque attribution exige un motif et laisse une trace au journal d'audit : la
 * modération peut donner, mais jamais discrètement. Aucune carte ne se donne
 * ici — une carte sort d'un pack, ouvert à l'antenne, ou ne sort pas.
 *
 * Personne ne se crédite soi-même : les modérateurs de la chaîne, tous admins,
 * jouent peut-être dans la ligue. Un autre le fait pour eux.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-grant',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminGrantSchema,
  });
  if (!g.ok) return g.response;

  if (g.body.playerId === playerIdOf(g.session)) {
    return fail('NON_AUTORISE', 'On ne s’attribue pas de flocons : un autre membre de la modération le fait.');
  }

  try {
    const result = await getStore().transaction((db) => {
      const player = db.players.find((p) => p.id === g.body.playerId);
      if (!player) return null;
      const balance = adjust(db, player.id, g.body.snowflakes, null);
      audit(db, g.session?.sub ?? 'admin', 'ATTRIBUTION', player.id, g.body.reason);
      return { playerId: player.id, balance };
    });

    if (!result) return fail('INTROUVABLE', 'Joueur introuvable.');
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
