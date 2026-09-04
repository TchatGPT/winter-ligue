import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { createBatailleSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN } from '@/lib/domain/bataille';
import { LIMITS } from '@/lib/security/ratelimit';
import {
  BatailleError,
  creeBataille,
  tableauBatailles,
  topSemaine,
  vueBataille,
} from '@/lib/services/batailles';
import { resolvedBoosters } from '@/lib/services/boosters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Le tableau des batailles : celles qui attendent un adversaire, et les
 * dernières jouées.
 *
 * La page l'interroge toutes les deux secondes. Il n'y a pas de temps réel dans
 * le projet, et à cette échelle il n'en faut pas : une bataille se rejoint en
 * un clic, deux secondes de latence n'ont jamais fait rater personne.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'batailles-read' });
  if (!g.ok) return g.response;

  const store = getStore();
  const { batailles, top, boosters, shopOpen, balance } = await store.read((db) => {
    const joueurId = playerIdOf(g.session);
    return {
      batailles: tableauBatailles(db),
      top: topSemaine(db),
      // Les prix réglés par l'administration, pas ceux du catalogue : la mise
      // affichée doit être celle que le serveur débitera.
      boosters: resolvedBoosters(db),
      shopOpen: db.config.shopOpen,
      balance: joueurId ? (db.players.find((p) => p.id === joueurId)?.snowflakes ?? null) : null,
    };
  });

  return ok({
    batailles,
    top,
    boosters,
    shopOpen,
    balance,
    bornes: { min: MANCHES_MIN, max: MANCHES_MAX },
    moiId: playerIdOf(g.session),
  });
}

/**
 * Crée une bataille et met l'hôte à l'enjeu.
 *
 * La mise part tout de suite, dans la même transaction que la création : une
 * bataille visible dans le tableau est une bataille déjà payée, et personne ne
 * rejoint une mise qui n'existe pas.
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
  // Seule la session de secours, qui n'a aucun compte derrière, est écartée.
  const joueurId = playerIdOf(g.session);
  if (!joueurId) {
    return fail('NON_AUTORISE', 'Seul un joueur peut lancer une bataille.');
  }

  try {
    const vue = await getStore().transaction((db) => {
      // Une bataille est une ouverture de boosters ; elle suit la boutique.
      // Laisser miser pendant qu'elle est fermée ouvrirait une porte dérobée.
      if (!db.config.shopOpen) {
        throw new BatailleError('La boutique est fermée par la modération.', 'BOUTIQUE_FERMEE');
      }
      const bataille = creeBataille(db, joueurId, g.body.boosterIds);
      return vueBataille(db, bataille);
    });
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}
