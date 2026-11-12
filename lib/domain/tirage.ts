/**
 * Ce que l'écran et l'overlay déroulent après la carte : les joueurs tirés,
 * puis les games que la carte touche. Module pur : le serveur a tout tiré à
 * l'ouverture (`ouvrePack`, `choisitGamesRoue`) ; ici, on ne fait que le
 * mettre en forme, sans identifiant.
 */

import type { GameMontree, GamesTirees } from '@/lib/db/entities';
import type { Placement } from '@/lib/domain/types';

/**
 * Le second tirage d'une ouverture, tel que l'écran le rejoue : qui a été tiré,
 * et parmi qui.
 *
 * Il n'existe que pour un booster de la ligue dont la carte tombe sur des
 * joueurs tirés au sort (`joueursTires`) : tout le monde, la tête ou la queue
 * du classement ne se tirent pas, et un booster ouvert pour un joueur va à ce
 * joueur — sauf quand la carte prend de ses games (`sansJoueurs`) : seules
 * celles-ci se déroulent. Le serveur a tiré dans la transaction de l'ouverture
 * (`beneficiairesDe`) ; l'écran ne fait que dérouler ce tirage, comme le rail
 * déroule la carte.
 */
export interface TirageJoueurs {
  /** Les joueurs tirés, dans l'ordre du tirage. */
  gagnants: string[];
  /** Ceux qui défilent devant le repère : les joueurs en lice. */
  joueurs: string[];
  /**
   * La Roulette russe : pas de rail, une course à six, où le premier des
   * `gagnants` est celui qui ne passe pas la ligne.
   */
  course?: boolean;
  /**
   * Vrai quand le booster s'ouvre pour un joueur : il n'y a pas de joueur à
   * tirer, seulement ses games à dérouler.
   */
  sansJoueurs?: boolean;
  /** Le troisième tirage : les games que la carte touche (`GamesAuTirage`). */
  games?: GamesAuTirage | null;
}

/** Une game au tirage, telle que l'écran la montre. */
export interface GameAuTirage {
  numero: number;
  score: number;
  kills: number;
  top: Placement;
}

/**
 * Les games tirées à l'ouverture, pour l'écran et l'overlay : celles de
 * `GamesTirees`, sans les identifiants, alignées sur `gagnants`.
 */
export interface GamesAuTirage {
  hasard: boolean;
  lien: 'echange' | 'copie' | 'fusion' | null;
  parJoueur: ({ pseudo: string; libelle: string; visees: GameAuTirage[]; parmi: GameAuTirage[] } | null)[];
}

/** Ce que l'écran a besoin de savoir des games tirées : ni identifiant de joueur, ni de game. */
export function gamesAuTirage(games: GamesTirees | null | undefined): GamesAuTirage | null {
  if (!games) return null;
  const vue = ({ numero, score, kills, top }: GameMontree): GameAuTirage => ({ numero, score, kills, top });
  return {
    hasard: games.hasard,
    lien: games.lien ?? null,
    parJoueur: games.parJoueur.map((e) =>
      e ? { pseudo: e.pseudo, libelle: e.libelle, visees: e.visees.map(vue), parmi: e.parmi.map(vue) } : null,
    ),
  };
}
