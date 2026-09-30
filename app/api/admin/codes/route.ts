import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { creeCodeSchema, desactiveCodeSchema, supprimeCodeSchema } from '@/lib/api/schemas';
import { baseDuSite, isTwitchEnabled } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { annonceDuCode } from '@/lib/domain/codes';
import { LIMITS } from '@/lib/security/ratelimit';
import { creeCode, desactiveCode, supprimeCode } from '@/lib/services/codes';
import { annonceDansLeTchat, type AnnonceTchat } from '@/lib/services/twitchChat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Les codes cadeaux, côté modération : c'est ainsi que les flocons se donnent.
 * Un code porte un montant et un nombre d'utilisations ; il se crée, se
 * désactive, ou se supprime pour de bon. Chaque geste est inscrit au journal.
 *
 * Un code créé est aussitôt annoncé dans le tchat de la chaîne — après la
 * transaction : la base n'attend pas Twitch, et un tchat muet n'empêche pas le
 * code d'exister. L'écran dit s'il est parti.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-codes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: creeCodeSchema,
  });
  if (!g.ok) return g.response;

  try {
    const code = await getStore().transaction((db) => creeCode(db, g.body, g.session?.sub ?? 'admin'));
    const site = baseDuSite(new URL(request.url).origin).replace(/^https?:\/\//, '').replace(/^www\./, '');
    const tchat: AnnonceTchat = isTwitchEnabled()
      ? await annonceDansLeTchat(annonceDuCode(code, site))
      : { envoye: false, raison: 'jeton' };
    return ok({ id: code.id, code: code.code, montant: code.montant, utilisationsMax: code.utilisationsMax, tchat });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-codes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: desactiveCodeSchema,
  });
  if (!g.ok) return g.response;

  try {
    const code = await getStore().transaction((db) => desactiveCode(db, g.body.id, g.session?.sub ?? 'admin'));
    return ok({ id: code.id, actif: code.actif });
  } catch (error) {
    return toResponse(error);
  }
}

/** Supprime un code pour de bon. Les flocons qu'il a versés ne sont pas repris. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-codes',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: supprimeCodeSchema,
  });
  if (!g.ok) return g.response;

  try {
    return ok(await getStore().transaction((db) => supprimeCode(db, g.body.id, g.session?.sub ?? 'admin')));
  } catch (error) {
    return toResponse(error);
  }
}
