import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { createBatailleSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { DUEL } from '@/lib/domain/rules';
import { LIMITS } from '@/lib/security/ratelimit';
import { creeBataille, tableauBatailles, topSemaine, verifieAttente, vueBataille } from '@/lib/services/batailles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le tableau des affrontements : ceux qui attendent un adversaire, et les
 * derniers joués.
 *
 * La page l'interroge toutes les deux secondes. Il n'y a pas de temps réel dans
 * le projet, et à cette échelle il n'en faut pas : un affrontement se rejoint
 * en un clic, deux secondes de latence n'ont jamais fait rater personne.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Les duels, comme tout le reste de la ligue, ne se lisent qu'avec un compte.
  const g = await guard(request, { scope: 'batailles-read', role: 'joueur' });
  if (!g.ok) return g.response;

  const { batailles, top, balance } = await getStore().read((db) => {
    const joueurId = playerIdOf(g.session);
    return {
      batailles: tableauBatailles(db),
      top: topSemaine(db),
      balance: joueurId ? (db.players.find((p) => p.id === joueurId)?.snowflakes ?? null) : null,
    };
  });

  return ok({
    batailles,
    top,
    balance,
    bornes: {
      manches: { min: MANCHES_MIN, max: MANCHES_MAX },
      mise: { min: DUEL.miseMin, max: DUEL.miseMax },
    },
    moiId: playerIdOf(g.session),
    // L'heure du serveur : les deux joueurs d'un duel partent à la même, chacun
    // corrige la sienne avec (voir `DELAI_DEPART_MS`).
    maintenant: new Date().toISOString(),
  });
}

/**
 * Crée un affrontement et met l'hôte à l'enjeu.
 *
 * La mise part tout de suite, dans la même transaction que la création : un
 * affrontement visible dans le tableau est un affrontement déjà payé.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'batailles-creer',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: createBatailleSchema,
  });
  if (!g.ok) return g.response;

  // L'identité, pas le rôle : un administrateur qui joue reste un joueur.
  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut lancer un duel.');
  }

  try {
    const vue = await getStore().transaction((db) => {
      verifieAttente(db, joueurId);
      return vueBataille(db, creeBataille(db, joueurId, g.body.mise, g.body.manches));
    });
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
