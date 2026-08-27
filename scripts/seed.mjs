#!/usr/bin/env node
/**
 * Remplit `.data/league.json` avec une saison de démonstration : des joueurs,
 * des games, des cartes, des ventes en cours et un historique de prix.
 *
 *   npm run seed
 *
 * Purement local. Le fichier `.data/` est ignoré par git, et le script refuse
 * de s'exécuter en production pour ne jamais écraser de vraies données.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusé : ne jamais semer de données de démonstration en production.');
  process.exit(1);
}

const FILE = process.env.LEAGUE_DATA_FILE ?? join(process.cwd(), '.data', 'league.json');

const CARD_IDS = {
  glace: ['bouclier-givre', 'gel-eternel', 'banquise', 'hiver-sans-fin'],
  tempete: ['vent-du-nord', 'blizzard', 'oeil-du-cyclone', 'nuit-polaire'],
  aurore: ['etoile-polaire', 'pluie-de-flocons', 'couronne-polaire', 'aurore-boreale'],
  solstice: ['boule-de-neige', 'traineau-perce', 'vol-de-traineau', 'grand-froid'],
};
const ALL_CARDS = Object.values(CARD_IDS).flat();

const PSEUDOS = ['Lriaa', 'Frostbyte', 'Yeti', 'Nordik', 'Cristal', 'Avalanche', 'Boreal', 'Iglou'];

/** Générateur déterministe : deux exécutions produisent la même saison. */
let seed = 20261201;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (items) => items[Math.floor(rnd() * items.length)];
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

const PLACEMENT_POINTS = { 1: 20, 2: 15, 3: 8 };
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const db = {
  version: 1,
  config: {
    maxGamesPerPlayer: 25,
    shopOpen: true,
    marketOpen: true,
    seasonStartsAt: '2026-12-01T00:00:00.000Z',
    seasonEndsAt: '2027-03-01T00:00:00.000Z',
  },
  players: [],
  games: [],
  cards: [],
  discoveries: [],
  openings: [],
  effects: [],
  ledger: [],
  listings: [],
  bids: [],
  sales: [],
  events: [],
  audit: [],
};

function credit(playerId, delta, reason) {
  const player = db.players.find((p) => p.id === playerId);
  player.snowflakes += delta;
  db.ledger.push({
    id: randomUUID(),
    playerId,
    delta,
    balanceAfter: player.snowflakes,
    reason,
    refId: null,
    createdAt: iso(between(0, 20) * 3_600_000),
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
    joinedAt: iso(30 * 86_400_000),
    active: true,
  });
  credit(db.players.at(-1).id, 300, 'INSCRIPTION');
}

// --- Games -------------------------------------------------------------------
for (const player of db.players) {
  const count = between(6, 16);
  for (let i = 0; i < count; i += 1) {
    const kills = between(2, 22);
    const roll = rnd();
    const placement = roll > 0.88 ? 1 : roll > 0.78 ? 2 : roll > 0.66 ? 3 : null;
    // Quelques games portent déjà un multiplicateur, comme si une carte avait été jouée.
    const multiplier = rnd() > 0.75 ? pick([1.3, 1.5, 1.8]) : 1;
    const bonusPoints = rnd() > 0.85 ? pick([10, 25, 40, -25]) : 0;

    db.games.push({
      id: randomUUID(),
      playerId: player.id,
      kills,
      placement,
      multiplier,
      bonusPoints,
      skipped: rnd() > 0.94,
      frozen: rnd() > 0.9,
      score: round2(kills * multiplier + (placement ? PLACEMENT_POINTS[placement] : 0) + bonusPoints),
      note: null,
      playedAt: iso(between(1, 25) * 86_400_000),
      createdAt: iso(between(1, 25) * 86_400_000),
      appliedCardIds: multiplier !== 1 ? [pick(CARD_IDS.tempete)] : [],
    });

    credit(
      player.id,
      kills * 3 + (placement ? { 1: 80, 2: 50, 3: 25 }[placement] : 0) + 15,
      'GAME',
    );
  }
}

// --- Cartes et collections ---------------------------------------------------
for (const player of db.players) {
  const owned = between(3, 9);
  for (let i = 0; i < owned; i += 1) {
    const cardId = pick(ALL_CARDS);
    db.cards.push({
      id: randomUUID(),
      playerId: player.id,
      cardId,
      obtainedAt: iso(between(1, 20) * 86_400_000),
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
        firstObtainedAt: iso(between(1, 20) * 86_400_000),
      });
    }
  }
}

