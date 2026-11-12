/**
 * Des joueurs fictifs, pour essayer les cartes et les ouvertures en vrai
 * (demandé par l'organisation le 12/11/2026). Ils passent par les mêmes
 * services que le site : games saisies et réglées comme à la saisie, flocons
 * au grand livre, cartes posées comme à une ouverture.
 *
 *   npx vite-node --config vitest.config.ts scripts/fictifs.ts -- essai
 *   npx vite-node --config vitest.config.ts scripts/fictifs.ts -- ajoute
 *   npx vite-node --config vitest.config.ts scripts/fictifs.ts -- retire
 *
 * `essai` fait tout sur une copie de la base, sans rien écrire, et dit ce qui
 * aurait été fait. Les fictifs se reconnaissent à leur identifiant Twitch
 * (`fictif-…`) : `retire` les efface, eux et tout ce qui leur appartient —
 * games, flocons, cartes, boosters. Les ouvertures de leurs cartes sont
 * marquées de test : l'overlay du live ne les joue pas, le tchat ne les annonce
 * pas. Le journal, en ajout seul, garde la trace de tout.
 *
 * `DATABASE_URL` est lue dans `.env.local` et n'est jamais affichée.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database, Game, OuverturePack, Player } from '@/lib/db/entities';
import { cartesDuPack, getCard, momentDe } from '@/lib/domain/catalog';
import { rewardForGame } from '@/lib/domain/economy';
import { PREFIXE_OUVERTURE_TEST, TOPS } from '@/lib/domain/rules';
import type { PackId, Placement } from '@/lib/domain/types';

const PREFIXE = 'fictif-';
const ACTEUR = 'donnees-fictives';

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

function variable(nom: string): string | null {
  if (process.env[nom]) return process.env[nom]!;
  try {
    const env = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    const ligne = env.split(/\r?\n/).find((l) => l.startsWith(`${nom}=`));
    return ligne ? ligne.slice(nom.length + 1).trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const estFictif = (p: Player) => p.twitchId?.startsWith(PREFIXE) ?? false;

async function main() {
  const mode = process.argv.slice(2).find((a) => ['essai', 'ajoute', 'retire'].includes(a));
  if (!mode) throw new Error('Préciser essai, ajoute ou retire.');
  const url = variable('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL manque.');
  process.env.DATABASE_URL = url;

  // Les services se chargent une fois l'adresse posée : le magasin la lit.
  const { getStore, newId } = await import('@/lib/db/store');
  const { rattacheCompteTwitch } = await import('@/lib/services/comptes');
  const { appliqueCartesEnAttente, carteQuiAttend, regleCartesSansAttendre } = await import('@/lib/services/effects');
  const { recomputeGame } = await import('@/lib/services/league');
  const { audit, credit } = await import('@/lib/services/ledger');
  const { ajoutePackDu } = await import('@/lib/services/packs');

  /** Pose une carte sur un joueur comme à une ouverture, déjà révélée, marquée de test. */
  function poseCarte(db: Database, joueur: Player, packId: PackId, cardId: string, le: Date): boolean {
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
      ouvertPar: ACTEUR,
      openedAt: le.toISOString(),
      idempotencyKey: `${PREFIXE_OUVERTURE_TEST}${PREFIXE}${newId()}`,
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

  function ajoute(db: Database) {
    if (db.players.some(estFictif)) throw new Error('Des joueurs fictifs sont déjà là : « retire » d’abord.');
    const r = hasard(20261112);
    const entier = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
    const un = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)];
    const perso = cartesDuPack('perso').filter((c) => c.id !== 'joker-givre');
    const aJouer = perso.filter((c) => momentDe(c.effect) === 'PROCHAINE');
    const gardees = ['plaque-verglas', 'pacte-du-givre'].filter((id) => getCard(id));
    const max = Math.max(1, db.config.maxGamesPerPlayer - 1);
    const debut = Date.parse('2026-10-20T19:00:00.000Z');

    const joueurs = PSEUDOS.map((pseudo, i) =>
      rattacheCompteTwitch(db, {
        id: `${PREFIXE}${String(i + 1).padStart(2, '0')}`,
        login: `${PREFIXE}${pseudo.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        displayName: pseudo,
        avatarUrl: null,
        roleChaine: 'joueur',
      }),
    );

    let games = 0;
    let cartes = 0;
    joueurs.forEach((joueur, i) => {
      // Du nouveau venu (3 games) à qui est presque au bout (la dernière avant
      // le Finisseur) ; un niveau propre à chacun.
      const nb = i < 2 ? max : i > 20 ? entier(2, 5) : entier(6, max - 3);
      const niveau = 0.4 + r() * 1.2;
      for (let k = 0; k < nb; k += 1) {
        const le = new Date(debut + k * 13 * 3_600_000 + i * 7 * 60_000);
        // Une carte du Perso toutes les cinq games environ : elle tombe sur la suivante.
        if (r() < 0.2 && poseCarte(db, joueur, 'perso', un(perso).id, le)) cartes += 1;
        const kills = Math.max(0, Math.round((2 + r() * 12) * niveau));
        const tirage = r();
        const placement: Placement =
          tirage < 0.07 ? 1 : tirage < 0.15 ? 2 : tirage < 0.24 ? 3 : tirage < 0.6 ? un(TOPS.filter((t) => t > 3)) : null;
        saisit(db, joueur, kills, placement, new Date(le.getTime() + 60_000));
        games += 1;
      }
      // Des flocons d'avance pour quelques-uns : la chance au booster varie.
      if (r() < 0.4) credit(db, joueur.id, entier(1, 9) * 1_000, 'AJUSTEMENT_ADMIN', `${PREFIXE}flocons`);
      // Une carte active pour deux sur trois : elle attend sa prochaine game.
      const maintenant = new Date();
      if (r() < 0.66 && poseCarte(db, joueur, 'perso', un(aJouer).id, maintenant)) cartes += 1;
      // Quelques cartes gardées, à jouer depuis le classement.
      if (i % 6 === 3 && gardees.length) {
        if (poseCarte(db, joueur, 'perso', gardees[((i / 6) | 0) % gardees.length], maintenant)) cartes += 1;
      }
    });
    // Les cartes gardées du Folie et du Finisseur, une chacune.
    const garde = (i: number, packId: PackId, cardId: string) => {
      if (getCard(cardId) && poseCarte(db, joueurs[i], packId, cardId, new Date())) cartes += 1;
    };
    garde(4, 'folie', 'cryogenisation');
    garde(10, 'finisseur', 'troc-des-neiges');
    garde(16, 'finisseur', 'eboulement');

    // Des boosters de la ligue à ouvrir, pour essayer les tirages.
    for (let k = 0; k < 4; k += 1) ajoutePackDu(db, 'commu', null, 'données fictives');
    for (let k = 0; k < 3; k += 1) ajoutePackDu(db, 'folie', null, 'données fictives');

    audit(db, ACTEUR, 'DONNEES_FICTIVES', null, `${joueurs.length} joueurs fictifs, ${games} games, ${cartes} cartes, 7 boosters de la ligue`);
    return { joueurs: joueurs.length, games, cartes, boosters: 7 };
  }

  function retire(db: Database) {
    const ids = new Set(db.players.filter(estFictif).map((p) => p.id));
    if (ids.size === 0) return { joueurs: 0 };
    const avant = { games: db.games.length, cartes: db.cartesEnAttente.length };
    const ouvertures = new Set(
      db.ouvertures.filter((o) => o.idempotencyKey.startsWith(`${PREFIXE_OUVERTURE_TEST}${PREFIXE}`)).map((o) => o.id),
    );
    db.players = db.players.filter((p) => !ids.has(p.id));
    db.games = db.games.filter((g) => !ids.has(g.playerId));
    db.ledger = db.ledger.filter((l) => !ids.has(l.playerId));
    db.cartesEnAttente = db.cartesEnAttente.filter((c) => !ids.has(c.joueurId) && !ouvertures.has(c.ouvertureId));
    db.packsDus = db.packsDus.filter((d) => !(d.joueurId && ids.has(d.joueurId)) && d.raison !== 'données fictives');
    db.ouvertures = db.ouvertures
      .filter((o) => !ouvertures.has(o.id))
      .map((o) => ({ ...o, beneficiaires: o.beneficiaires.filter((b) => !ids.has(b)), joueurId: o.joueurId && ids.has(o.joueurId) ? null : o.joueurId }));
    // Leurs games touchées par les cartes des autres : les traces y restent,
    // sans joueur fictif.
    audit(db, ACTEUR, 'DONNEES_FICTIVES_RETIREES', null, `${ids.size} joueurs fictifs retirés`);
    return {
      joueurs: ids.size,
      games: avant.games - db.games.length,
      cartes: avant.cartes - db.cartesEnAttente.length,
    };
  }

  const store = getStore();
  const avant = await store.read((db) => ({
    joueurs: db.players.length,
    fictifs: db.players.filter(estFictif).length,
    games: db.games.length,
    dus: db.packsDus.filter((d) => !d.ouvertureId).length,
    limite: db.config.maxGamesPerPlayer,
  }));
  console.log('avant', avant);

  if (mode === 'essai') {
    const copie = await store.read((db) => structuredClone(db) as Database);
    console.log('essai (rien n’est écrit)', ajoute(copie));
    const fictifs = copie.players.filter(estFictif);
    for (const p of fictifs.slice(0, 24)) {
      const g = copie.games.filter((x) => x.playerId === p.id && !x.skipped);
      const attend = carteQuiAttend(copie, p.id);
      console.log(
        p.pseudo.padEnd(14),
        String(g.length).padStart(2), 'games',
        String(g.reduce((s, x) => s + x.score, 0)).padStart(4), 'pts',
        String(p.snowflakes).padStart(6), '❄',
        attend ? `attend : ${getCard(attend.cardId)?.name}` : '',
      );
    }
  } else if (mode === 'ajoute') {
    console.log('ajouté', await store.transaction(ajoute));
  } else {
    console.log('retiré', await store.transaction(retire));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
