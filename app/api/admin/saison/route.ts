import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { nouvelleSaisonSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { estResponsableSaison, nouvelleSaison } from '@/lib/services/saisons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lance une saison et remet la ligue à zéro (Modération → Subs & saison).
 *
 * Le garde demande la modération ; la transaction demande en plus que le
 * compte soit celui d'un responsable de la saison (`RESPONSABLES_SAISON`, lu
 * en base). Le navigateur envoie le numéro de la saison et la phrase de
 * confirmation, tapée à la main : un clic de travers ne vide pas la ligue.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-nouvelle-saison',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: nouvelleSaisonSchema,
  });
  if (!g.ok) return g.response;
  const moi = playerIdOf(g.session);

  try {
    const bilan = await getStore().transaction((db) => {
      if (!estResponsableSaison(db, moi)) return null;
      return nouvelleSaison(db, g.body.numero, g.session?.sub ?? 'admin');
    });
    if (!bilan) return fail('NON_AUTORISE', 'Seul le responsable de la saison peut la lancer.');
    return ok(bilan);
  } catch (error) {
    return toResponse(error);
  }
}
