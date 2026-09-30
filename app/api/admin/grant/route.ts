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
 * Un modérateur ne se crédite jamais lui-même, et chacune de ses attributions
 * est bornée à mille flocons : de quoi un lot ou une correction, pas de quoi
 * vider la saison. Un administrateur n'a que la borne du schéma.
 */
const MAX_MODERATEUR = 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-grant',
    role: 'moderateur',
    limit: LIMITS.mutation,
    schema: adminGrantSchema,
  });
  if (!g.ok) return g.response;

  if (g.session?.role !== 'admin') {
    if (g.body.playerId === playerIdOf(g.session)) {
      return fail('NON_AUTORISE', 'Un modérateur ne s’attribue pas de flocons.');
    }
    if (Math.abs(g.body.snowflakes) > MAX_MODERATEUR) {
      return fail('REQUETE_INVALIDE', `Un modérateur attribue ${MAX_MODERATEUR} flocons au plus à la fois.`);
    }
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
