import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { ouvrirPackSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import type { PackId } from '@/lib/domain/types';
import { LIMITS } from '@/lib/security/ratelimit';
import { ouvrePack, vueOuverture } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ouvre un booster, à l'antenne, depuis la page Boosters.
 *
 * Réservé à la modération : c'est elle qui fait vivre la saison. Le tirage a
 * lieu ici, dans la transaction ; le rail ne fait que révéler la carte qu'on
 * lui renvoie. Relancer la même requête — même clé — rend la même ouverture.
 *
 * Personne n'ouvre un booster qui lui revient : un autre membre de la
 * modération l'ouvre pour lui.
 *
 * Les taux ne se règlent plus d'ici : ce sont ceux du catalogue.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-packs-ouvrir',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: ouvrirPackSchema,
  });
  if (!g.ok) return g.response;

  const moi = playerIdOf(g.session);

  try {
    const vue = await getStore().transaction((db) => {
      if (moi) {
        const du = g.body.packDuId ? db.packsDus.find((p) => p.id === g.body.packDuId) : null;
        if ((du?.joueurId ?? g.body.joueurId) === moi) return null;
      }
      const ouverture = ouvrePack(
        db,
        {
          packDuId: g.body.packDuId,
          packId: g.body.packId as PackId | undefined,
          joueurId: g.body.joueurId,
          idempotencyKey: g.body.idempotencyKey,
        },
        g.session?.sub ?? 'admin',
      );
      return vueOuverture(db, ouverture);
    });
    if (!vue) return fail('NON_AUTORISE', 'Ce booster te revient : un autre membre de la modération l’ouvre pour toi.');
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
