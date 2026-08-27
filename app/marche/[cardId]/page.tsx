import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ListingRow, type ListingItem } from '@/components/ListingRow';
import { PriceChart } from '@/components/PriceChart';
import { EmptyState, RarityBadge, StatTile, ThemeBadge, formatFlakes } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { CARDS, getCard, RARITY_META, THEMES } from '@/lib/domain/catalog';
import type { Rarity, ThemeId } from '@/lib/domain/types';
import {
  closeExpiredListings,
  statsForCard,
  viewListing,
  type ListingView,
} from '@/lib/services/market';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const card = getCard(cardId);
  return { title: card ? `Cote — ${card.name}` : 'Carte inconnue' };
}

/** Petite flèche de tendance, verte à la hausse, rouge à la baisse. */
function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-faint">—</span>;
  const up = value >= 0;
  return (
    <span className={up ? 'text-aurora' : 'text-danger'}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)} %
    </span>
  );
}

export default async function CoteCartePage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const card = getCard(cardId);
  if (!card) notFound();

  const session = await getSession();
  const viewerId = session?.role === 'joueur' ? session.sub : null;

  const data = await getStore().transaction((db) => {
    closeExpiredListings(db);
    const stats = statsForCard(db, cardId);
    const sales = db.sales
      .filter((s) => s.cardId === cardId)
      .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        price: s.price,
        method: s.method,
        soldAt: s.soldAt,
        buyer: db.players.find((p) => p.id === s.buyerId)?.pseudo ?? 'Inconnu',
        seller: db.players.find((p) => p.id === s.sellerId)?.pseudo ?? 'Inconnu',
      }));

    return {
      stats,
      sales,
      lastBuyer: stats.lastBuyerId
        ? (db.players.find((p) => p.id === stats.lastBuyerId)?.pseudo ?? null)
        : null,
      balance: viewerId ? (db.players.find((p) => p.id === viewerId)?.snowflakes ?? null) : null,
      listings: db.listings
        .filter((l) => l.cardId === cardId && l.status === 'ACTIVE')
        .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
        .map((l) => viewListing(db, l))
        .filter((l): l is ListingView => l !== null),
    };
  });

  const meta = RARITY_META[card.rarity as Rarity];
  const theme = THEMES[card.theme as ThemeId];
  const siblings = CARDS.filter((c) => c.theme === card.theme && c.id !== card.id);

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
      <nav className="text-xs text-faint">
        <Link href="/marche" className="text-muted no-underline hover:text-ice">
          Hôtel des ventes
        </Link>{' '}
        / {card.name}
      </nav>

      <header className="panel panel-frost flex flex-wrap items-start gap-4 p-5">
        <span className="text-5xl leading-none" aria-hidden="true">
          {card.glyph}
        </span>
        <div className="min-w-[240px] flex-1">
          <h1 className="font-display text-2xl font-black uppercase tracking-wide text-ink">
            {card.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <RarityBadge rarity={card.rarity} />
            <ThemeBadge theme={card.theme} />
            {card.nature === 'malus' && (
              <span className="badge border-danger/50 text-danger">Malus</span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">{card.description}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Dernier prix"
          value={data.stats.lastPrice !== null ? `❄ ${formatFlakes(data.stats.lastPrice)}` : '—'}
          hint={data.lastBuyer ? `Acheté par ${data.lastBuyer}` : 'Jamais vendue'}
        />
        <StatTile
          label="Prix moyen"
          value={data.stats.averagePrice !== null ? formatFlakes(data.stats.averagePrice) : '—'}
          hint={
            data.stats.minPrice !== null
              ? `min ${formatFlakes(data.stats.minPrice)} · max ${formatFlakes(data.stats.maxPrice!)}`
              : undefined
          }
          accent="muted"
        />
        <StatTile label="Ventes conclues" value={data.stats.volume} accent="violet" />
        <StatTile
          label="Prix plancher"
          value={data.stats.floorPrice !== null ? formatFlakes(data.stats.floorPrice) : '—'}
          hint={`${data.stats.activeListings} en vente`}
          accent="gold"
        />
      </section>

      <section className="panel panel-frost p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-black uppercase tracking-wider text-ink">
            Évolution du prix
          </h2>
          <span className="text-xs text-muted">
            Tendance 7 jours&nbsp;: <Trend value={data.stats.trend7d} />
          </span>
        </div>
        <PriceChart points={data.stats.history} color={meta.color} />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-black uppercase tracking-wide text-ink">
          Ventes en cours
        </h2>
        {items.length === 0 ? (
          <EmptyState
            title="Aucune vente en cours pour cette carte"
            hint="Reviens plus tard, ou ouvre un booster pour tenter de l’obtenir."
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
      </section>

      {data.sales.length > 0 && (
        <section className="panel panel-frost">
          <h2 className="border-b border-line px-4 py-2.5 font-display text-sm font-black uppercase tracking-wider text-ink">
            Historique des ventes
          </h2>
          <div className="scroll-x">
            <table className="rank-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendeur</th>
                  <th>Acheteur</th>
                  <th>Type</th>
                  <th className="text-right">Prix</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="text-xs text-faint">
                      {new Date(sale.soldAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="text-muted">{sale.seller}</td>
                    <td className="text-ink">{sale.buyer}</td>
                    <td className="text-xs text-faint">
                      {sale.method === 'ENCHERE' ? 'Enchère' : 'Achat immédiat'}
                    </td>
                    <td className="num text-right font-display font-bold text-ice">
                      ❄ {formatFlakes(sale.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-black uppercase tracking-wider text-muted">
          Le reste de la famille {theme.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          {siblings.map((sibling) => (
            <Link
              key={sibling.id}
              href={`/marche/${sibling.id}`}
              className="badge no-underline hover:border-ice hover:text-ice"
            >
              <span aria-hidden="true">{sibling.glyph}</span> {sibling.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
