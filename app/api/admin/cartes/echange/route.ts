import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { echangeChoisiSchema } from '@/lib/api/schemas';
import type { Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { LIMITS } from '@/lib/security/ratelimit';
import { gamesJouees, gamesPrenables, joueEchangeChoisi } from '@/lib/services/effects';
import { audit } from '@/lib/services/ledger';
import { joueursEnLice } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Une game qu'on peut choisir : encore sans carte. */
interface GameChoisissable {
  id: string;
  jouee: string;
  kills: number;
  placement: number | null;
  score: number;
}

/**
 * Ce qu'il faut pour jouer un Pacte du Givre : les games encore sans carte de
 * son porteur, et celles de chaque autre joueur en lice. Lecture seule, pour la
 * modération.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'admin-cartes-echange-lecture', role: 'admin' });
  if (!g.ok) return g.response;
  const carteId = new URL(request.url).searchParams.get('carteId') ?? '';

  try {
    const vue = await getStore().read((lecture) => {
      const db = lecture as Database;
      const carte = db.cartesEnAttente.find((c) => c.id === carteId && c.consommeeA === null);
      const card = carte ? getCard(carte.cardId) : null;
      if (!carte || !card || card.effect.kind !== 'echange_choisi') return null;
      const choisissables = (joueurId: string): GameChoisissable[] =>
        gamesPrenables(db, joueurId).map((game) => ({
          id: game.id,
          jouee: game.playedAt,
          kills: game.kills,
          placement: game.placement,
          score: game.score,
        }));
      return {
        minGames: card.effect.minGames,
        jouees: gamesJouees(db, carte.joueurId),
        miennes: choisissables(carte.joueurId),
        autres: joueursEnLice(db)
          .filter((p) => p.id !== carte.joueurId)
          .map((p) => ({ joueurId: p.id, games: choisissables(p.id) }))
          .filter((a) => a.games.length > 0),
      };
    });
    if (!vue) return fail('INTROUVABLE', 'Ce Pacte du Givre n’est plus en main : il a déjà été joué.');
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * Joue un Pacte du Givre : le joueur qui le garde a choisi une de ses games et
 * une game d'un autre joueur, la modération valide. Les deux games échangent
 * leur score.
 *
 * Le serveur vérifie tout : la carte est bien un Pacte encore gardé, son
 * porteur a assez de games, les deux games sont encore sans carte, l'autre
 * joueur est en lice. Un membre de la modération peut jouer le Pacte qu'il
 * garde (décidé le 02/11/2026) ; le journal garde qui a joué quoi, sur
 * quelles games.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-cartes-echange',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: echangeChoisiSchema,
  });
  if (!g.ok) return g.response;

  try {
    const resultat = await getStore().transaction((db) => {
      const carte = db.cartesEnAttente.find((c) => c.id === g.body.carteId);
      if (!carte) return 'CARTE' as const;
      const autreGame = db.games.find((x) => x.id === g.body.autreGameId);
      if (!autreGame || !joueursEnLice(db).some((p) => p.id === autreGame.playerId)) return 'AUTRE_GAME' as const;
      const joue = joueEchangeChoisi(db, carte.id, g.body.maGameId, g.body.autreGameId);
      if (typeof joue === 'string') return joue;
      const porteur = db.players.find((p) => p.id === carte.joueurId)?.pseudo ?? '?';
      const autre = db.players.find((p) => p.id === autreGame.playerId)?.pseudo ?? '?';
      audit(
        db,
        g.session?.sub ?? 'admin',
        'PACTE_JOUE',
        autreGame.playerId,
        `Pacte du Givre de ${porteur} avec ${autre} (games ${g.body.maGameId} et ${g.body.autreGameId}) : ${joue.resultat}`,
      );
      return joue;
    });
    if (resultat === 'CARTE') return fail('INTROUVABLE', 'Ce Pacte du Givre n’est plus en main : il a déjà été joué.');
    if (resultat === 'TROP_TOT') return fail('CONFLIT', 'Ce joueur n’a pas encore assez de games pour jouer son Pacte.');
    if (resultat === 'MA_GAME') return fail('CONFLIT', 'Cette game du porteur porte déjà une carte, ou n’est plus là.');
    if (resultat === 'AUTRE_GAME') return fail('CONFLIT', 'Cette game de l’autre joueur ne peut pas être échangée.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
