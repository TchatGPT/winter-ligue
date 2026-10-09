import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { activisionJoueurSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { activisionPris } from '@/lib/domain/activision';
import { LIMITS } from '@/lib/security/ratelimit';
import { getRanking } from '@/lib/services/league';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Le classement. Rien de la ligue ne se lit sans compte, pas plus ici qu'à l'écran. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'ranking', role: 'joueur' });
  if (!g.ok) return g.response;
  return ok({ ranking: await getRanking() });
}

/**
 * La modération corrige le pseudo Activision d'un joueur : celui que la
 * reconnaissance des captures compare aux noms lus. Vide, il retire le
 * pseudo, et la fenêtre d'inscription le redemandera au joueur.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'player-activision',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: activisionJoueurSchema,
  });
  if (!g.ok) return g.response;

  try {
    const player = await getStore().transaction((db) => {
      const found = db.players.find((p) => p.id === g.body.playerId);
      if (!found) throw new Error('Joueur introuvable.');
      if (g.body.activisionId && activisionPris(g.body.activisionId, db.players, found.id)) return null;
      found.activisionId = g.body.activisionId;
      audit(db, g.session?.sub ?? 'admin', 'ACTIVISION_MODIFIE', found.id, `${found.pseudo} → ${g.body.activisionId ?? '(vide)'}`);
      return found;
    });
    if (!player) return fail('CONFLIT', 'Ce pseudo Activision est déjà celui d’un autre joueur.');
    return ok({ id: player.id, activisionId: player.activisionId });
  } catch (error) {
    return toResponse(error);
  }
}
