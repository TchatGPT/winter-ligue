import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { deleteGameSchema, gameSchema, updateGameSchema } from '@/lib/api/schemas';
import type { Game } from '@/lib/db/entities';
import { getStore, newId } from '@/lib/db/store';
import { rewardForGame } from '@/lib/domain/economy';
import { LIMITS } from '@/lib/security/ratelimit';
import { appliqueCartesEnAttente } from '@/lib/services/effects';
import { recomputeGame } from '@/lib/services/league';
import { audit, credit } from '@/lib/services/ledger';
import { verifieFinisseur } from '@/lib/services/packs';
import { facteurGain } from '@/lib/services/evenements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enregistre une game.
 *
 * Réservé à la modération, comme sur la Summer Ligue : c'est le stream qui fait
 * foi, pas la déclaration du joueur. Le corps ne contient ni multiplicateur ni
 * bonus — ceux-ci ne peuvent naître que d'une carte de pack posée sur ce
 * joueur, et c'est **ici** qu'elle s'applique, puis se consomme. Le score et
 * les flocons gagnés sont calculés ici.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-create',
    role: 'moderateur',
    limit: LIMITS.mutation,
    schema: gameSchema,
  });
  if (!g.ok) return g.response;

  try {
    const result = await getStore().transaction((db) => {
      const player = db.players.find((p) => p.id === g.body.playerId);
      if (!player) return { error: 'JOUEUR' as const };

      const played = db.games.filter((x) => x.playerId === player.id && !x.skipped).length;
      if (played >= db.config.maxGamesPerPlayer) return { error: 'LIMITE' as const };

      const now = new Date().toISOString();
      const game: Game = {
        id: newId(),
        playerId: player.id,
        kills: g.body.kills,
        placement: g.body.placement,
        bonusPoints: 0,
        skipped: false,
        score: 0,
        note: g.body.note ?? null,
        playedAt: now,
        createdAt: now,
        applied: [],
      };
      db.games.push(game);
      recomputeGame(db, game);

      // Les cartes posées sur ce joueur tombent maintenant, et disparaissent.
      const cartes = appliqueCartesEnAttente(db, game);

      const reward = rewardForGame(game.kills, game.placement);
      // Une Manne double les flocons de cette game ; un évènement « flocons
      // doublés » en cours s'applique à tout le monde, et se cumule avec elle :
      // elle est personnelle et consommée, lui est collectif et gratuit.
      const payout = Math.round(reward.total * cartes.facteurFlocons * facteurGain(db));
      credit(db, player.id, payout, 'GAME', game.id);

      // La dernière game de la saison vaut un pack Finisseur, mis en file.
      const finisseur = verifieFinisseur(db, player.id);

      audit(
        db,
        g.session?.sub ?? 'admin',
        'GAME_ENREGISTREE',
        player.id,
        `${game.kills} kills — ${game.score} pts${
          cartes.cartes.length ? ` — cartes : ${cartes.cartes.map((c) => c.nom).join(', ')}` : ''
        }`,
      );

      return { game, reward, payout, cartes: cartes.cartes, finisseur: finisseur !== null };
    });

    if ('error' in result) {
      return result.error === 'JOUEUR'
        ? fail('INTROUVABLE', 'Joueur introuvable.')
        : fail('CONFLIT', 'Ce joueur a atteint sa limite de games pour la saison.');
    }
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}

/** Passe une game (elle ne compte plus) ou modifie sa note. */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-update',
    role: 'moderateur',
    limit: LIMITS.mutation,
    schema: updateGameSchema,
  });
  if (!g.ok) return g.response;

  const updated = await getStore().transaction((db) => {
    const game = db.games.find((x) => x.id === g.body.gameId);
    if (!game) return null;
    if (g.body.skipped !== undefined) game.skipped = g.body.skipped;
    if (g.body.note !== undefined) game.note = g.body.note ?? null;
    recomputeGame(db, game);
    audit(db, g.session?.sub ?? 'admin', 'GAME_MODIFIEE', game.playerId, game.id);
    return game;
  });

  if (!updated) return fail('INTROUVABLE', 'Game introuvable.');
  return ok(updated);
}

/** Supprime une game. Les flocons déjà versés ne sont pas repris. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-delete',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: deleteGameSchema,
  });
  if (!g.ok) return g.response;

  const removed = await getStore().transaction((db) => {
    const game = db.games.find((x) => x.id === g.body.gameId);
    if (!game) return false;
    db.games = db.games.filter((x) => x.id !== g.body.gameId);
    audit(db, g.session?.sub ?? 'admin', 'GAME_SUPPRIMEE', game.playerId, game.id);
    return true;
  });

  if (!removed) return fail('INTROUVABLE', 'Game introuvable.');
  return ok({ supprimee: true });
}
