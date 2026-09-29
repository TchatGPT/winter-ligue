import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { duelBotSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { batailleContreBot, creeBataille, vueBataille } from '@/lib/services/batailles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Un duel contre le bot.
 *
 * Deux façons d'y venir : lancer contre lui un duel qu'on a monté et que
 * personne n'a rejoint (`batailleId`), ou monter et jouer un duel d'un seul
 * clic (`mise`, `manches`) — le plus simple pour essayer.
 *
 * Le bot lance ses boules de neige exactement comme un joueur, à la même
 * source : il gagne une fois sur deux, l'espérance est neutre. S'il gagne, le
 * pot disparaît ; s'il perd, le joueur rafle le double de sa mise.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'batailles-bot',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: duelBotSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut lancer un duel.');
  }

  try {
    const corps = g.body;
    const vue = await getStore().transaction((db) => {
      const id = 'batailleId' in corps ? corps.batailleId : creeBataille(db, joueurId, corps.mise, corps.manches).id;
      return vueBataille(db, batailleContreBot(db, joueurId, id));
    });
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
