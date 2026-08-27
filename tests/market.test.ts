import { describe, expect, it } from 'vitest';
import { buildStats, checkBid, isExpired, marketFee, minimumBid, sellerPayout } from '@/lib/domain/market';
import { MARKET } from '@/lib/domain/rules';
import type { Listing, Sale } from '@/lib/domain/types';

const NOW = new Date('2027-01-15T12:00:00.000Z');

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'vente-1',
    sellerId: 'vendeur',
    cardInstanceId: 'copie-1',
    cardId: 'blizzard',
    startPrice: 100,
    buyoutPrice: null,
    currentPrice: 100,
    currentBidderId: null,
    bidCount: 0,
    createdAt: '2027-01-15T10:00:00.000Z',
    endsAt: '2027-01-15T18:00:00.000Z',
    status: 'ACTIVE',
    buyerId: null,
    finalPrice: null,
    closedAt: null,
    ...overrides,
  };
}

describe('pas d’enchère minimum', () => {
  it('accepte le prix de départ tant que personne n’a misé', () => {
    expect(minimumBid(listing())).toBe(100);
  });

  it('exige le plus grand du pas fixe et du pourcentage', () => {
    // 5 % de 100 = 5, mais le pas plancher est de 10.
    expect(minimumBid(listing({ currentPrice: 100, bidCount: 1 }))).toBe(110);
    // 5 % de 1000 = 50, qui l'emporte sur le pas plancher.
    expect(minimumBid(listing({ currentPrice: 1000, bidCount: 3 }))).toBe(1050);
  });
});

describe('validation d’une enchère', () => {
  const base = { bidderId: 'acheteur', balance: 10_000, alreadyEscrowed: 0, now: NOW };

  it('accepte une enchère valide', () => {
    const result = checkBid({ ...base, listing: listing(), amount: 100 });
    expect(result.ok).toBe(true);
    expect(result.additionalEscrow).toBe(100);
  });

  it('refuse au vendeur d’enchérir sur sa propre vente', () => {
    const result = checkBid({ ...base, bidderId: 'vendeur', listing: listing(), amount: 200 });
    expect(result).toMatchObject({ ok: false, reason: 'VENDEUR_INTERDIT' });
  });

  it('refuse de surenchérir sur soi-même', () => {
    const result = checkBid({
      ...base,
      listing: listing({ currentBidderId: 'acheteur', bidCount: 1, currentPrice: 200 }),
      amount: 500,
    });
    expect(result).toMatchObject({ ok: false, reason: 'DEJA_MEILLEUR_ENCHERISSEUR' });
  });

  it('refuse une mise sous le pas minimum', () => {
    const result = checkBid({
      ...base,
      listing: listing({ currentPrice: 100, bidCount: 1 }),
      amount: 105,
    });
    expect(result).toMatchObject({ ok: false, reason: 'MISE_TROP_BASSE' });
  });

  it('refuse un montant non entier ou hors bornes', () => {
    expect(checkBid({ ...base, listing: listing(), amount: 100.5 })).toMatchObject({
      reason: 'MISE_INVALIDE',
    });
    expect(checkBid({ ...base, listing: listing(), amount: 1 })).toMatchObject({
      reason: 'MISE_INVALIDE',
    });
    expect(
      checkBid({ ...base, listing: listing(), amount: MARKET.maxPrice + 1 }),
    ).toMatchObject({ reason: 'MISE_INVALIDE' });
  });

  it('refuse une enchère supérieure au solde', () => {
    const result = checkBid({ ...base, balance: 50, listing: listing(), amount: 100 });
    expect(result).toMatchObject({ ok: false, reason: 'FLOCONS_INSUFFISANTS' });
  });

  it('ne demande que le complément si des flocons sont déjà bloqués', () => {
    // Cas impossible en pratique (on ne surenchérit pas sur soi) mais la règle
    // doit rester juste : on ne double jamais le séquestre.
    const result = checkBid({
      ...base,
      alreadyEscrowed: 300,
      listing: listing({ currentPrice: 400, bidCount: 2, currentBidderId: 'autre' }),
      amount: 500,
    });
    expect(result.ok).toBe(true);
    expect(result.additionalEscrow).toBe(200);
  });

  it('refuse une enchère après l’échéance', () => {
    const result = checkBid({
      ...base,
      listing: listing({ endsAt: '2027-01-15T11:00:00.000Z' }),
      amount: 200,
    });
    expect(result).toMatchObject({ ok: false, reason: 'VENTE_TERMINEE' });
  });

  it('repousse la clôture pour une enchère de dernière seconde', () => {
    const result = checkBid({
      ...base,
      listing: listing({ endsAt: '2027-01-15T12:00:30.000Z' }),
      amount: 150,
    });
    expect(result.ok).toBe(true);
    // La nouvelle échéance est repoussée d'une minute pleine à partir de maintenant.
    expect(new Date(result.newEndsAt!).getTime()).toBe(NOW.getTime() + MARKET.antiSnipeWindowMs);
  });

  it('ne repousse pas une clôture encore lointaine', () => {
    const result = checkBid({ ...base, listing: listing(), amount: 150 });
    expect(result.newEndsAt).toBeUndefined();
  });
});

