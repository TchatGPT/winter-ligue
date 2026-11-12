import 'server-only';
import type { Database } from '@/lib/db/entities';
import { parametresSaison, RESPONSABLES_SAISON } from '@/lib/domain/rules';
import { donneJokersDeDepart } from './effects';
import { adjust, audit } from './ledger';
import { joueursEnLice } from './packs';

/**
 * Lancer une saison (décidé le 12/11/2026) : la Mini Ligue le 1er décembre,
 * la saison 2 le 4 janvier. Réservé aux responsables de la saison
 * (`RESPONSABLES_SAISON`, Jeex3), lus en base par leur identifiant Twitch.
 */
export function estResponsableSaison(db: Readonly<Database>, joueurId: string | null): boolean {
  if (!joueurId) return false;
  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  return joueur?.twitchId != null && RESPONSABLES_SAISON.includes(joueur.twitchId);
}

export interface BilanSaison {
  numero: number;
  nom: string;
  games: number;
  joueurs: number;
  supprimees: { games: number; boosters: number; cartes: number; duels: number };
}

/**
 * Remet la ligue à zéro et lance la saison `numero`. À appeler dans une
 * transaction.
 *
 * Tout ce qui fait le jeu repart de zéro : les games, les boosters en file et
 * ouverts, les cartes, les duels, les évènements, les codes cadeaux, le
 * compteur de subs. Chaque joueur garde son compte et son pseudo, retombe à
 * 0 flocon — par le grand livre (`adjust`), qui garde la trace —, perd ses
 * créneaux, son immunité, sa série de cadeaux, ses subs offerts, et reçoit
 * ses trois Jokers de départ. Le registre des subs n'est pas effacé : il ne
 * compte plus que ce qui suit la remise à zéro (`remiseA`). Le grand livre et
 * le journal restent, pour l'histoire.
 */
export function nouvelleSaison(db: Database, numero: number, acteur: string, now = new Date()): BilanSaison {
  const saison = parametresSaison(numero);
  const supprimees = {
    games: db.games.length,
    boosters: db.packsDus.length,
    cartes: db.cartesEnAttente.length,
    duels: db.batailles.length,
  };

  db.games = [];
  db.packsDus = [];
  db.ouvertures = [];
  db.cartesEnAttente = [];
  db.batailles = [];
  db.evenements = [];
  db.subEvents = [];
  db.codesCadeaux = [];

  const ref = `saison-${saison.numero}`;
  for (const p of db.players) {
    if (p.snowflakes > 0) adjust(db, p.id, -p.snowflakes, ref);
    p.subsOfferts = 0;
    p.creneauxBonus = 0;
    p.immuniseJusqua = null;
    p.cadeauDernier = null;
    p.cadeauSerie = 0;
  }
  const enLice = joueursEnLice(db);
  for (const p of enLice) donneJokersDeDepart(db, p.id, now);

  db.config = {
    ...db.config,
    numero: saison.numero,
    maxGamesPerPlayer: saison.games,
    totalSubs: 0,
    seasonStartsAt: saison.debut,
    seasonEndsAt: saison.fin,
    remiseA: now.toISOString(),
  };

  audit(
    db,
    acteur,
    'NOUVELLE_SAISON',
    null,
    `${saison.nom} lancée : ${saison.games} games ; supprimés ${supprimees.games} games, ${supprimees.boosters} boosters, ${supprimees.cartes} cartes, ${supprimees.duels} duels ; ${enLice.length} joueurs remis à zéro`,
  );
  return { numero: saison.numero, nom: saison.nom, games: saison.games, joueurs: enLice.length, supprimees };
}