// Le premier joueur a complété la famille Tempête : ses bonus sont visibles.
for (const cardId of CARD_IDS.tempete) {
  if (!db.discoveries.some((d) => d.playerId === db.players[0].id && d.cardId === cardId)) {
    db.discoveries.push({
      playerId: db.players[0].id,
      cardId,
      firstObtainedAt: iso(15 * 86_400_000),
    });
  }
}

// --- Historique de ventes, pour alimenter les courbes de prix ----------------
const BASE_PRICE = {
  COMMUNE: 120,
  RARE: 450,
  EPIQUE: 1400,
  LEGENDAIRE: 4200,
};
const RARITY_OF = {};
for (const [, ids] of Object.entries(CARD_IDS)) {
  ids.forEach((id, index) => {
    RARITY_OF[id] = ['COMMUNE', 'RARE', 'EPIQUE', 'LEGENDAIRE'][index];
  });
}

for (const cardId of ALL_CARDS) {
  const base = BASE_PRICE[RARITY_OF[cardId]];
  const count = between(3, 9);
  for (let i = 0; i < count; i += 1) {
    const seller = pick(db.players);
    let buyer = pick(db.players);
    while (buyer.id === seller.id) buyer = pick(db.players);

    // Marche aléatoire autour du prix de référence : la courbe a du relief.
    const price = Math.max(10, Math.round(base * (0.65 + rnd() * 0.8)));
    db.sales.push({
      id: randomUUID(),
      listingId: randomUUID(),
      cardId,
      sellerId: seller.id,
      buyerId: buyer.id,
      price,
      fee: Math.floor(price * 0.05),
      method: rnd() > 0.7 ? 'ACHAT_IMMEDIAT' : 'ENCHERE',
      soldAt: iso(between(1, 21) * 86_400_000),
    });
  }
}

// --- Ventes en cours ---------------------------------------------------------
const forSale = db.cards.filter(() => rnd() > 0.7).slice(0, 14);
for (const instance of forSale) {
  const base = BASE_PRICE[RARITY_OF[instance.cardId]];
  const startPrice = Math.max(10, Math.round(base * 0.6));
  let bidder = pick(db.players);
  while (bidder.id === instance.playerId) bidder = pick(db.players);

  // On ne simule une enchère que si l'enchérisseur peut réellement la couvrir :
  // un solde négatif serait un état que l'application ne sait pas produire.
  const wantedBid = Math.round(startPrice * (1.1 + rnd() * 0.6));
  const hasBid = rnd() > 0.45 && bidder.snowflakes >= wantedBid;

  const listing = {
    id: randomUUID(),
    sellerId: instance.playerId,
    cardInstanceId: instance.id,
    cardId: instance.cardId,
    startPrice,
    buyoutPrice: rnd() > 0.5 ? Math.round(base * 1.6) : null,
    currentPrice: hasBid ? wantedBid : startPrice,
    currentBidderId: hasBid ? bidder.id : null,
    bidCount: hasBid ? between(1, 5) : 0,
    createdAt: iso(between(1, 10) * 3_600_000),
    endsAt: new Date(now + between(1, 60) * 3_600_000).toISOString(),
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
    credit(bidder.id, -listing.currentPrice, 'ENCHERE_BLOQUEE');
  }
}

// Un bouclier actif, pour voir l'icône dans le classement.
db.effects.push({
  id: randomUUID(),
  playerId: db.players[1].id,
  kind: 'BOUCLIER',
  sourceCardId: 'bouclier-givre',
  createdAt: iso(3_600_000),
  expiresAt: new Date(now + 20 * 3_600_000).toISOString(),
});

db.audit.push({
  id: randomUUID(),
  actor: 'systeme',
  action: 'SAISON_INITIALISEE',
  targetId: null,
  detail: `${db.players.length} joueurs, ${db.games.length} games, ${db.sales.length} ventes`,
  at: new Date().toISOString(),
});

await mkdir(dirname(FILE), { recursive: true });
await writeFile(FILE, JSON.stringify(db, null, 2), 'utf8');

console.log(`Saison de démonstration écrite dans ${FILE}`);
console.log(
  `  ${db.players.length} joueurs · ${db.games.length} games · ${db.cards.length} cartes · ` +
    `${db.listings.length} ventes en cours · ${db.sales.length} transactions`,
);
