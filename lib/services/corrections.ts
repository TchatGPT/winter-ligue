import 'server-only';

/**
 * Corriger ou supprimer une game déjà saisie : la capture était mal lue, la
 * game n'était pas la sienne. Réservé à la modération — les routes le
 * vérifient —, et toujours dans la transaction de l'appelant.
 *
 * **Corriger** : les kills et le placement changent, le score se réécrit, les
 * cartes de la game se relisent (`recalculeCartesDeLaGame`), et ses flocons
 * suivent : la différence passe au grand livre, référencée par la game.
 *
 * **Supprimer** : la game quitte le classement, les flocons qu'elle a versés
 * sont repris — jamais sous zéro —, et sa carte est rendue au joueur
 * (`rendCartesDeLaGame`) ; puis ce qui peut se régler se règle.
 *
 * Le journal garde, pour chaque geste, qui l'a fait et ce qu'il a changé.
 */

import type { Database, Game } from '@/lib/db/entities';
import { getCard } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import type { Placement } from '@/lib/domain/types';
import { cartesQuiFigentLaGame, recalculeCartesDeLaGame, regleCartesSansAttendre, rendCartesDeLaGame } from './effects';
import { facteurGain } from './evenements';
import { adjust, audit } from './ledger';

/** Ce qu'une game a versé en flocons à son joueur, corrections comprises. */
export function floconsDeLaGame(db: Database, game: Game): number {
  return db.ledger
    .filter((e) => e.playerId === game.playerId && e.refId === game.id)
    .reduce((n, e) => n + e.delta, 0);
}

const top = (p: Placement) => (p === null ? 'hors top 3' : `Top ${p}`);
const signe = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

export type Refus = 'INTROUVABLE' | { refus: string };

export interface Correction {
  game: Game;
  avant: { kills: number; placement: Placement; score: number };
  /** Les flocons rendus (positif) ou repris (négatif) au joueur. */
  flocons: number;
  cartes: { nom: string; avant: number; apres: number }[];
}

/** Corrige les kills et le placement d'une game. Voir l'en-tête du fichier. */
export function corrigeGame(
  db: Database,
  acteur: string,
  gameId: string,
  voulu: { kills: number; placement: Placement },
): Correction | Refus {
  const game = db.games.find((g) => g.id === gameId);
  if (!game) return 'INTROUVABLE';
  const figees = cartesQuiFigentLaGame(db, game);
  if (figees.length > 0) {
    return {
      refus: `Cette game porte ${figees.join(', ')} : ses kills ne se corrigent pas. Supprime-la, puis ressaisis-la.`,
    };
  }

  const avant = { kills: game.kills, placement: game.placement, score: game.score };
  if (voulu.kills === avant.kills && voulu.placement === avant.placement) {
    return { game, avant, flocons: 0, cartes: [] };
  }
  game.kills = voulu.kills;
  game.placement = voulu.placement;
  const cartes = recalculeCartesDeLaGame(db, game, avant);

  // Les flocons suivent la game : ce qu'elle a versé, à l'échelle de sa
  // nouvelle récompense — une Manne, un évènement, un solde plafonné gardent
  // ainsi leur effet. Une game passée n'a rien versé, et ne verse rien.
  let flocons = 0;
  const joueur = db.players.find((p) => p.id === game.playerId);
  if (joueur && !game.skipped) {
    const verses = floconsDeLaGame(db, game);
    const ancienne = rewardForGame(avant.kills, avant.placement).total;
    const nouvelle = rewardForGame(game.kills, game.placement).total;
    const facteur = ancienne > 0 ? verses / ancienne : facteurGain(db);
    const cible = Math.max(0, Math.round(nouvelle * facteur));
    if (cible !== verses) {
      const solde = joueur.snowflakes;
      adjust(db, joueur.id, cible - verses, game.id);
      flocons = joueur.snowflakes - solde;
    }
  }

  audit(
    db,
    acteur,
    'GAME_CORRIGEE',
    game.playerId,
    `${avant.kills} → ${game.kills} kills, ${top(avant.placement)} → ${top(game.placement)}, ` +
      `${avant.score} → ${game.score} pts` +
      (flocons ? `, ${signe(flocons)} ❄` : '') +
      (cartes.length ? ` — ${cartes.map((c) => `${c.nom} ${signe(c.avant)} → ${signe(c.apres)}`).join(', ')}` : ''),
  );
  return { game, avant, flocons, cartes };
}

export interface Suppression {
  game: Game;
  /** Les flocons repris au joueur (négatif ou nul). */
  flocons: number;
  rendues: string[];
  perdues: string[];
}

/** Supprime une game. Voir l'en-tête du fichier. */
export function supprimeGame(db: Database, acteur: string, gameId: string): Suppression | Refus {
  const game = db.games.find((g) => g.id === gameId);
  if (!game) return 'INTROUVABLE';
  // Un échange lie cette game à celle d'un autre joueur : la retirer laisserait
  // l'autre moitié sans contrepartie.
  if (db.cartesEnAttente.some((c) => c.gameId === game.id && getCard(c.cardId)?.effect.kind === 'echange')) {
    return { refus: 'Cette game est liée à celle d’un autre joueur par un échange : elle ne se supprime pas.' };
  }

  let flocons = 0;
  const joueur = db.players.find((p) => p.id === game.playerId);
  const verses = floconsDeLaGame(db, game);
  if (joueur && verses > 0) {
    const solde = joueur.snowflakes;
    adjust(db, joueur.id, -verses, game.id);
    flocons = joueur.snowflakes - solde;
  }
  const { rendues, perdues } = rendCartesDeLaGame(db, game);
  db.games = db.games.filter((g) => g.id !== game.id);
  // Une carte rendue qui relève une game jouée se règle sur une autre, s'il y en a.
  regleCartesSansAttendre(db, game.playerId);

  audit(
    db,
    acteur,
    'GAME_SUPPRIMEE',
    game.playerId,
    `${game.kills} kills, ${top(game.placement)}, ${game.score} pts` +
      (flocons ? `, ${signe(flocons)} ❄` : '') +
      (rendues.length ? ` — carte rendue : ${rendues.join(', ')}` : '') +
      (perdues.length ? ` — carte perdue (il en avait déjà une) : ${perdues.join(', ')}` : ''),
  );
  return { game, flocons, rendues, perdues };
}
