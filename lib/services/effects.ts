import 'server-only';

/**
 * Résolution des cartes en attente, au moment où une game est saisie.
 *
 * C'est le seul endroit où une carte touche un score. La route qui enregistre
 * la game appelle `appliqueCartesEnAttente` juste après l'avoir créée ; chaque
 * carte posée sur ce joueur est traduite en points, journalisée dans
 * `game.applied` avec son delta exact, puis consommée.
 *
 * Deux invariants tenus ici :
 *
 *   1. Chaque modification de points passe par `applyPoints`, qui borne le
 *      cumul et journalise le delta **effectif** — pas le delta demandé.
 *   2. Un malus retire des points à sa cible et n'en donne jamais à personne
 *      d'autre — sauf les cartes à deux, qui opposent deux joueurs tirés au
 *      sort et sont bornées de chaque côté. Ce sont les seules branches qui
 *      touchent une autre game que celle qu'on saisit.
 */

import type { Database, Game } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { GAME_LIMITS, placementPoints } from '@/lib/domain/rules';
import type { CardDefinition } from '@/lib/domain/types';
import { credit } from './ledger';
import { recomputeGame } from './league';
import { facteurCartes } from '@/lib/services/evenements';

/**
 * Applique un delta de points à une game et le journalise.
 *
 * Le delta réellement appliqué peut être plus petit que demandé : le cumul de
 * bonus sur une même game est borné. Un évènement « cartes renforcées » majore
 * la demande **avant** le plafond — le plafond reste, une carte majorée n'en
 * sort pas. Le signe est conservé : un malus renforcé retire davantage.
 */
function applyPoints(
  db: Database,
  game: Game,
  card: CardDefinition,
  ouvertureId: string,
  requested: number,
): number {
  const before = game.bonusPoints;
  const majore = Math.round(requested * facteurCartes(db));
  const after = Math.max(
    GAME_LIMITS.minBonusPoints,
    Math.min(GAME_LIMITS.maxBonusPoints, before + majore),
  );
  const effective = after - before;

  game.applied.push({
    id: newId(),
    cardId: card.id,
    ouvertureId,
    points: effective,
    at: new Date().toISOString(),
  });
  game.bonusPoints = after;
  recomputeGame(db, game);
  return effective;
}

const signe = (n: number) => (n > 0 ? `+${n}` : String(n));

export interface CarteAppliquee {
  cardId: string;
  nom: string;
  points: number;
  resultat: string;
}

export interface ApplicationCartes {
  cartes: CarteAppliquee[];
  /** Ce que les cartes font aux flocons de la game : 1, ou 2 avec une Manne. */
  facteurFlocons: number;
}

/**
 * Consomme la carte **active** de ce joueur sur cette game : une seule.
 *
 * Une carte active à la fois. Si plusieurs attendent, c'est la plus ancienne
 * qui tombe sur cette game ; les suivantes restent en réserve et prendront la
 * relève, une par game. Deux cartes ne s'empilent jamais sur une même game —
 * c'est ce qui garde le plafond d'impact vrai game par game.
 */
