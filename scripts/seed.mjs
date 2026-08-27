#!/usr/bin/env node
/**
 * Remplit `.data/league.json` avec une saison de démonstration : des joueurs,
 * des games, des cartes, des ventes en cours et un historique de prix étalé sur
 * plusieurs mois pour que les courbes aient du relief.
 *
 *   npm run seed
 *
 * Purement local. `.data/` est ignoré par git, et le script refuse de tourner
 * en production pour ne jamais écraser de vraies données.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusé : ne jamais semer de données de démonstration en production.');
  process.exit(1);
}

const FILE = process.env.LEAGUE_DATA_FILE ?? join(process.cwd(), '.data', 'league.json');

/* Doit refléter lib/domain/catalog.ts — 4 familles × 6 raretés. */
const FAMILIES = {
  glace: ['congere', 'bouclier-givre', 'gel-eternel', 'second-souffle', 'rempart-polaire', 'sanctuaire'],
  tempete: ['rafale', 'vent-du-nord', 'percee', 'blizzard', 'sang-froid', 'nuit-polaire'],
  aurore: ['etincelle', 'etoile-polaire', 'pluie-de-flocons', 'manne', 'mecene', 'aurore-boreale'],
  solstice: ['boule-de-neige', 'givre-mordant', 'contre-courant', 'traineau-perce', 'tempete-de-verglas', 'grand-froid'],
};
const LADDER = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

const RARITY_OF = {};
for (const ids of Object.values(FAMILIES)) {
  ids.forEach((id, i) => {
    RARITY_OF[id] = LADDER[i];
  });
}
const ALL_CARDS = Object.values(FAMILIES).flat();

/* Cote de référence, alignée sur catalog.referencePrice(). */
const BASE_PRICE = { C: 40, PC: 120, R: 500, SR: 2_000, UR: 8_000, L: 40_000 };

/* Poids de tirage du booster Givre, pour que la démo respecte les vraies raretés. */
const WEIGHTS = { C: 73_000, PC: 20_000, R: 5_700, SR: 1_000, UR: 280, L: 20 };
const WEIGHT_TOTAL = 100_000;

const PSEUDOS = ['Lriaa', 'Frostbyte', 'Yeti', 'Nordik', 'Cristal', 'Avalanche', 'Boreal', 'Iglou'];

