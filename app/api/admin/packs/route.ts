import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { ouvrirPackSchema } from '@/lib/api/schemas';
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
 * Un membre de la modération peut ouvrir un booster qui lui revient : le
 * tirage se fait ici, côté serveur, et l'ouverture est au journal — il n'a
 * rien à y gagner qu'il n'aurait eu si un autre l'avait ouvert. Ce qu'il ne
 * fait pas, c'est régler son propre compteur de Boosters Perso.
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

  try {
    const vue = await getStore().transaction((db) => {
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
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
