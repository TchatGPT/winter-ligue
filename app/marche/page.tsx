import Link from 'next/link';
import { MarketBoard, type MarketListing, type MarketSale } from '@/components/MarketBoard';
import { flakes } from '@/components/ui';
import { getSession, playerIdOf } from '@/lib/auth/session';
import type { Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { MARKET } from '@/lib/domain/rules';
import type { Listing } from '@/lib/domain/types';
import { closeExpiredListings, recentSales, statsForCard } from '@/lib/services/market';
import { minimumBid } from '@/lib/domain/market';
import { TitreGlace } from '@/components/TitreGlace';

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
  const viewerId = playerIdOf(session);

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
      {/*
        Un entête d'une ligne, et quatre chiffres réduits à une phrase.

        Il occupait la moitié de l'écran : un titre de couverture, trois lignes
        de règles, et quatre grands pavés de statistiques. Or on ne vient pas au
        marché lire le total historique — on vient voir ce qui est en vente.
        Tout tenait à défiler avant d'apercevoir la première carte.

        Les chiffres ne disparaissent pas : ils passent en une ligne de contexte
        sous le titre, où on les lit sans qu'ils prennent la place des cartes.
      */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <TitreGlace taille="page">Le marché</TitreGlace>
          <p className="mt-1 text-[15px] text-muted">
            Enchéris sur les cartes des autres, ou vends les tiennes contre des flocons.
          </p>
          <p className="mt-1 text-[13px] text-faint">
            <strong className="text-ink-2">{data.totalActive}</strong> en vente ·{' '}
            <strong className="text-ink-2">{data.volume24h.length}</strong> conclues en 24 h
            {volumeFlakes > 0 && <> pour {flakes(volumeFlakes)} ❄</>} ·{' '}
            <strong className="text-ink-2">{data.totalSales}</strong> depuis le début ·{' '}
            {MARKET.maxActiveListingsPerPlayer} ventes simultanées par joueur
          </p>
        </div>

        {viewerId ? (
          <Link href="/ma-collection#vendre" className="btn btn-ice shrink-0 no-underline">
            Vendre une carte
          </Link>
        ) : (
          <Link href="/connexion" className="btn shrink-0 no-underline">
            Se connecter
          </Link>
        )}
      </header>

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
