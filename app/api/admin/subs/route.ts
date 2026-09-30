import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { adminSubsSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { attribueSubsJoueur } from '@/lib/services/packs';
import { addSubs, remetSubsAZero, subsOverview } from '@/lib/services/subs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** État du compteur de subs, pour la bannière du classement. Connecté seulement. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'subs-read', role: 'joueur' });
  if (!g.ok) return g.response;
  return ok(await getStore().read((db) => subsOverview(db)));
}

/**
 * Saisie des subs par la modération.
 *
 * Deux gestes distincts, et volontairement séparés :
 *  - `subs` alimente le compteur de la saison : flocons pour tous, packs
 *    collectifs en file, évènements ;
 *  - `subs-joueur` inscrit des subs offerts au compte d'un joueur nommé : ils
 *    lui valent des packs Perso, mis en file. Ils ne touchent pas au compteur
 *    de saison — la modération saisit les deux, l'un après l'autre.
 *
 * Et `remise-a-zero` : le compteur repart de zéro au début de la saison, sans
 * rien reprendre de ce qu'il a versé.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-subs',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminSubsSchema,
  });
  if (!g.ok) return g.response;

  // Extrait dans une constante locale : TypeScript ne sait pas restreindre
  // une union discriminée à travers l'accès répété `g.body`.
  const body = g.body;
  const actor = g.session?.sub ?? 'admin';

  if (body.action === 'remise-a-zero') {
    try {
      return ok(await getStore().transaction((db) => remetSubsAZero(db, actor)));
    } catch (error) {
      return toResponse(error);
    }
  }

  // Jamais à son propre compte : des subs offerts valent des boosters.
  if (body.action === 'subs-joueur' && body.playerId === playerIdOf(g.session)) {
    return fail('NON_AUTORISE', 'On ne s’inscrit pas de subs offerts : un autre membre de la modération le fait.');
  }

  try {
    if (body.action === 'subs-joueur') {
      const result = await getStore().transaction((db) =>
        attribueSubsJoueur(db, body.playerId, body.delta, actor),
      );
      return ok(result);
    }

    const result = await getStore().transaction((db) => addSubs(db, body.delta, actor));
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}
