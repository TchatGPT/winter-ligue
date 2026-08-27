import { NextResponse } from 'next/server';
import { fail, guard, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import {
  closeExpiredListings,
  lastBuyerPseudo,
  statsForCard,
  viewListing,
  type ListingView,
} from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cote d'une carte : dernier prix, dernier acheteur, moyenne, extrêmes, volume,
 * tendance à 7 jours, courbe des ventes conclues et transactions récentes.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
): Promise<NextResponse> {
  const g = await guard(request, { scope: 'market-stats' });
  if (!g.ok) return g.response;

  const { cardId } = await context.params;
  const card = getCard(cardId);
  if (!card) return fail('INTROUVABLE', 'Carte inconnue.');

  const data = await getStore().transaction((db) => {
    closeExpiredListings(db);

    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Inconnu';

    return {
      card: {
        id: card.id,
        name: card.name,
        subtitle: card.subtitle,
        rarity: card.rarity,
        theme: card.theme,
        glyph: card.glyph,
        description: card.description,
        nature: card.nature,
        power: card.power,
      },
      stats: statsForCard(db, cardId),
      lastBuyer: lastBuyerPseudo(db, cardId),
      sales: db.sales
        .filter((s) => s.cardId === cardId)
        .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
        .slice(0, 15)
        .map((s) => ({
          id: s.id,
          price: s.price,
          method: s.method,
          soldAt: s.soldAt,
          buyer: pseudo(s.buyerId),
          seller: pseudo(s.sellerId),
          rarity: card.rarity,
        })),
      listings: db.listings
        .filter((l) => l.cardId === cardId && l.status === 'ACTIVE')
        .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
        .map((l) => viewListing(db, l))
        .filter((l): l is ListingView => l !== null),
    };
  });

  return ok(data);
}
