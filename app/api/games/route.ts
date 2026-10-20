import { NextResponse } from 'next/server';
import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { deleteGameSchema, gameSchema, updateGameSchema } from '@/lib/api/schemas';
import type { Game } from '@/lib/db/entities';
import { getStore, newId } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import { LIMITS } from '@/lib/security/ratelimit';
import { appliqueCartesEnAttente, jokerDe, regleCartesSansAttendre, utiliseJoker } from '@/lib/services/effects';
import { gamesComptees, limiteDe, recomputeGame } from '@/lib/services/league';
import { corrigeGame, supprimeGame, type Correction } from '@/lib/services/corrections';
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
 *
 * La limite de games est celle de la saison, plus les créneaux qu'une carte
 * « Game supplémentaire » a donnés à ce joueur.
 *
 * Un membre de la modération qui joue peut saisir ses propres games : la
 * capture fait foi, le score se calcule ici, et le journal garde qui a saisi.
 *
 * Le Joker : si le joueur en garde un, la modération peut le servir sur cette
 * game. Elle est enregistrée, passée — ni points, ni flocons, ni carte active,
 * qui attend la game suivante — et le Joker est consommé.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-create',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: gameSchema,
  });
  if (!g.ok) return g.response;

  try {
    const result = await getStore().transaction((db) => {
      const player = db.players.find((p) => p.id === g.body.playerId);
      if (!player) return { error: 'JOUEUR' as const };
      // La streameuse ne joue pas : quoi que propose l'écran, aucune game.
      if (estLaStreameuse(player, chaineDeLaLigue())) return { error: 'STREAMEUSE' as const };

      if (gamesComptees(db, player.id) >= limiteDe(db, player)) return { error: 'LIMITE' as const };
      if (g.body.joker && !jokerDe(db, player.id)) return { error: 'JOKER' as const };

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

      if (g.body.joker) {
        // Le Joker : la game reste visible, mais ne compte pas. Rien d'autre ne
        // se règle dessus.
        game.skipped = true;
        recomputeGame(db, game);
        const joker = utiliseJoker(db, game)!;
        audit(
          db,
          g.session?.sub ?? 'admin',
          'GAME_JOKER',
          player.id,
          `${game.kills} kills — Joker joué : la game ne compte pas`,
        );
        return {
          game,
          reward: rewardForGame(0, null),
          payout: 0,
          cartes: [joker],
          finisseur: false,
        };
      }
      recomputeGame(db, game);

      // La carte active de ce joueur tombe maintenant, et disparaît.
      const cartes = appliqueCartesEnAttente(db, game, { meilleurKills: g.body.meilleurKills ?? null });

      const reward = rewardForGame(game.kills, game.placement);
      // Une Manne double les flocons de cette game ; un évènement « flocons
      // doublés » en cours s'applique à tout le monde, et se cumule avec elle :
      // elle est personnelle et consommée, lui est collectif et gratuit.
      const payout = Math.round(reward.total * cartes.facteurFlocons * facteurGain(db));
      credit(db, player.id, payout, 'GAME', game.id);

      // La dernière game de la saison vaut un pack Finisseur, mis en file.
      const finisseur = verifieFinisseur(db, player.id);

      // Ce qui n'attend pas une nouvelle game se règle : une carte qui relève
      // une game déjà jouée, et, si c'était sa dernière game, celles qui
      // attendaient encore une prochaine.
      const suite = regleCartesSansAttendre(db, player.id);
      const toutes = [...cartes.cartes, ...suite];

      audit(
        db,
        g.session?.sub ?? 'admin',
        'GAME_ENREGISTREE',
        player.id,
        `${game.kills} kills — ${game.score} pts${
          toutes.length ? ` — cartes : ${toutes.map((c) => `${c.nom} (${c.resultat})`).join(', ')}` : ''
        }`,
      );

      return { game, reward, payout, cartes: toutes, finisseur: finisseur !== null };
    });

    if ('error' in result) {
      if (result.error === 'STREAMEUSE') {
        return fail('CONFLIT', 'La streameuse ne joue pas dans la ligue : aucune game ne lui est attribuée.');
      }
      if (result.error === 'JOKER') return fail('CONFLIT', 'Ce joueur n’a pas de Joker à jouer.');
      return result.error === 'JOUEUR'
        ? fail('INTROUVABLE', 'Joueur introuvable.')
        : fail('CONFLIT', 'Ce joueur a atteint sa limite de games pour la saison.');
    }
    return ok(result);
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * Corrige une game — ses kills, son placement —, la passe (elle ne compte
 * plus) ou modifie sa note.
 *
 * Une correction réécrit le score, relit les cartes de la game et ajuste ses
 * flocons (`corrigeGame`) : la capture était mal lue, la game doit valoir ce
 * qu'elle aurait valu. Un membre de la modération peut corriger ses propres
 * games, comme il les saisit : le score se calcule ici.
 *
 * Rétablir une game passée la fait compter de nouveau : on vérifie donc la
 * limite, comme à la saisie — sinon, passer puis rétablir aurait permis de
 * dépasser le nombre de games de la saison.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-update',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: updateGameSchema,
  });
  if (!g.ok) return g.response;

  const updated = await getStore().transaction((db) => {
    const game = db.games.find((x) => x.id === g.body.gameId);
    if (!game) return null;
    let correction: Correction | null = null;
    if (g.body.kills !== undefined || g.body.placement !== undefined) {
      const r = corrigeGame(db, g.session?.sub ?? 'admin', game.id, {
        kills: g.body.kills ?? game.kills,
        placement: g.body.placement !== undefined ? g.body.placement : game.placement,
      });
      if (r === 'INTROUVABLE') return null;
      if ('refus' in r) return r;
      correction = r;
    }
    if (g.body.skipped === undefined && g.body.note === undefined) return { game, correction };
    if (g.body.skipped === false && game.skipped) {
      // Une game qu'un Joker a annulée, ou qu'un Grand Dégel a supprimée,
      // reste hors du compte : la rétablir rendrait la carte sans effet.
      if (
        db.cartesEnAttente.some((c) => {
          const genre = getCard(c.cardId)?.effect.kind;
          return c.gameId === game.id && (genre === 'joker' || genre === 'supprime_pire');
        })
      ) {
        return 'JOKER' as const;
      }
      const joueur = db.players.find((p) => p.id === game.playerId);
      if (joueur && gamesComptees(db, joueur.id) >= limiteDe(db, joueur)) return 'LIMITE' as const;
    }
    if (g.body.skipped !== undefined) game.skipped = g.body.skipped;
    if (g.body.note !== undefined) game.note = g.body.note ?? null;
    recomputeGame(db, game);
    audit(db, g.session?.sub ?? 'admin', 'GAME_MODIFIEE', game.playerId, game.id);
    return { game, correction };
  });

  if (!updated) return fail('INTROUVABLE', 'Game introuvable.');
  if (updated === 'JOKER') return fail('CONFLIT', 'Cette game a été annulée par une carte (Joker ou Grand Dégel) : elle ne peut pas compter.');
  if (updated === 'LIMITE') return fail('CONFLIT', 'Ce joueur a déjà toutes ses games : celle-ci ne peut pas compter.');
  if ('refus' in updated) return fail('CONFLIT', updated.refus);
  return ok(updated);
}

/**
 * Supprime une game saisie par erreur : elle quitte le classement, les
 * flocons qu'elle a versés sont repris (jamais sous zéro), et sa carte est
 * rendue au joueur (`supprimeGame`).
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'game-delete',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: deleteGameSchema,
  });
  if (!g.ok) return g.response;

  const resultat = await getStore().transaction((db) => supprimeGame(db, g.session?.sub ?? 'admin', g.body.gameId));
  if (resultat === 'INTROUVABLE') return fail('INTROUVABLE', 'Game introuvable.');
  if ('refus' in resultat) return fail('CONFLIT', resultat.refus);
  return ok({ supprimee: true, flocons: resultat.flocons, rendues: resultat.rendues, perdues: resultat.perdues });
}