describe('taxe de vente', () => {
  it('prélève 5 % au vendeur', () => {
    expect(marketFee(1000)).toBe(50);
    expect(sellerPayout(1000)).toBe(950);
  });

  it('réduit la taxe de moitié avec la famille Solstice', () => {
    expect(marketFee(1000, 0.5)).toBe(25);
    expect(sellerPayout(1000, 0.5)).toBe(975);
  });

  it('ne fabrique jamais de flocons : versement + taxe = prix', () => {
    for (const price of [10, 137, 999, 12_345]) {
      expect(sellerPayout(price) + marketFee(price)).toBe(price);
    }
  });
});

describe('échéance', () => {
  it('reconnaît une vente échue encore active', () => {
    expect(isExpired(listing({ endsAt: '2027-01-15T11:00:00.000Z' }), NOW)).toBe(true);
    expect(isExpired(listing(), NOW)).toBe(false);
    expect(isExpired(listing({ status: 'VENDUE' }), NOW)).toBe(false);
  });
});

describe('statistiques de marché', () => {
  const sale = (price: number, daysAgo: number): Sale => ({
    id: `v-${price}-${daysAgo}`,
    listingId: 'l',
    cardId: 'blizzard',
    sellerId: 's',
    buyerId: `acheteur-${price}`,
    price,
    fee: Math.floor(price * 0.05),
    method: 'ENCHERE',
    soldAt: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  });

  it('calcule dernier prix, moyenne, extrêmes et volume', () => {
    const stats = buildStats('blizzard', [sale(100, 10), sale(300, 1), sale(200, 5)], [], NOW);
    expect(stats.lastPrice).toBe(300);
    expect(stats.lastBuyerId).toBe('acheteur-300');
    expect(stats.averagePrice).toBe(200);
    expect(stats.minPrice).toBe(100);
    expect(stats.maxPrice).toBe(300);
    expect(stats.volume).toBe(3);
  });

  it('range l’historique du plus ancien au plus récent', () => {
    const stats = buildStats('blizzard', [sale(300, 1), sale(100, 10)], [], NOW);
    expect(stats.history.map((p) => p.price)).toEqual([100, 300]);
  });

  it('calcule une tendance seulement avec un avant et un après', () => {
    expect(buildStats('blizzard', [sale(100, 1)], [], NOW).trend7d).toBeNull();
    // 100 il y a 10 jours, 150 hier : +50 %.
    expect(buildStats('blizzard', [sale(100, 10), sale(150, 1)], [], NOW).trend7d).toBe(50);
  });

  it('ignore les ventes des autres cartes', () => {
    const autre: Sale = { ...sale(999, 1), cardId: 'nuit-polaire' };
    const stats = buildStats('blizzard', [sale(100, 1), autre], [], NOW);
    expect(stats.volume).toBe(1);
    expect(stats.maxPrice).toBe(100);
  });

  it('déduit le prix plancher des ventes en cours', () => {
    const stats = buildStats(
      'blizzard',
      [],
      [listing({ currentPrice: 500 }), listing({ id: 'v2', currentPrice: 200 })],
      NOW,
    );
    expect(stats.floorPrice).toBe(200);
    expect(stats.activeListings).toBe(2);
  });
});