/** Générateur déterministe : deux exécutions produisent la même saison. */
let seed = 20261201;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (items) => items[Math.floor(rnd() * items.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

/** Tirage pondéré, identique à celui du serveur. */
function pickRarity() {
  let roll = Math.floor(rnd() * WEIGHT_TOTAL);
  for (const rarity of LADDER) {
    roll -= WEIGHTS[rarity];
    if (roll < 0) return rarity;
  }
  return 'C';
}
/**
 * Tire une carte de la rareté demandée, en redescendant si le palier est vide —
 * même repli que le serveur.
 */
function cardOfRarity(rarity, pool) {
  const ladder = ['L', 'UR', 'SR', 'R', 'PC', 'C'];
  for (let i = ladder.indexOf(rarity); i < ladder.length; i += 1) {
    const candidates = pool.filter((c) => c.rarity === ladder[i]);
    if (candidates.length > 0) return pick(candidates).id;
  }
  return pool[0].id;
}

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const DAY = 86_400_000;

const PLACEMENT_POINTS = { 1: 20, 2: 15, 3: 8 };
const PLACEMENT_FLAKES = { 1: 400, 2: 250, 3: 120 };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const db = {
  version: 1,
  config: {
    maxGamesPerPlayer: 25,
    totalSubs: 437,
    shopOpen: true,
    marketOpen: true,
    seasonStartsAt: '2026-12-01T00:00:00.000Z',
    seasonEndsAt: '2027-03-01T00:00:00.000Z',
  },
  players: [],
  games: [],
  cards: [],
  collectibles: [],
  discoveries: [],
  openings: [],
  effects: [],
  boons: [],
  ledger: [],
  listings: [],
  bids: [],
  sales: [],
  events: [],
  subEvents: [],
  audit: [],
};

function move(playerId, delta, reason, msAgo = between(0, 20) * 3_600_000) {
  const player = db.players.find((p) => p.id === playerId);
  player.snowflakes += delta;
  db.ledger.push({
    id: randomUUID(),
    playerId,
    delta,
    balanceAfter: player.snowflakes,
    reason,
    refId: null,
    createdAt: iso(msAgo),
  });
}

// --- Joueurs -----------------------------------------------------------------
for (const pseudo of PSEUDOS) {
  db.players.push({
    id: randomUUID(),
    slug: pseudo.toLowerCase(),
    pseudo,
    twitchId: null,
    twitchLogin: pseudo.toLowerCase(),
    avatarUrl: null,
    snowflakes: 0,
    joinedAt: iso(60 * DAY),
    active: true,
  });
  move(db.players.at(-1).id, 400, 'INSCRIPTION', 60 * DAY);
}

// --- Games -------------------------------------------------------------------
for (const player of db.players) {
  const count = between(8, 20);
  for (let i = 0; i < count; i += 1) {
    const kills = between(2, 24);
    const roll = rnd();
    const placement = roll > 0.88 ? 1 : roll > 0.78 ? 2 : roll > 0.66 ? 3 : null;
    // Quelques games portent déjà un multiplicateur, comme si une carte avait été jouée.
    // Quelques games portent déjà l'effet d'une carte, avec son journal.
    const boosted = rnd() > 0.7;
    const boostCard = boosted ? pick(FAMILIES.tempete.slice(0, 4)) : null;
    const boostPoints = boosted ? between(4, 16) : 0;
    const struck = rnd() > 0.88;
    const strikePoints = struck ? -between(6, 12) : 0;
    const bonusPoints = boostPoints + strikePoints;
    const playedAt = iso(between(1, 45) * DAY);

    db.games.push({
      id: randomUUID(),
      playerId: player.id,
      kills,
      placement,
      bonusPoints,
      skipped: rnd() > 0.94,
      frozen: rnd() > 0.9,
      score: round2(kills + (placement ? PLACEMENT_POINTS[placement] : 0) + bonusPoints),
      note: null,
      playedAt,
      createdAt: playedAt,
      applied: [
        ...(boostCard
          ? [
              {
                id: randomUUID(),
                cardId: boostCard,
                byPlayerId: player.id,
                points: boostPoints,
                at: playedAt,
                undone: false,
              },
            ]
          : []),
        ...(struck
          ? [
              {
                id: randomUUID(),
                cardId: 'traineau-perce',
                // Un malus vient forcément de quelqu'un d'autre.
                byPlayerId: 'adversaire',
                points: strikePoints,
                at: playedAt,
                undone: false,
              },
            ]
          : []),
      ],
    });

    move(
      player.id,
      kills * 25 + (placement ? PLACEMENT_FLAKES[placement] : 0) + 150,
      'GAME',
      between(1, 45) * DAY,
    );
  }
}

// --- Versements de subs ------------------------------------------------------
// 437 subs cumulés : 87 Bourrasques, 17 Rafales, 4 Chutes de Neige.
for (const player of db.players) {
  move(player.id, 87 * 40 + 17 * 200, 'SUBS_TWITCH', between(1, 30) * DAY);
}
db.subEvents.push({
  id: randomUUID(),
  at: iso(2 * 3_600_000),
  delta: 25,
  totalAfter: 437,
  milestones: ['Bourrasque', 'Bourrasque', 'Bourrasque', 'Bourrasque', 'Bourrasque', 'Rafale'],
  snowflakesEach: 400,
  boostersEach: [],
  recipients: db.players.length,
});

// --- Cartes de collection ----------------------------------------------------
// Une carte par participant, plus quelques moments de saison. Aucune n'a
// d'effet en jeu : c'est ce qui permet d'élargir le pool sans toucher à
// l'équilibrage.
for (const player of db.players) {
  db.collectibles.push({
    id: `joueur-${player.slug}`,
    kind: 'JOUEUR',
    name: player.pseudo,
    subtitle: 'Participant de la saison',
    description: 'Carte de collection. Aucun effet en jeu — sa valeur, c’est le marché qui la fait.',
    // Réparties sur trois paliers pour que la démo montre l'effet des raretés.
    rarity: pick(['C', 'C', 'PC', 'PC', 'R']),
    glyph: '🎴',
    art: null,
    playerId: player.id,
    createdAt: iso(60 * DAY),
  });
}

for (const [name, subtitle, rarity, glyph] of [
  ['Record de kills', '24 kills en une game', 'SR', '🔥'],
  ['Première légendaire', 'Tirée le soir des 200 subs', 'UR', '✨'],
  ['La vente du siècle', '41 000 flocons pour une Nuit Polaire', 'R', '💰'],
  ['Cap des 500 subs', 'Le Grand Nord est tombé', 'R', '🎁'],
]) {
  db.collectibles.push({
    id: `moment-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'MOMENT',
    name,
    subtitle,
    description: 'Un instant de la saison, gravé dans une carte.',
    rarity,
    glyph,
    art: null,
    playerId: null,
    createdAt: iso(between(5, 40) * DAY),
  });
}

// --- Cartes possédées --------------------------------------------------------
for (const player of db.players) {
  const owned = between(5, 14);
  for (let i = 0; i < owned; i += 1) {
    // Deux tiers de cartes de collection, un tiers d'effets : la proportion
    // qu'induisent les emplacements de booster.
    const pool =
      rnd() > 0.34
        ? db.collectibles.map((c) => ({ id: c.id, rarity: c.rarity }))
        : ALL_CARDS.map((id) => ({ id, rarity: RARITY_OF[id] }));
    const cardId = cardOfRarity(pickRarity(), pool);
    db.cards.push({
      id: randomUUID(),
      playerId: player.id,
      cardId,
      obtainedAt: iso(between(1, 40) * DAY),
      source: 'BOOSTER',
      consumed: false,
      consumedAt: null,
      consumedOnGameId: null,
      consumedOnPlayerId: null,
      listingId: null,
      consumeKey: null,
    });
    if (!db.discoveries.some((d) => d.playerId === player.id && d.cardId === cardId)) {
      db.discoveries.push({
        playerId: player.id,
        cardId,
        firstObtainedAt: iso(between(1, 40) * DAY),
      });
    }
  }
}

// Le premier joueur a bouclé la famille Tempête : ses bonus sont visibles au classement.
for (const cardId of FAMILIES.tempete) {
  if (!db.discoveries.some((d) => d.playerId === db.players[0].id && d.cardId === cardId)) {
    db.discoveries.push({
      playerId: db.players[0].id,
      cardId,
      firstObtainedAt: iso(20 * DAY),
    });
  }
}
// Le deuxième atteint le palier partiel sur Glace (4 cartes sur 6).
for (const cardId of FAMILIES.glace.slice(0, 4)) {
  if (!db.discoveries.some((d) => d.playerId === db.players[1].id && d.cardId === cardId)) {
    db.discoveries.push({
      playerId: db.players[1].id,
      cardId,
      firstObtainedAt: iso(18 * DAY),
    });
  }
}

// --- Historique de ventes, pour alimenter les courbes de prix ----------------
const PRICED = [
  ...ALL_CARDS.map((id) => ({ id, rarity: RARITY_OF[id] })),
  ...db.collectibles.map((c) => ({ id: c.id, rarity: c.rarity })),
];

for (const { id: cardId, rarity } of PRICED) {
  const base = BASE_PRICE[rarity];
  // Les cartes rares s'échangent moins souvent : le volume suit la rareté.
  const count = { C: 14, PC: 12, R: 9, SR: 6, UR: 3, L: 2 }[rarity];

  // Marche aléatoire autour de la référence, pour une courbe qui respire.
  let level = base * (0.85 + rnd() * 0.3);
  for (let i = 0; i < count; i += 1) {
    const seller = pick(db.players);
    let buyer = pick(db.players);
    while (buyer.id === seller.id) buyer = pick(db.players);

    level *= 0.88 + rnd() * 0.3;
    level = Math.min(base * 2.4, Math.max(base * 0.35, level));
    const price = Math.max(10, Math.round(level));

    db.sales.push({
      id: randomUUID(),
      listingId: randomUUID(),
      cardId,
      sellerId: seller.id,
      buyerId: buyer.id,
      price,
      fee: Math.floor(price * 0.05),
      method: rnd() > 0.7 ? 'ACHAT_IMMEDIAT' : 'ENCHERE',
      // Étalé sur 100 jours, du plus ancien au plus récent.
      soldAt: iso(Math.round((100 - (i / count) * 98) * DAY)),
    });
  }
}
db.sales.sort((a, b) => new Date(a.soldAt) - new Date(b.soldAt));

// --- Ventes en cours ---------------------------------------------------------
const forSale = db.cards.filter(() => rnd() > 0.62).slice(0, 26);
for (const instance of forSale) {
  const known = PRICED.find((c) => c.id === instance.cardId);
  const base = BASE_PRICE[known ? known.rarity : 'C'];
  const startPrice = Math.max(10, Math.round(base * (0.5 + rnd() * 0.3)));

  let bidder = pick(db.players);
  while (bidder.id === instance.playerId) bidder = pick(db.players);

  // On ne simule une enchère que si l'enchérisseur peut réellement la couvrir :
  // un solde négatif serait un état que l'application ne sait pas produire.
  const wantedBid = Math.round(startPrice * (1.1 + rnd() * 0.7));
  const hasBid = rnd() > 0.4 && bidder.snowflakes >= wantedBid;

  const listing = {
    id: randomUUID(),
    sellerId: instance.playerId,
    cardInstanceId: instance.id,
    cardId: instance.cardId,
    startPrice,
    buyoutPrice: rnd() > 0.45 ? Math.round(base * (1.4 + rnd() * 0.6)) : null,
    currentPrice: hasBid ? wantedBid : startPrice,
    currentBidderId: hasBid ? bidder.id : null,
    bidCount: hasBid ? between(1, 6) : 0,
    createdAt: iso(between(1, 12) * 3_600_000),
    // Quelques ventes finissent dans la minute : de quoi voir l'anti-snipe.
    endsAt: new Date(now + between(1, 190) * 60_000 * (rnd() > 0.7 ? 1 : 12)).toISOString(),
    status: 'ACTIVE',
    buyerId: null,
    finalPrice: null,
    closedAt: null,
  };

  instance.listingId = listing.id;
  db.listings.push(listing);

  if (hasBid) {
    db.bids.push({
      id: randomUUID(),
      listingId: listing.id,
      bidderId: bidder.id,
      amount: listing.currentPrice,
      createdAt: iso(between(1, 5) * 3_600_000),
      refunded: false,
    });
    // Les flocons de l'enchérisseur sont bien sous séquestre.
    move(bidder.id, -listing.currentPrice, 'ENCHERE_BLOQUEE', 3_600_000);
  }
}

// Un bouclier actif, pour voir l'icône au classement.
db.effects.push({
  id: randomUUID(),
  playerId: db.players[1].id,
  kind: 'BOUCLIER',
  sourceCardId: 'bouclier-givre',
  createdAt: iso(3_600_000),
  expiresAt: new Date(now + 9 * 3_600_000).toISOString(),
});

db.audit.push({
  id: randomUUID(),
  actor: 'systeme',
  action: 'SAISON_INITIALISEE',
  targetId: null,
  detail: `${db.players.length} joueurs, ${db.games.length} games, ${db.sales.length} ventes`,
  at: new Date().toISOString(),
});

const negatives = db.players.filter((p) => p.snowflakes < 0);
if (negatives.length > 0) {
  console.error('Incohérence : soldes négatifs générés —', negatives.map((p) => p.pseudo).join(', '));
  process.exit(1);
}

await mkdir(dirname(FILE), { recursive: true });
await writeFile(FILE, JSON.stringify(db, null, 2), 'utf8');

console.log(`Saison de démonstration écrite dans ${FILE}`);
console.log(
  `  ${db.players.length} joueurs · ${db.games.length} games · ${db.cards.length} cartes · ` +
    `${db.collectibles.length} cartes de collection · ${db.listings.length} ventes · ` +
    `${db.config.totalSubs} subs`,
);