export function appliqueCartesEnAttente(db: Database, game: Game): ApplicationCartes {
  const attente = db.cartesEnAttente
    .filter((c) => c.joueurId === game.playerId && c.consommeeA === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA))
    .slice(0, 1);

  const cartes: CarteAppliquee[] = [];
  let facteurFlocons = 1;
  const now = new Date().toISOString();

  for (const pendante of attente) {
    const card = getCard(pendante.cardId);
    pendante.consommeeA = now;
    pendante.gameId = game.id;
    if (!card) {
      pendante.resultat = 'carte inconnue, sans effet';
      continue;
    }

    let points = 0;
    let resultat: string;
    const effect = card.effect;

    switch (effect.kind) {
      case 'bonus_points': {
        points = applyPoints(db, game, card, pendante.ouvertureId, effect.value);
        resultat = `${signe(points)} pts`;
        break;
      }
      case 'kill_multiplier': {
        // Le multiplicateur devient un bonus plafonné : c'est mathématiquement
        // équivalent, et ça interdit d'empiler deux multiplicateurs.
        const raw = Math.min(effect.cap, Math.round(game.kills * (effect.value - 1)));
        points = applyPoints(db, game, card, pendante.ouvertureId, raw);
        resultat = `×${effect.value} sur ${game.kills} kills → ${signe(points)} pts`;
        break;
      }
      case 'points_per_kill': {
        const raw = Math.min(effect.cap, game.kills * effect.perKill);
        points = applyPoints(db, game, card, pendante.ouvertureId, raw);
        resultat = `${game.kills} kills → ${signe(points)} pts`;
        break;
      }
      case 'double_placement': {
        const bonus = placementPoints(game.placement);
        if (bonus === 0) {
          resultat = 'pas de Top 3, sans effet';
          break;
        }
        points = applyPoints(db, game, card, pendante.ouvertureId, bonus);
        resultat = `Top ${game.placement} doublé → ${signe(points)} pts`;
        break;
      }
      case 'plancher': {
        const manque = Math.max(0, effect.value - game.score);
        if (manque === 0) {
          resultat = `game déjà à ${game.score}, sans effet`;
          break;
        }
        points = applyPoints(db, game, card, pendante.ouvertureId, manque);
        resultat = `remontée à ${game.score} pts (${signe(points)})`;
        break;
      }
      case 'snowflakes': {
        // Normalement créditée à l'ouverture ; si une carte est arrivée ici
        // quand même, on la paie plutôt que de la perdre.
        credit(db, game.playerId, effect.value, 'CARTE', pendante.ouvertureId);
        resultat = `+${effect.value} flocons`;
        break;
      }
      case 'flocons_doubles': {
        facteurFlocons = 2;
        resultat = 'flocons de la game doublés';
        break;
      }
      case 'malus_points': {
        points = applyPoints(db, game, card, pendante.ouvertureId, -effect.value);
        resultat = `${signe(points)} pts`;
        break;
      }
      case 'echange_kills':
      case 'duel': {
        /*
         * Une carte à deux. La première game saisie attend l'autre ; la seconde
         * résout la paire, sur les deux games à la fois. La carte de l'autre
         * joueur garde son `gameId` comme trace de « quelle game » — c'est ce
         * qui permet de retrouver la première quand la seconde arrive.
         */
        const autre = db.cartesEnAttente.find(
          (c) => c.paireId !== null && c.paireId === pendante.paireId && c.id !== pendante.id,
        );
        const autreGame = autre?.gameId ? db.games.find((g) => g.id === autre.gameId) : undefined;
        const pseudoAutre = autre
          ? (db.players.find((p) => p.id === autre.joueurId)?.pseudo ?? 'l’autre')
          : 'l’autre';

        if (!autre) {
          resultat = 'sans adversaire, sans effet';
          break;
        }
        if (!autreGame) {
          resultat = `en attente de la prochaine game de ${pseudoAutre}`;
          break;
        }

        if (effect.kind === 'echange_kills') {
          // Ce que l'un reçoit, l'autre le cède : la somme est nulle, et chaque
          // côté est borné par le plafond de la carte.
          const ecart = Math.max(-effect.cap, Math.min(effect.cap, autreGame.kills - game.kills));
          points = applyPoints(db, game, card, pendante.ouvertureId, ecart);
          const rendu = applyPoints(db, autreGame, card, autre.ouvertureId, -ecart);
          resultat = `${game.kills} kills contre ${autreGame.kills} → ${signe(points)} pts`;
          autre.resultat = `${autreGame.kills} kills contre ${game.kills} → ${signe(rendu)} pts`;
        } else {
          // Le duel se juge sur les games telles qu'elles sont à cet instant,
          // cartes déjà tombées comprises. Égalité : personne ne bouge.
          const moi = game.score;
          const lui = autreGame.score;
          if (moi === lui) {
            resultat = `égalité ${moi} à ${lui}, sans effet`;
            autre.resultat = `égalité ${lui} à ${moi}, sans effet`;
          } else {
            const jeGagne = moi > lui;
            points = applyPoints(db, game, card, pendante.ouvertureId, jeGagne ? effect.gain : -effect.perte);
            const rendu = applyPoints(
              db,
              autreGame,
              card,
              autre.ouvertureId,
              jeGagne ? -effect.perte : effect.gain,
            );
            resultat = `${moi} contre ${lui} → ${signe(points)} pts`;
            autre.resultat = `${lui} contre ${moi} → ${signe(rendu)} pts`;
          }
        }
        break;
      }
    }

    pendante.resultat = resultat;
    cartes.push({ cardId: card.id, nom: card.name, points, resultat });
  }

  return { cartes, facteurFlocons };
}
