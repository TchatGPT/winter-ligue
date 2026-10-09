import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { monActivisionSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { activisionPris } from '@/lib/domain/activision';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';
import { isTwitchEnabled } from '@/lib/auth/twitch';
import { getProfile } from '@/lib/services/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contexte de la session courante.
 *
 * Volontairement tolérant : un visiteur non connecté reçoit une réponse 200
 * avec `profile: null` plutôt qu'une 401, ce qui évite au client d'avoir à
 * traiter une erreur pour un cas parfaitement normal.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'me' });
  if (!g.ok) return g.response;

  const session = g.session;
  if (!session) {
    return ok({ role: null, profile: null, twitchEnabled: isTwitchEnabled() });
  }
  // Le rôle et le profil sont deux choses distinctes : un administrateur qui
  // joue a les deux.
  const playerId = playerIdOf(session);
  return ok({
    role: session.role,
    profile: playerId ? await getProfile(playerId) : null,
    twitchEnabled: isTwitchEnabled(),
  });
}

/**
 * L'inscription : le joueur donne son pseudo Warzone (identifiant Activision).
 *
 * C'est la seule chose qu'un joueur écrit sur son propre compte, et une seule
 * fois : ensuite, seule la modération le corrige (`PATCH /api/players`). Elle
 * ne touche ni score ni flocons : elle sert à le reconnaître sur les captures
 * de fin de game.
 *
 * Un nom déjà pris par un autre joueur est refusé : sinon l'un se ferait
 * attribuer les games de l'autre.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'me-activision',
    role: 'joueur',
    limit: LIMITS.mutation,
    schema: monActivisionSchema,
  });
  if (!g.ok) return g.response;

  const playerId = playerIdOf(g.session);
  if (!playerId) {
    return fail('NON_AUTORISE', 'La session de modération n’a pas de profil joueur.');
  }

  try {
    const resultat = await getStore().transaction((db) => {
      const player = db.players.find((p) => p.id === playerId);
      if (!player) throw new Error('Joueur introuvable.');
      if (player.activisionId !== null) return 'DEJA' as const;
      if (activisionPris(g.body.activisionId, db.players, player.id)) return 'PRIS' as const;
      player.activisionId = g.body.activisionId;
      audit(db, playerId, 'ACTIVISION_RENSEIGNE', playerId, g.body.activisionId);
      return { activisionId: player.activisionId };
    });
    if (resultat === 'DEJA') {
      return fail('CONFLIT', 'Ton pseudo Warzone est déjà enregistré : seule la modération peut le corriger.');
    }
    if (resultat === 'PRIS') {
      return fail(
        'CONFLIT',
        'Ce pseudo Warzone est déjà celui d’un autre joueur. Vérifie-le, ou contacte la modération.',
      );
    }
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
