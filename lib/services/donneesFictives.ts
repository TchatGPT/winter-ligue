import 'server-only';
import type { Database, Game, OuverturePack, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { MANCHES_POSSIBLES } from '@/lib/domain/bataille';
import { cartesDuPack, getCard, momentDe } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import { DUEL, parametresSaison, PREFIXE_OUVERTURE_TEST, TOPS } from '@/lib/domain/rules';
import type { PackId, Placement } from '@/lib/domain/types';
import { creeBataille, rejointBataille } from './batailles';
import { rattacheCompteTwitch } from './comptes';
import { appliqueCartesEnAttente, carteQuiAttend, jokerDe, regleCartesSansAttendre, utiliseJoker } from './effects';
import { recomputeGame } from './league';
import { audit, credit } from './ledger';
import { ajoutePackDu, ouvrePack } from './packs';
import { addSubs } from './subs';

/**
 * Des données fictives, pour essayer la ligue en vrai avant son lancement
 * (demandé par l'organisation le 12/11/2026) : depuis la page de test de la
 * modération (Test des cartes → Données fictives), ou par
 * `scripts/fictifs.ts`.
 *
 * Tout passe par les services du site, comme si la ligue avait vécu : des
 * games saisies et leurs cartes consommées, des Jokers joués, des flocons au
 * grand livre, des subs et leurs paliers — évènements, boosters de la ligue —,
 * des boosters déjà ouverts et leurs cartes réglées, des duels joués, et des
 * cartes actives ou gardées. Pendant qu'elles se font, les vrais joueurs sont
 * mis de côté : aucune carte, aucun versement ne tombe sur eux.
 *
 * Tout ce qui est fictif se reconnaît — les joueurs à leur identifiant Twitch
 * (`fictif-…`), les ouvertures à leur clé (marquée de test : ni overlay, ni
 * tchat), les subs et les évènements à leur identifiant, les boosters à leur
 * raison —, et `retireDonneesFictives` l'efface, compteur de subs compris. Le
 * journal, en ajout seul, garde la trace de tout.
 */

export const PREFIXE_FICTIF = 'fictif-';
const RAISON = 'données fictives';

const PSEUDOS = [
  'GlaçonFou', 'Nordik_77', 'SnowSniper', 'xBlizzardx', 'Frimas', 'IcyKaze',
  'PoudreuseTTV', 'Yéti_Ranked', 'Verglacée', 'K0ldShot', 'Aurora_FPS', 'Flocon2Neige',
  'Banquise', 'Sibérien', 'ColdTurkey', 'Gel_Matinal', 'FrostByte', 'Stalactite',
  'Igloo_Boss', 'AvalancheJoe', 'Pingoo', 'MorseTactique', 'Givrelame', 'ArcticWolf',
];

/** Les subs fictifs ajoutés au compteur : de quoi franchir des paliers. */
const SUBS_FICTIFS = 140;

/** Un hasard rejouable : la même graine, les mêmes joueurs et les mêmes games. */
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
const cleFictive = () => `${PREFIXE_OUVERTURE_TEST}${PREFIXE_FICTIF}${newId()}`;

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
    idempotencyKey: cleFictive(),
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

/** Une game saisie comme par la modération, à une date passée ; avec un Joker, elle ne compte pas. */
function saisit(db: Database, joueur: Player, kills: number, placement: Placement, le: Date, joker = false): Game {
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
  if (joker) {
    game.skipped = true;
    recomputeGame(db, game);
    utiliseJoker(db, game, le);
    return game;
  }
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
  /** Les boosters déjà ouverts, cartes réglées. */
  ouverts: number;
  /** Les boosters laissés à ouvrir. */
  boosters: number;
  duels: number;
  subs: number;
  evenements: number;
}

/**
 * Remplit la ligue de données fictives. À appeler dans une transaction. S'il
 * y en a déjà, elles sont d'abord retirées : la ligue fictive repart à neuf.
 */
export function ajouteDonneesFictives(db: Database, acteur: string, now = new Date()): BilanFictif {
  if (db.players.some(estFictif)) retireDonneesFictives(db, acteur);

  // Les vrais joueurs de côté, le temps de tout faire : les cartes de la
  // ligue, les tirages et l'Avalanche ne tombent que sur les fictifs.
  const misDeCote = db.players.filter((p) => p.active);
  for (const p of misDeCote) p.active = false;
  try {
    return remplit(db, acteur, now);
  } finally {
    for (const p of misDeCote) p.active = true;
  }
}

function remplit(db: Database, acteur: string, now: Date): BilanFictif {
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
  const bilan: BilanFictif = { joueurs: 0, games: 0, cartes: 0, ouverts: 0, boosters: 0, duels: 0, subs: 0, evenements: 0 };

  const joueurs = PSEUDOS.map((pseudo, i) =>
    rattacheCompteTwitch(db, {
      id: `${PREFIXE_FICTIF}${String(i + 1).padStart(2, '0')}`,
      login: `${PREFIXE_FICTIF}${pseudo.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      displayName: pseudo,
      avatarUrl: null,
      roleChaine: 'joueur',
    }),
  );
  bilan.joueurs = joueurs.length;

  // --- L'histoire de chacun : ses games, ses cartes consommées, ses Jokers.
  joueurs.forEach((joueur, i) => {
    // Du nouveau venu (2 à 5 games) à qui est juste avant le Finisseur ; un niveau propre à chacun.
    const nb = i < 2 ? max : i > 20 ? Math.min(max, entier(2, 5)) : Math.max(1, entier(Math.min(6, max), max - 3));
    const niveau = 0.4 + r() * 1.2;
    // Un sur quatre a déjà joué un de ses Jokers.
    const jokerA = i % 4 === 1 && nb > 4 ? entier(2, nb - 1) : -1;
    for (let k = 0; k < nb; k += 1) {
      const le = new Date(debut + k * 13 * 3_600_000 + i * 7 * 60_000);
      // Une carte du Perso toutes les cinq games environ : elle tombe sur la suivante.
      if (r() < 0.2 && poseCarte(db, joueur, 'perso', un(perso).id, le, acteur)) bilan.cartes += 1;
      const kills = Math.max(0, Math.round((2 + r() * 12) * niveau));
      const tirage = r();
      const placement: Placement =
        tirage < 0.07 ? 1 : tirage < 0.15 ? 2 : tirage < 0.24 ? 3 : tirage < 0.6 ? un(TOPS.filter((t) => t > 3)) : null;
      const joker = k === jokerA && jokerDe(db, joueur.id) !== null && carteQuiAttend(db, joueur.id) === null;
      saisit(db, joueur, kills, placement, new Date(le.getTime() + 60_000), joker);
      bilan.games += 1;
    }
    // Des flocons d'avance pour quelques-uns : la chance au booster varie.
    if (r() < 0.4) credit(db, joueur.id, entier(1, 9) * 1_000, 'AJUSTEMENT_ADMIN', `${PREFIXE_FICTIF}flocons`);
  });

  // --- Des subs : le compteur franchit des paliers, les évènements et les boosters tombent.
  const avantSubs = {
    subs: new Set(db.subEvents.map((e) => e.id)),
    evenements: new Set(db.evenements.map((e) => e.id)),
    dus: new Set(db.packsDus.map((d) => d.id)),
  };
  addSubs(db, SUBS_FICTIFS, acteur, RAISON);
  bilan.subs = SUBS_FICTIFS;
  for (const e of db.subEvents) if (!avantSubs.subs.has(e.id)) e.id = `${PREFIXE_FICTIF}${e.id}`;
  for (const e of db.evenements) {
    if (avantSubs.evenements.has(e.id)) continue;
    e.id = `${PREFIXE_FICTIF}${e.id}`;
    bilan.evenements += 1;
  }
  for (const d of db.packsDus) if (!avantSubs.dus.has(d.id)) d.raison = RAISON;
  // Si aucun palier n'a pris le total, une trace pour le reprendre au retrait.
  if (!db.subEvents.some((e) => e.id.startsWith(PREFIXE_FICTIF))) {
    db.subEvents.push({
      id: `${PREFIXE_FICTIF}${newId()}`,
      at: now.toISOString(),
      delta: SUBS_FICTIFS,
      totalAfter: db.config.totalSubs,
      milestones: [],
      snowflakesEach: 0,
      packs: [],
      recipients: 0,
    });
  }

  // --- Des boosters de la ligue de plus, puis une partie ouverte, cartes réglées.
  for (let k = 0; k < 4; k += 1) ajoutePackDu(db, 'commu', null, RAISON);
  for (let k = 0; k < 3; k += 1) ajoutePackDu(db, 'folie', null, RAISON);
  const aOuvrir = db.packsDus.filter((d) => d.raison === RAISON && d.ouvertureId === null);
  for (const du of [...aOuvrir.filter((d) => d.packId === 'commu').slice(0, 3), ...aOuvrir.filter((d) => d.packId === 'folie').slice(0, 2)]) {
    try {
      const o = ouvrePack(db, { packDuId: du.id, idempotencyKey: cleFictive() }, acteur);
      o.annonceeA = now.toISOString();
      for (const id of o.beneficiaires) regleCartesSansAttendre(db, id, now, true);
      bilan.ouverts += 1;
    } catch {
      // Une carte sans bénéficiaire possible : ce booster reste à ouvrir.
    }
  }
  // Un Booster Perso ouvert pour trois joueurs, sans carte qui attend.
  for (const joueur of joueurs.filter((j) => carteQuiAttend(db, j.id) === null).slice(0, 3)) {
    const du = ajoutePackDu(db, 'perso', joueur.id, RAISON);
    try {
      const o = ouvrePack(db, { packDuId: du.id, idempotencyKey: cleFictive() }, acteur);
      o.annonceeA = now.toISOString();
      regleCartesSansAttendre(db, joueur.id, now, true);
      bilan.ouverts += 1;
    } catch {
      // Il reste dans la file : à ouvrir à la main.
    }
  }

  // --- Des duels joués entre fictifs.
  for (let k = 0; k < 12; k += 1) {
    const hote = un(joueurs);
    const adversaire = un(joueurs.filter((j) => j.id !== hote.id));
    const mise = un(DUEL.mises.filter((m) => m <= Math.min(hote.snowflakes, adversaire.snowflakes)));
    if (!mise) continue;
    try {
      const b = creeBataille(db, hote.id, mise, MANCHES_POSSIBLES[0]);
      rejointBataille(db, adversaire.id, b.id);
      bilan.duels += 1;
    } catch {
      // Un solde plein : ce duel ne se joue pas.
    }
  }

  // --- Ce qui attend : une carte active pour deux sur trois, et des cartes gardées.
  joueurs.forEach((joueur, i) => {
    if (r() < 0.66 && poseCarte(db, joueur, 'perso', un(aJouer).id, now, acteur)) bilan.cartes += 1;
    if (i % 6 === 3 && gardees.length) {
      if (poseCarte(db, joueur, 'perso', gardees[((i / 6) | 0) % gardees.length], now, acteur)) bilan.cartes += 1;
    }
  });
  const garde = (i: number, packId: PackId, cardId: string) => {
    if (getCard(cardId) && poseCarte(db, joueurs[i], packId, cardId, now, acteur)) bilan.cartes += 1;
  };
  garde(4, 'folie', 'cryogenisation');
  garde(10, 'finisseur', 'troc-des-neiges');
  garde(16, 'finisseur', 'eboulement');

  bilan.boosters = db.packsDus.filter((d) => d.raison === RAISON && d.ouvertureId === null).length;
  audit(
    db,
    acteur,
    'DONNEES_FICTIVES',
    null,
    `${bilan.joueurs} joueurs fictifs, ${bilan.games} games, ${bilan.cartes} cartes posées, ${bilan.ouverts} boosters ouverts, ${bilan.boosters} à ouvrir, ${bilan.duels} duels, ${bilan.subs} subs`,
  );
  return bilan;
}

/**
 * Retire tout ce qui est fictif. À appeler dans une transaction. Les vrais
 * joueurs ne perdent rien de ce qui leur est propre ; le compteur de subs
 * reprend ce que les données fictives y avaient ajouté.
 */
export function retireDonneesFictives(db: Database, acteur: string): { joueurs: number; games: number; cartes: number } {
  const ids = new Set(db.players.filter(estFictif).map((p) => p.id));
  const subs = db.subEvents.filter((e) => e.id.startsWith(PREFIXE_FICTIF));
  if (ids.size === 0 && subs.length === 0) return { joueurs: 0, games: 0, cartes: 0 };
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
  db.packsDus = db.packsDus.filter(
    (d) => !(d.joueurId && ids.has(d.joueurId)) && d.raison !== RAISON && !(d.ouvertureId && ouvertures.has(d.ouvertureId)),
  );
  db.ouvertures = db.ouvertures
    .filter((o) => !ouvertures.has(o.id))
    .map((o) => ({
      ...o,
      beneficiaires: o.beneficiaires.filter((b) => !ids.has(b)),
      joueurId: o.joueurId && ids.has(o.joueurId) ? null : o.joueurId,
    }));
  db.batailles = db.batailles.filter((b) => !ids.has(b.hoteId) && !(b.adversaireId && ids.has(b.adversaireId)));
  db.config.totalSubs = Math.max(0, db.config.totalSubs - subs.reduce((s, e) => s + e.delta, 0));
  db.subEvents = db.subEvents.filter((e) => !e.id.startsWith(PREFIXE_FICTIF));
  db.evenements = db.evenements.filter((e) => !e.id.startsWith(PREFIXE_FICTIF));
  audit(db, acteur, 'DONNEES_FICTIVES_RETIREES', null, `${ids.size} joueurs fictifs retirés`);
  return {
    joueurs: ids.size,
    games: avant.games - db.games.length,
    cartes: avant.cartes - db.cartesEnAttente.length,
  };
}
