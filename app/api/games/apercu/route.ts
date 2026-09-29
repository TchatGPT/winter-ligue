import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, ok } from '@/lib/api/respond';
import { uuid } from '@/lib/api/schemas';
import type { Database, Game } from '@/lib/db/entities';
import { getStore, newId } from '@/lib/db/store';
import { GAME_LIMITS } from '@/lib/domain/rules';
import { appliqueCartesEnAttente } from '@/lib/services/effects';
import { recomputeGame } from '@/lib/services/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apercuSchema = z.object({
  placement: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  lignes: z
    .array(
      z.object({
        playerId: uuid,
        kills: z.number().int().min(GAME_LIMITS.minKills).max(GAME_LIMITS.maxKills),
      }),
    )
    .max(8),
});

export interface ApercuLigne {
  playerId: string;
  /** Le score que la game aurait, carte active comprise. */
  score: number;
  /** La carte active du joueur, et ce qu'elle ferait sur cette game. */
  carte: { cardId: string; nom: string; points: number; resultat: string } | null;
}

/**
 * L'aperçu d'une saisie : ce que chaque game vaudrait, carte active comprise.
 *
 * La modération valide en connaissance de cause : une carte active tombe sur
 * la prochaine game du joueur et y est consommée. On rejoue donc exactement
 * l'enregistrement — création de la game, calcul, application de la carte —
 * sur une **copie** de la base, et l'on jette la copie. Rien n'est écrit, et
 * c'est le même code que la vraie saisie, donc le même résultat.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'game-apercu', role: 'moderateur', schema: apercuSchema });
  if (!g.ok) return g.response;

  const apercus = await getStore().read((lecture) => {
    const db = structuredClone(lecture) as Database;
    const now = new Date().toISOString();
    return g.body.lignes.map((ligne): ApercuLigne => {
      const game: Game = {
        id: newId(),
        playerId: ligne.playerId,
        kills: ligne.kills,
        placement: g.body.placement,
        bonusPoints: 0,
        skipped: false,
        score: 0,
        note: null,
        playedAt: now,
        createdAt: now,
        applied: [],
      };
      db.games.push(game);
      recomputeGame(db, game);
      const cartes = appliqueCartesEnAttente(db, game);
      const carte = cartes.cartes[0] ?? null;
      return {
        playerId: ligne.playerId,
        score: game.score,
        carte: carte ? { cardId: carte.cardId, nom: carte.nom, points: carte.points, resultat: carte.resultat } : null,
      };
    });
  });

  return ok({ apercus });
}
