import Link from 'next/link';
import { MarketBoard, type MarketListing, type MarketSale } from '@/components/MarketBoard';
import { PageHead, StatTile, flakes } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import type { Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { MARKET } from '@/lib/domain/rules';
import type { Listing } from '@/lib/domain/types';
import { closeExpiredListings, recentSales, statsForCard } from '@/lib/services/market';
import { minimumBid } from '@/lib/domain/market';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hôtel des ventes' };

/** Nombre de ventes envoyées au client. Au-delà, il faudra paginer côté serveur. */
const MAX_ROWS = 300;

/**
 * Hôtel des ventes.
 *
 * La lecture ouvre une transaction pour clôturer d'abord les ventes échues : la
 * page ne montre jamais une enchère qui aurait dû tomber, et les remboursements
 * sont effectifs avant l'affichage des soldes.
 */
export default async function MarchePage() {
  const session = await getSession();
  const viewerId = session?.role === 'joueur' ? session.sub : null;

  const data = await getStore().transaction((db) => {
    closeExpiredListings(db);

    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Inconnu';

    // Cote calculée une seule fois par carte, puis réutilisée sur chaque vente.
    const quotes = new Map<string, number | null>();
    const quoteOf = (cardId: string) => {
      if (!quotes.has(cardId)) quotes.set(cardId, statsForCard(db as Database, cardId).lastPrice);
      return quotes.get(cardId) ?? null;
    };

    const toRow = (l: Listing): MarketListing | null => {
      const card = getCard(l.cardId);
      if (!card) return null;
      return {
        id: l.id,
        cardId: l.cardId,
        name: card.name,
        subtitle: card.subtitle,
        rarity: card.rarity,
        theme: card.theme,
        glyph: card.glyph,
        power: card.power,
        sellerId: l.sellerId,
        sellerPseudo: pseudo(l.sellerId),
        startPrice: l.startPrice,
        currentPrice: l.currentPrice,
        buyoutPrice: l.buyoutPrice,
        currentBidderId: l.currentBidderId,
        currentBidderPseudo: l.currentBidderId ? pseudo(l.currentBidderId) : null,
        bidCount: l.bidCount,
        minimumNextBid: minimumBid(l),
        endsAt: l.endsAt,
        quote: quoteOf(l.cardId),
      };
    };

    const active = db.listings.filter((l) => l.status === 'ACTIVE');
    const rows = active
      .slice()
      .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
      .slice(0, MAX_ROWS)
      .map(toRow)
      .filter((r): r is MarketListing => r !== null);

    const toSale = (
      s: (typeof db.sales)[number],
      side: 'ACHAT' | 'VENTE',
    ): MarketSale | null => {
      const card = getCard(s.cardId);
      if (!card) return null;
      return {
        id: s.id,
        cardId: s.cardId,
        name: card.name,
        rarity: card.rarity,
        glyph: card.glyph,
        price: s.price,
        method: s.method,
        soldAt: s.soldAt,
        buyer: pseudo(s.buyerId),
        seller: pseudo(s.sellerId),
        side,
      };
    };

    const mySales = viewerId
      ? db.sales
          .filter((s) => s.buyerId === viewerId || s.sellerId === viewerId)
          .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
          .slice(0, 80)
      : [];

    return {
      marketOpen: db.config.marketOpen,
      balance: viewerId ? (db.players.find((p) => p.id === viewerId)?.snowflakes ?? null) : null,
      listings: rows,
      totalActive: active.length,
      myListings: viewerId
        ? active
            .filter((l) => l.sellerId === viewerId)
            .map(toRow)
            .filter((r): r is MarketListing => r !== null)
        : [],
      myBids: viewerId
        ? active
            .filter((l) => l.currentBidderId === viewerId)
            .map(toRow)
            .filter((r): r is MarketListing => r !== null)
        : [],
      won: mySales
        .filter((s) => s.buyerId === viewerId)
        .map((s) => toSale(s, 'ACHAT'))
        .filter((s): s is MarketSale => s !== null),
      history: mySales
        .map((s) => toSale(s, s.sellerId === viewerId ? 'VENTE' : 'ACHAT'))
        .filter((s): s is MarketSale => s !== null),
      volume24h: recentSales(db as Database, 24),
      totalSales: db.sales.length,
    };
  });

  const volumeFlakes = data.volume24h.reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="space-y-5">
      <PageHead
        eyebrow="Enchères entre joueurs"
        title="Hôtel des"
        accent="Ventes"
        lead="Enchéris sur les cartes des autres, ou vends les tiennes contre des flocons. Les flocons misés sont bloqués en séquestre et te reviennent dès qu’on te dépasse."
        actions={
          viewerId ? (
            <Link href="/ma-collection#vendre" className="btn btn-ice no-underline">
              Vendre une carte
            </Link>
          ) : (
            <Link href="/connexion" className="btn no-underline">
              Se connecter
            </Link>
          )
        }
      />

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Ventes en cours" value={data.totalActive} />
        <StatTile
          label="Conclues (24 h)"
          value={data.volume24h.length}
          hint={volumeFlakes > 0 ? `❄ ${flakes(volumeFlakes)} échangés` : undefined}
          accent="aurora"
        />
        <StatTile label="Total historique" value={data.totalSales} accent="ink" />
        <StatTile
          label="Taxe de vente"
          value={`${Math.round(MARKET.feeRate * 100)} %`}
          hint="−50 % avec la famille Solstice complète"
          accent="gold"
        />
      </section>

      <MarketBoard
        listings={data.listings}
        myListings={data.myListings}
        myBids={data.myBids}
        won={data.won}
        history={data.history}
        viewerId={viewerId}
        balance={data.balance}
        marketOpen={data.marketOpen}
      />
    </div>
  );
}
