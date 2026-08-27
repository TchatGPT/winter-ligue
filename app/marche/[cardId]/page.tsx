import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MarketBoard, type MarketListing } from '@/components/MarketBoard';
import { PriceChart } from '@/components/PriceChart';
import { CardTile, RarityChip, StatTile, flakes, rarityMeta } from '@/components/ui';
import { getSession } from '@/lib/auth/session';
import type { Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { cardsOfTheme, getCard, THEMES } from '@/lib/domain/catalog';
import { minimumBid } from '@/lib/domain/market';
import type { ThemeId } from '@/lib/domain/types';
import { closeExpiredListings, lastBuyerPseudo, statsForCard } from '@/lib/services/market';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const card = getCard(cardId);
  return { title: card ? `Cote — ${card.name}` : 'Carte inconnue' };
}

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className="text-faint">—</span>;
  const up = value >= 0;
  return (
    <span className={up ? 'text-aurora' : 'text-danger'}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)} %
    </span>
  );
}

/**
 * Fiche d'une carte : sa cote, sa courbe, ses ventes en cours et son historique.
 *
 * Doublon assumé de la boîte « Vue du marché » du marché : celle-ci est une
 * vraie URL, partageable dans un chat et indexable, là où la boîte sert à
 * consulter sans quitter la grille.
 */
export default async function CoteCartePage({ params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const card = getCard(cardId);
  if (!card) notFound();

  const session = await getSession();
  const viewerId = session?.role === 'joueur' ? session.sub : null;

  const data = await getStore().transaction((db) => {
    closeExpiredListings(db);
    const pseudo = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Inconnu';
    const stats = statsForCard(db as Database, cardId);

    const rows: MarketListing[] = db.listings
      .filter((l) => l.cardId === cardId && l.status === 'ACTIVE')
      .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
      .map((l) => ({
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
        quote: stats.lastPrice,
      }));

    return {
      stats,
      lastBuyer: lastBuyerPseudo(db as Database, cardId),
      balance: viewerId ? (db.players.find((p) => p.id === viewerId)?.snowflakes ?? null) : null,
      marketOpen: db.config.marketOpen,
      listings: rows,
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
        })),
    };
  });

  const meta = rarityMeta(card.rarity);
  const theme = THEMES[card.theme as ThemeId];
  const siblings = cardsOfTheme(card.theme).filter((c) => c.id !== card.id);

  return (
    <div className="space-y-5">
      <nav className="text-xs text-faint">
        <Link href="/marche" className="text-muted no-underline hover:text-ice">
          Hôtel des ventes
        </Link>{' '}
        / <span className="text-ink">{card.name}</span>
      </nav>

      <header className="panel panel-frost relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background: `radial-gradient(ellipse 55% 100% at 8% 50%, ${meta.color}22 0%, transparent 65%)`,
          }}
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-start gap-5">
          <div className="w-[132px] shrink-0">
            <CardTile
              cardId={card.id}
              name={card.name}
              subtitle={card.subtitle}
              rarity={card.rarity}
              theme={card.theme}
              glyph={card.glyph}
              power={card.power}
              quote={data.stats.lastPrice}
              nature={card.nature}
            />
          </div>

          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl leading-none font-black tracking-wide text-ink uppercase">
                {card.name}
              </h1>
              <RarityChip rarity={card.rarity} />
              {card.nature === 'malus' && (
                <span className="badge border-danger/50 text-danger">Malus</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-faint">{card.subtitle}</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{card.description}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
              <span>
                Famille{' '}
                <span style={{ color: theme.color }}>
                  {theme.glyph} {theme.name}
                </span>
              </span>
              <span>
                Puissance <span className="num text-danger">⚡ {card.power}</span>
              </span>
              <span>
                Tendance 7 j : <Trend value={data.stats.trend7d} />
              </span>
              {data.lastBuyer && <span>Dernier acheteur : {data.lastBuyer}</span>}
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatTile label="Ventes" value={data.stats.volume} accent="ink" />
        <StatTile
          label="Dernier prix"
          value={data.stats.lastPrice !== null ? flakes(data.stats.lastPrice) : '—'}
        />
        <StatTile
          label="Moyenne"
          value={data.stats.averagePrice !== null ? flakes(data.stats.averagePrice) : '—'}
          accent="ink"
        />
        <StatTile
          label="Min / Max"
          value={
            data.stats.minPrice !== null
              ? `${flakes(data.stats.minPrice)} / ${flakes(data.stats.maxPrice!)}`
              : '—'
          }
          accent="violet"
        />
        <StatTile
          label="Plancher"
          value={data.stats.floorPrice !== null ? flakes(data.stats.floorPrice) : '—'}
          hint={`${data.stats.activeListings} en vente`}
          accent="gold"
        />
      </section>

      <section className="panel panel-frost">
        <h2 className="border-b border-line px-4 py-2.5 font-display text-sm font-black tracking-wider text-ink uppercase">
          Évolution des prix
        </h2>
        <div className="pt-2">
          <PriceChart
            points={data.stats.history}
            color={meta.color}
            average={data.stats.averagePrice}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-black tracking-wide text-ink uppercase">
          Ventes en cours
        </h2>
        <MarketBoard
          listings={data.listings}
          myListings={[]}
          myBids={[]}
          won={[]}
          history={[]}
          viewerId={viewerId}
          balance={data.balance}
          marketOpen={data.marketOpen}
        />
      </section>

      {data.sales.length > 0 && (
        <section className="panel panel-frost">
          <h2 className="border-b border-line px-4 py-2.5 font-display text-sm font-black tracking-wider text-ink uppercase">
            Historique des ventes
          </h2>
          <div className="scroll-x">
            <table className="grid-table min-w-[560px]">
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
                    <td className="num text-[11px] text-faint">
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
                    <td
                      className="num text-right font-display font-black"
                      style={{ color: meta.color }}
                    >
                      ❄ {flakes(sale.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-sm font-black tracking-wider text-muted uppercase">
          Le reste de la famille {theme.name}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {siblings.map((sibling) => (
            <CardTile
              key={sibling.id}
              cardId={sibling.id}
              name={sibling.name}
              subtitle={sibling.subtitle}
              rarity={sibling.rarity}
              theme={sibling.theme}
              glyph={sibling.glyph}
              power={sibling.power}
              nature={sibling.nature}
              href={`/marche/${sibling.id}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
