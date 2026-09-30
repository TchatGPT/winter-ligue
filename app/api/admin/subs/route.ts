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

/** Le plus qu'un modérateur saisit d'un coup. */
const MAX_MODERATEUR = 100;

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
 * Et `remise-a-zero`, réservée aux admins : le compteur repart de zéro au
 * début de la saison, sans rien reprendre de ce qu'il a versé.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-subs',
    role: 'moderateur',
    limit: LIMITS.mutation,
    schema: adminSubsSchema,
  });
  if (!g.ok) return g.response;

  // Extrait dans une constante locale : TypeScript ne sait pas restreindre
  // une union discriminée à travers l'accès répété `g.body`.
  const body = g.body;
  const actor = g.session?.sub ?? 'admin';

  if (body.action === 'remise-a-zero') {
    if (g.session?.role !== 'admin') {
      return fail('NON_AUTORISE', 'Seul un admin remet le compteur de subs à zéro.');
    }
    try {
      return ok(await getStore().transaction((db) => remetSubsAZero(db, actor)));
    } catch (error) {
      return toResponse(error);
    }
  }

  // Un modérateur saisit ce qui tombe pendant un live : cent subs au plus à la
  // fois, et jamais à son propre compte — ses subs offerts lui valent des
  // boosters.
  if (g.session?.role !== 'admin') {
    if (body.delta > MAX_MODERATEUR) {
      return fail('REQUETE_INVALIDE', `Un modérateur saisit ${MAX_MODERATEUR} subs au plus à la fois.`);
    }
    if (body.action === 'subs-joueur' && body.playerId === playerIdOf(g.session)) {
      return fail('NON_AUTORISE', 'Un modérateur ne s’inscrit pas de subs offerts.');
    }
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
