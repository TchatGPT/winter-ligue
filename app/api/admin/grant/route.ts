import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { adminGrantSchema } from '@/lib/api/schemas';
import { getStore, newId } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { adjust, audit } from '@/lib/services/ledger';
import { recomputePlayerGames } from '@/lib/services/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Attribution manuelle de flocons ou d'une carte (lots, défis, correction).
 *
 * Chaque attribution exige un motif et laisse une trace au journal d'audit : la
 * modération peut donner, mais jamais discrètement.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-grant',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminGrantSchema,
  });
  if (!g.ok) return g.response;

  if (g.body.snowflakes === undefined && g.body.cardId === undefined) {
    return fail('REQUETE_INVALIDE', 'Précise des flocons ou une carte.');
  }

  try {
    const result = await getStore().transaction((db) => {
      const player = db.players.find((p) => p.id === g.body.playerId);
      if (!player) return null;

      let balance = player.snowflakes;
      if (g.body.snowflakes !== undefined) {
        balance = adjust(db, player.id, g.body.snowflakes, null);
      }

      if (g.body.cardId) {
        db.cards.push({
          id: newId(),
          playerId: player.id,
          cardId: g.body.cardId,
          obtainedAt: new Date().toISOString(),
          source: 'ADMIN',
          consumed: false,
          consumedAt: null,
          consumedOnGameId: null,
          consumedOnPlayerId: null,
          listingId: null,
          consumeKey: null,
        });
        const known = db.discoveries.some(
          (d) => d.playerId === player.id && d.cardId === g.body.cardId,
        );
        if (!known) {
          db.discoveries.push({
            playerId: player.id,
            cardId: g.body.cardId,
            firstObtainedAt: new Date().toISOString(),
          });
          // Une famille vient peut-être d'être complétée : les scores changent.
          recomputePlayerGames(db, player.id);
        }
      }

      audit(db, 'admin', 'ATTRIBUTION', player.id, g.body.reason);
      return { playerId: player.id, balance };
    });

    if (!result) return fail('INTROUVABLE', 'Joueur introuvable.');
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
