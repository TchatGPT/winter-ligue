import type { Database } from '@/lib/db/entities';
import { parametresSaison } from '@/lib/domain/rules';
import { origineDe } from './effects';
import { classementDe } from './league';

/**
 * Le bilan de la saison (18/11/2026) : les chiffres que le visuel de
 * Modération → Saison met en image, pour Discord. Tout se lit sur la base,
 * avec le classement du site : le premier ici est celui du classement.
 */
export interface BilanSaison {
  saison: { numero: number; nom: string; periode: string; finalistes: number };
  /** Les subs comptés cette saison. */
  subs: number;
  /** Les joueurs qui ont joué au moins une game. */
  joueurs: number;
  /** Les games qui comptent : sans celles passées au Joker. */
  games: number;
  kills: number;
  top1: number;
  /** Les Top 1, 2 et 3. */
  top3: number;
  /** Kills par game, sur toute la ligue. */
  killsParGame: number;
  /** Points par game, sur toute la ligue. */
  pointsParGame: number;
  /** La part des games finies Top 1, en pour cent. */
  tauxTop1: number;
  /** Le haut du classement : les six premiers — les finalistes en saison 2. */
  tete: { rang: number; pseudo: string; points: number; games: number; top1: number; kills: number }[];
  /**
   * Le dernier du classement, parmi ceux qui ont joué au moins la moitié des
   * games du plus assidu : pas un joueur passé pour trois games.
   */
  lanterne: { rang: number; pseudo: string; points: number; games: number } | null;
  meilleureGame: { pseudo: string; score: number; kills: number } | null;
  plusGrosKiller: { pseudo: string; kills: number } | null;
  roiDuTop1: { pseudo: string; top1: number } | null;
  boostersOuverts: number;
  duels: number;
}

const arrondi = (n: number, chiffres = 1) => Math.round(n * 10 ** chiffres) / 10 ** chiffres;

export function bilanSaison(db: Readonly<Database>): BilanSaison {
  const saison = parametresSaison(db.config.numero);
  const classement = classementDe(db as Database);
  const enLice = new Set(classement.map((r) => r.id));
  const ontJoue = classement.filter((r) => r.totals.countedGames > 0);

  // Les games des joueurs du classement, comptées une fois chacune, chez qui
  // les a jouées : une game échangée reste celle de son joueur.
  const games = db.games.filter((g) => !g.skipped && enLice.has(origineDe(g)));
  const kills = games.reduce((n, g) => n + g.kills, 0);
  const points = games.reduce((n, g) => n + g.score, 0);
  const top1 = games.filter((g) => g.placement === 1).length;
  const top3 = games.filter((g) => g.placement === 1 || g.placement === 2 || g.placement === 3).length;

  const pseudoDe = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? '—';
  const meilleure = [...games].sort((a, b) => b.score - a.score || b.kills - a.kills)[0];
  const killer = [...ontJoue].sort((a, b) => b.totals.totalKills - a.totals.totalKills)[0];
  const roi = [...ontJoue].sort((a, b) => b.totals.top1 - a.totals.top1 || a.rank - b.rank)[0];
  const assidu = Math.max(0, ...ontJoue.map((r) => r.totals.countedGames));
  const dernier = ontJoue.filter((r) => r.totals.countedGames >= Math.max(1, Math.floor(assidu / 2))).at(-1);
  const nbTete = Math.max(6, saison.finalistes);

  return {
    saison: { numero: saison.numero, nom: saison.nom, periode: saison.periode, finalistes: saison.finalistes },
    subs: db.config.totalSubs,
    joueurs: ontJoue.length,
    games: games.length,
    kills,
    top1,
    top3,
    killsParGame: games.length ? arrondi(kills / games.length) : 0,
    pointsParGame: games.length ? arrondi(points / games.length) : 0,
    tauxTop1: games.length ? arrondi((top1 / games.length) * 100) : 0,
    tete: ontJoue.slice(0, nbTete).map((r) => ({
      rang: r.rank,
      pseudo: r.pseudo,
      points: r.totals.totalScore,
      games: r.totals.countedGames,
      top1: r.totals.top1,
      kills: r.totals.totalKills,
    })),
    lanterne:
      dernier && dernier.rank > nbTete
        ? { rang: dernier.rank, pseudo: dernier.pseudo, points: dernier.totals.totalScore, games: dernier.totals.countedGames }
        : null,
    meilleureGame: meilleure ? { pseudo: pseudoDe(origineDe(meilleure)), score: meilleure.score, kills: meilleure.kills } : null,
    plusGrosKiller: killer && killer.totals.totalKills > 0 ? { pseudo: killer.pseudo, kills: killer.totals.totalKills } : null,
    roiDuTop1: roi && roi.totals.top1 > 0 ? { pseudo: roi.pseudo, top1: roi.totals.top1 } : null,
    boostersOuverts: db.ouvertures.length,
    duels: db.batailles.filter((b) => b.statut === 'TERMINEE').length,
  };
}
