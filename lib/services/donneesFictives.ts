import 'server-only';
import type { Database, Game, OuverturePack, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { cartesDuPack, getCard, momentDe } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import { parametresSaison, PREFIXE_OUVERTURE_TEST, TOPS } from '@/lib/domain/rules';
import type { PackId, Placement } from '@/lib/domain/types';
import { rattacheCompteTwitch } from './comptes';
import { appliqueCartesEnAttente, carteQuiAttend, regleCartesSansAttendre } from './effects';
import { recomputeGame } from './league';
import { audit, credit } from './ledger';
import { ajoutePackDu, PackError } from './packs';

/**
 * Des joueurs fictifs, pour essayer les cartes et les ouvertures en vrai
 * (demandé par l'organisation le 12/11/2026) : depuis la page de test de la
 * modération (Test des cartes → Données fictives), ou par
 * `scripts/fictifs.ts`. Ils passent par les mêmes services que le site :
 * games saisies et réglées comme à la saisie, flocons au grand livre, cartes
 * posées comme à une ouverture.
 *
 * Les fictifs se reconnaissent à leur identifiant Twitch (`fictif-…`) :
 * `retireDonneesFictives` les efface, eux et tout ce qui leur appartient —
 * games, flocons, cartes, boosters. Les ouvertures de leurs cartes sont
 * marquées de test : l'overlay du live ne les joue pas, le tchat ne les
 * annonce pas. Le journal, en ajout seul, garde la trace de tout.
 */

export const PREFIXE_FICTIF = 'fictif-';
const RAISON = 'données fictives';

const PSEUDOS = [
  'GlaçonFou', 'Nordik_77', 'SnowSniper', 'xBlizzardx', 'Frimas', 'IcyKaze',
  'PoudreuseTTV', 'Yéti_Ranked', 'Verglacée', 'K0ldShot', 'Aurora_FPS', 'Flocon2Neige',
  'Banquise', 'Sibérien', 'ColdTurkey', 'Gel_Matinal', 'FrostByte', 'Stalactite',
  'Igloo_Boss', 'AvalancheJoe', 'Pingoo', 'MorseTactique', 'Givrelame', 'ArcticWolf',
];

/** Un hasard rejouable : la même graine, les mêmes données. */
function hasard(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const estFictif = (p: Pick<Player, 'twitchId'>) => p.twitchId?.startsWith(PREFIXE_FICTIF) ?? false;

/** Combien de joueurs fictifs sont dans la ligue. */
export function nombreDeFictifs(db: Readonly<Database>): number {
  return db.players.filter(estFictif).length;
}

/** Pose une carte sur un joueur comme à une ouverture, déjà révélée, marquée de test. */
function poseCarte(db: Database, joueur: Player, packId: PackId, cardId: string, le: Date, acteur: string): boolean {
  const card = getCard(cardId)!;
  const moment = momentDe(card.effect);
  if ((moment === 'PROCHAINE' || moment === 'JOUEE') && carteQuiAttend(db, joueur.id)) return false;
  const o: OuverturePack = {
    id: newId(),
    packId,
    cardId,
    rarity: card.rarity,
    joueurId: packId === 'perso' || packId === 'finisseur' ? joueur.id : null,
    beneficiaires: [joueur.id],
    chance: 0,
    ouvertPar: acteur,
    openedAt: le.toISOString(),
    idempotencyKey: `${PREFIXE_OUVERTURE_TEST}${PREFIXE_FICTIF}${newId()}`,
    annonceeA: le.toISOString(),
  };
  db.ouvertures.push(o);
  db.cartesEnAttente.push({
    id: newId(),
    joueurId: joueur.id,
    cardId,
    ouvertureId: o.id,
    creeA: le.toISOString(),
    consommeeA: null,
    gameId: null,
    resultat: null,
    paireId: null,
  });
  regleCartesSansAttendre(db, joueur.id, le, true);
  return true;
}

/** Une game saisie comme par la modération, à une date passée. */
function saisit(db: Database, joueur: Player, kills: number, placement: Placement, le: Date): Game {
  const game: Game = {
    id: newId(),
    playerId: joueur.id,
    kills,
    placement,
    bonusPoints: 0,
    skipped: false,
    score: 0,
    note: null,
    playedAt: le.toISOString(),
    createdAt: le.toISOString(),
    applied: [],
  };
  db.games.push(game);
  recomputeGame(db, game);
  const cartes = appliqueCartesEnAttente(db, game, { meilleurKills: null });
  const reward = rewardForGame(game.kills, game.placement);
  credit(db, joueur.id, Math.round(reward.total * cartes.facteurFlocons), 'GAME', game.id);
  regleCartesSansAttendre(db, joueur.id, le);
  return game;
}

export interface BilanFictif {
  joueurs: number;
  games: number;
  cartes: number;
  boosters: number;
}

/**
 * Ajoute 24 joueurs fictifs, leurs games, leurs flocons et leurs cartes, et
 * 7 boosters de la ligue à ouvrir. À appeler dans une transaction. Les deux
 * plus avancés s'arrêtent juste avant le palier du Booster Finisseur : une
 * game de plus le fait tomber.
 */
export function ajouteDonneesFictives(db: Database, acteur: string, now = new Date()): BilanFictif {
  if (db.players.some(estFictif)) {
    throw new PackError('Les données fictives sont déjà là : retire-les d’abord.', 'DEJA_OUVERT');
  }
  const r = hasard(20261112);
  const entier = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const un = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)];
  const perso = cartesDuPack('perso').filter((c) => c.id !== 'joker-givre');
  const aJouer = perso.filter((c) => momentDe(c.effect) === 'PROCHAINE');
  const gardees = ['plaque-verglas', 'pacte-du-givre'].filter((id) => getCard(id));
  const palier = Math.min(parametresSaison(db.config.numero).finisseurA, db.config.maxGamesPerPlayer);
  const max = Math.max(1, palier - 1);
  // Une game toutes les treize heures, les plus avancés commençant il y a un mois.
  const debut = now.getTime() - (max + 2) * 13 * 3_600_000;

  const joueurs = PSEUDOS.map((pseudo, i) =>
    rattacheCompteTwitch(db, {
      id: `${PREFIXE_FICTIF}${String(i + 1).padStart(2, '0')}`,
      login: `${PREFIXE_FICTIF}${pseudo.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      displayName: pseudo,
      avatarUrl: null,
      roleChaine: 'joueur',
    }),
  );

  let games = 0;
  let cartes = 0;
  joueurs.forEach((joueur, i) => {
    // Du nouveau venu (2 à 5 games) à qui est juste avant le Finisseur ; un niveau propre à chacun.
    const nb = i < 2 ? max : i > 20 ? Math.min(max, entier(2, 5)) : Math.max(1, entier(Math.min(6, max), max - 3));
    const niveau = 0.4 + r() * 1.2;
    for (let k = 0; k < nb; k += 1) {
      const le = new Date(debut + k * 13 * 3_600_000 + i * 7 * 60_000);
      // Une carte du Perso toutes les cinq games environ : elle tombe sur la suivante.
      if (r() < 0.2 && poseCarte(db, joueur, 'perso', un(perso).id, le, acteur)) cartes += 1;
      const kills = Math.max(0, Math.round((2 + r() * 12) * niveau));
      const tirage = r();
      const placement: Placement =
        tirage < 0.07 ? 1 : tirage < 0.15 ? 2 : tirage < 0.24 ? 3 : tirage < 0.6 ? un(TOPS.filter((t) => t > 3)) : null;
      saisit(db, joueur, kills, placement, new Date(le.getTime() + 60_000));
      games += 1;
    }
    // Des flocons d'avance pour quelques-uns : la chance au booster varie.
    if (r() < 0.4) credit(db, joueur.id, entier(1, 9) * 1_000, 'AJUSTEMENT_ADMIN', `${PREFIXE_FICTIF}flocons`);
    // Une carte active pour deux sur trois : elle attend sa prochaine game.
    if (r() < 0.66 && poseCarte(db, joueur, 'perso', un(aJouer).id, now, acteur)) cartes += 1;
    // Quelques cartes gardées, à jouer depuis le classement.
    if (i % 6 === 3 && gardees.length) {
      if (poseCarte(db, joueur, 'perso', gardees[((i / 6) | 0) % gardees.length], now, acteur)) cartes += 1;
    }
  });
  // Les cartes gardées du Folie et du Finisseur, une chacune.
  const garde = (i: number, packId: PackId, cardId: string) => {
    if (getCard(cardId) && poseCarte(db, joueurs[i], packId, cardId, now, acteur)) cartes += 1;
  };
  garde(4, 'folie', 'cryogenisation');
  garde(10, 'finisseur', 'troc-des-neiges');
  garde(16, 'finisseur', 'eboulement');

  // Des boosters de la ligue à ouvrir, pour essayer les tirages.
  for (let k = 0; k < 4; k += 1) ajoutePackDu(db, 'commu', null, RAISON);
  for (let k = 0; k < 3; k += 1) ajoutePackDu(db, 'folie', null, RAISON);

  const bilan = { joueurs: joueurs.length, games, cartes, boosters: 7 };
  audit(
    db,
    acteur,
    'DONNEES_FICTIVES',
    null,
    `${bilan.joueurs} joueurs fictifs, ${games} games, ${cartes} cartes, ${bilan.boosters} boosters de la ligue`,
  );
  return bilan;
}

/**
 * Retire les joueurs fictifs et tout ce qui leur appartient. À appeler dans
 * une transaction. Les vrais joueurs ne perdent rien de ce qui leur est
 * propre ; une game d'un vrai joueur touchée par une carte qui visait aussi un
 * fictif garde sa trace.
 */
export function retireDonneesFictives(db: Database, acteur: string): Omit<BilanFictif, 'boosters'> {
  const ids = new Set(db.players.filter(estFictif).map((p) => p.id));
  if (ids.size === 0) return { joueurs: 0, games: 0, cartes: 0 };
  const avant = { games: db.games.length, cartes: db.cartesEnAttente.length };
  const ouvertures = new Set(
    db.ouvertures
      .filter((o) => o.idempotencyKey.startsWith(`${PREFIXE_OUVERTURE_TEST}${PREFIXE_FICTIF}`))
      .map((o) => o.id),
  );
  db.players = db.players.filter((p) => !ids.has(p.id));
  db.games = db.games.filter((g) => !ids.has(g.playerId));
  db.ledger = db.ledger.filter((l) => !ids.has(l.playerId));
  db.cartesEnAttente = db.cartesEnAttente.filter((c) => !ids.has(c.joueurId) && !ouvertures.has(c.ouvertureId));
  db.packsDus = db.packsDus.filter((d) => !(d.joueurId && ids.has(d.joueurId)) && d.raison !== RAISON);
  db.ouvertures = db.ouvertures
    .filter((o) => !ouvertures.has(o.id))
    .map((o) => ({
      ...o,
      beneficiaires: o.beneficiaires.filter((b) => !ids.has(b)),
      joueurId: o.joueurId && ids.has(o.joueurId) ? null : o.joueurId,
    }));
  db.batailles = db.batailles.filter((b) => !ids.has(b.hoteId) && !(b.adversaireId && ids.has(b.adversaireId)));
  audit(db, acteur, 'DONNEES_FICTIVES_RETIREES', null, `${ids.size} joueurs fictifs retirés`);
  return {
    joueurs: ids.size,
    games: avant.games - db.games.length,
    cartes: avant.cartes - db.cartesEnAttente.length,
  };
}
