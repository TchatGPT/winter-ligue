import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { horsLigueSchema } from '@/lib/api/schemas';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { getStore } from '@/lib/db/store';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * « Ne joue pas » (17/11/2026) : la modération coche un compte connecté par
 * Twitch qui ne joue pas dans la ligue — jamais par défaut. Il quitte le
 * classement et les tirages ; ses Boosters Perso non ouverts deviennent des
 * boosters cadeau (`reserveHorsLigue`), que la modération donne à des
 * joueurs. Décoché, il revient, avec ce qui n'a pas été donné.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-hors-ligue',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: horsLigueSchema,
  });
  if (!g.ok) return g.response;

  try {
    const resultat = await getStore().transaction((db) => {
      const joueur = db.players.find((p) => p.id === g.body.playerId && p.active);
      if (!joueur) return 'INTROUVABLE' as const;
      if (estLaStreameuse(joueur, chaineDeLaLigue())) return 'STREAMEUSE' as const;
      if (Boolean(joueur.horsLigue) !== g.body.horsLigue) {
        joueur.horsLigue = g.body.horsLigue;
        audit(
          db,
          g.session?.sub ?? 'admin',
          g.body.horsLigue ? 'JOUEUR_HORS_LIGUE' : 'JOUEUR_REJOINT_LIGUE',
          joueur.id,
          `${joueur.pseudo} ${g.body.horsLigue ? 'ne joue pas dans la ligue' : 'joue de nouveau dans la ligue'}`,
        );
      }
      return { id: joueur.id, horsLigue: Boolean(joueur.horsLigue) };
    });
    if (resultat === 'INTROUVABLE') return fail('INTROUVABLE', 'Joueur introuvable.');
    if (resultat === 'STREAMEUSE') return fail('CONFLIT', 'La streameuse ne joue déjà pas dans la ligue.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
