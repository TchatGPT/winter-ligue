import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { marketQuerySchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { closeExpiredListings, viewListing, type ListingView } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

/**
 * Ventes en cours, filtrées et paginées.
 *
 * La lecture commence par clôturer les ventes échues : le marché affiché est
 * donc toujours à jour, sans dépendre d'une tâche planifiée. Un cron peut tout
 * de même appeler `/api/market/close` pour que les adjudications tombent même
 * sans visiteur.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'market-read' });
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const parsed = marketQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  const query = parsed.success ? parsed.data : marketQuerySchema.parse({});

  const store = getStore();
  const result = await store.transaction((db) => {
    closeExpiredListings(db);

    let listings = db.listings.filter((l) => l.status === 'ACTIVE');

    if (query.cardId) listings = listings.filter((l) => l.cardId === query.cardId);
    if (query.rarity || query.theme) {
      listings = listings.filter((l) => {
        const card = getCard(l.cardId);
        if (!card) return false;
        if (query.rarity && card.rarity !== query.rarity) return false;
        if (query.theme && card.theme !== query.theme) return false;
        return true;
      });
    }

    switch (query.sort) {
      case 'prix_asc':
        listings.sort((a, b) => a.currentPrice - b.currentPrice);
        break;
      case 'prix_desc':
        listings.sort((a, b) => b.currentPrice - a.currentPrice);
        break;
      case 'recent':
        listings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      default:
        listings.sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
    }

    const total = listings.length;
    const start = (query.page - 1) * PAGE_SIZE;
    const page = listings
      .slice(start, start + PAGE_SIZE)
      .map((l) => viewListing(db, l))
      .filter((l): l is ListingView => l !== null);

    return {
      listings: page,
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
      marketOpen: db.config.marketOpen,
    };
  });

  return ok(result);
}
