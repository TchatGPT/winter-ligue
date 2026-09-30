import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { activisionJoueurSchema, createPlayerSchema } from '@/lib/api/schemas';
import { getStore, newId } from '@/lib/db/store';
import { activisionPris } from '@/lib/domain/activision';
import { ECONOMY } from '@/lib/domain/rules';
import { LIMITS } from '@/lib/security/ratelimit';
import { getRanking, makeSlug } from '@/lib/services/league';
import { audit, credit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Le classement. Rien de la ligue ne se lit sans compte, pas plus ici qu'à l'écran. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'ranking', role: 'joueur' });
  if (!g.ok) return g.response;
  return ok({ ranking: await getRanking() });
}

/**
 * Inscription manuelle par la modération, en attendant la connexion Twitch.
 * Le joueur reçoit sa dotation de départ pour pouvoir miser un premier affrontement.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'player-create',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: createPlayerSchema,
  });
  if (!g.ok) return g.response;

  try {
    const player = await getStore().transaction((db) => {
      if (g.body.activisionId && activisionPris(g.body.activisionId, db.players, null)) return null;
      const created = {
        id: newId(),
        slug: makeSlug(db, g.body.pseudo),
        pseudo: g.body.pseudo,
        twitchId: null,
        twitchLogin: g.body.twitchLogin ?? null,
        avatarUrl: null,
        activisionId: g.body.activisionId ?? null,
        snowflakes: 0,
        subsOfferts: 0,
        creneauxBonus: 0,
        immuniseJusqua: null,
        sessionsDepuis: null,
        joinedAt: new Date().toISOString(),
        active: true,
        role: 'joueur' as const,
      };
      db.players.push(created);
      credit(db, created.id, ECONOMY.welcomeGrant, 'INSCRIPTION', null);
      audit(db, g.session?.sub ?? 'admin', 'JOUEUR_CREE', created.id, created.pseudo);
      return created;
    });
    if (!player) return fail('CONFLIT', 'Ce pseudo Activision est déjà celui d’un autre joueur.');
    return ok(player);
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * La modération corrige le pseudo Activision d'un joueur : celui que la
 * reconnaissance des captures compare aux noms lus. Vide, il retire le
 * pseudo, et le joueur repassera par la page de bienvenue.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'player-activision',
    role: 'moderateur',
    limit: LIMITS.mutation,
    schema: activisionJoueurSchema,
  });
  if (!g.ok) return g.response;

  try {
    const player = await getStore().transaction((db) => {
      const found = db.players.find((p) => p.id === g.body.playerId);
      if (!found) throw new Error('Joueur introuvable.');
      if (g.body.activisionId && activisionPris(g.body.activisionId, db.players, found.id)) return null;
      found.activisionId = g.body.activisionId;
      audit(db, g.session?.sub ?? 'admin', 'ACTIVISION_MODIFIE', found.id, `${found.pseudo} → ${g.body.activisionId ?? '(vide)'}`);
      return found;
    });
    if (!player) return fail('CONFLIT', 'Ce pseudo Activision est déjà celui d’un autre joueur.');
    return ok({ id: player.id, activisionId: player.activisionId });
  } catch (error) {
    return toResponse(error);
  }
}
