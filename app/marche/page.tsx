import Link from 'next/link';
import { ListingRow, type ListingItem } from '@/components/ListingRow';
import { EmptyState, StatTile, formatFlakes } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { getCard } from '@/lib/domain/catalog';
import { MARKET } from '@/lib/domain/rules';
import { closeExpiredListings, viewListing, type ListingView } from '@/lib/services/market';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hôtel des ventes' };

interface Search {
  rarity?: string;
  theme?: string;
  sort?: string;
}

/**
 * Hôtel des ventes.
 *
 * La lecture ouvre une transaction pour clôturer d'abord les ventes échues :
 * la page ne montre jamais une enchère qui aurait dû tomber, et les
 * remboursements sont effectifs avant l'affichage des soldes.
 */
export default async function MarchePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const viewerId = session?.role === 'joueur' ? session.sub : null;

  const data = await getStore().transaction((db) => {
    closeExpiredListings(db);

    let listings = db.listings.filter((l) => l.status === 'ACTIVE');
    if (params.rarity) {
      listings = listings.filter((l) => getCard(l.cardId)?.rarity === params.rarity);
    }
    if (params.theme) {
      listings = listings.filter((l) => getCard(l.cardId)?.theme === params.theme);
    }

    switch (params.sort) {
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

    const recentSales = db.sales
      .slice()
      .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
      .slice(0, 8)
      .map((sale) => ({
        id: sale.id,
        cardId: sale.cardId,
        cardName: getCard(sale.cardId)?.name ?? sale.cardId,
        price: sale.price,
        method: sale.method,
        soldAt: sale.soldAt,
        buyer: db.players.find((p) => p.id === sale.buyerId)?.pseudo ?? 'Inconnu',
      }));

    return {
      marketOpen: db.config.marketOpen,
      balance: viewerId
        ? (db.players.find((p) => p.id === viewerId)?.snowflakes ?? null)
        : null,
      volume24h: db.sales.filter(
        (s) => Date.now() - new Date(s.soldAt).getTime() < 24 * 60 * 60 * 1000,
      ).length,
      totalSales: db.sales.length,
      listings: listings
        .map((l) => viewListing(db, l))
        .filter((l): l is ListingView => l !== null)
        .slice(0, 48),
      recentSales,
    };
  });

  const items: ListingItem[] = data.listings.map((l) => ({
    id: l.id,
    cardId: l.cardId,
    card: l.card,
    sellerId: l.sellerId,
    sellerPseudo: l.sellerPseudo,
    currentPrice: l.currentPrice,
    buyoutPrice: l.buyoutPrice,
    currentBidderId: l.currentBidderId,
    currentBidderPseudo: l.currentBidderPseudo,
    bidCount: l.bidCount,
    minimumNextBid: l.minimumNextBid,
    endsAt: l.endsAt,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Enchères entre joueurs</p>
          <h1 className="section-title">
            Hôtel des <em>Ventes</em>
          </h1>
        </div>
        {viewerId && (
          <Link href="/ma-collection#vendre" className="btn btn-ice">
            Vendre une carte
          </Link>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Ventes en cours" value={items.length} />
        <StatTile label="Conclues (24 h)" value={data.volume24h} accent="aurora" />
        <StatTile label="Total historique" value={data.totalSales} accent="muted" />
        <StatTile
          label="Taxe de vente"
          value={`${Math.round(MARKET.feeRate * 100)} %`}
          hint="−50 % si famille Solstice complète"
          accent="gold"
        />
      </section>

      <nav className="scroll-x">
        <div className="flex min-w-max gap-1.5">
          {[
            { label: 'Fin proche', sort: undefined },
            { label: 'Prix croissant', sort: 'prix_asc' },
            { label: 'Prix décroissant', sort: 'prix_desc' },
            { label: 'Plus récentes', sort: 'recent' },
          ].map((option) => {
            const active = (params.sort ?? undefined) === option.sort;
            const query = new URLSearchParams();
            if (option.sort) query.set('sort', option.sort);
            if (params.rarity) query.set('rarity', params.rarity);
            if (params.theme) query.set('theme', params.theme);
            const qs = query.toString();
            return (
              <Link
                key={option.label}
                href={qs ? `/marche?${qs}` : '/marche'}
                className={`btn btn-sm no-underline ${active ? 'btn-ice' : ''}`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {!data.marketOpen && (
        <div className="panel border-danger/40 px-4 py-3 text-sm text-danger">
          L’hôtel des ventes est fermé par la modération.
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Aucune vente en cours"
          hint="Les joueurs peuvent mettre leurs cartes en vente depuis leur collection, au prix et pour la durée de leur choix."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((listing) => (
            <ListingRow
              key={listing.id}
              listing={listing}
              viewerId={viewerId}
              balance={data.balance}
            />
          ))}
        </div>
      )}

      {data.recentSales.length > 0 && (
        <section className="panel panel-frost">
          <h2 className="border-b border-line px-4 py-2.5 font-display text-sm font-black uppercase tracking-wider text-ink">
            Dernières transactions
          </h2>
          <div className="scroll-x">
            <table className="rank-table min-w-[520px]">
              <thead>
                <tr>
                  <th>Carte</th>
                  <th>Acheteur</th>
                  <th>Type</th>
                  <th className="text-right">Prix</th>
                  <th className="text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link
                        href={`/marche/${sale.cardId}`}
                        className="text-ink no-underline hover:text-ice"
                      >
                        {sale.cardName}
                      </Link>
                    </td>
                    <td className="text-muted">{sale.buyer}</td>
                    <td className="text-xs text-faint">
                      {sale.method === 'ENCHERE' ? 'Enchère' : 'Achat immédiat'}
                    </td>
                    <td className="num text-right font-display font-bold text-ice">
                      ❄ {formatFlakes(sale.price)}
                    </td>
                    <td className="text-right text-xs text-faint">
                      {new Date(sale.soldAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
