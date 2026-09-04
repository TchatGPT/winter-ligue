import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { batailleSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { rejointBataille, vueBataille } from '@/lib/services/batailles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rejoint une bataille en attente : la mise part, les deux camps ouvrent, le
 * vainqueur prend tout — le tout dans une seule transaction.
 *
 * Résoudre à l'entrée de l'adversaire plutôt qu'à un signal du client est ce
 * qui rend le mode incassable : fermer l'onglet pendant l'animation ne laisse
 * aucune bataille à moitié jouée, et les deux joueurs verront le même résultat
 * en rechargeant.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'batailles-rejoindre',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: batailleSchema,
  });
  if (!g.ok) return g.response;

  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut rejoindre une bataille.');
  }

  try {
    const vue = await getStore().transaction((db) =>
      vueBataille(db, rejointBataille(db, joueurId, g.body.batailleId)),
    );
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
