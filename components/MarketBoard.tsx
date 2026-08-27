'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Countdown } from '@/components/Countdown';
import { MarketViewModal } from '@/components/MarketViewModal';
import { EmptyState, Notice, RarityChip, flakes, flakesShort, rarityMeta } from '@/components/ui';
import { MARKET } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

const RARITIES: Rarity[] = ['L', 'UR', 'SR', 'R', 'PC', 'C'];

export interface MarketListing {
  id: string;
  cardId: string;
  name: string;
  subtitle: string;
  rarity: string;
  theme: string;
  glyph: string;
  power: number;
  sellerId: string;
  sellerPseudo: string;
  startPrice: number;
  currentPrice: number;
  buyoutPrice: number | null;
  currentBidderId: string | null;
  currentBidderPseudo: string | null;
  bidCount: number;
  minimumNextBid: number;
  endsAt: string;
  /** Cote de la carte : dernier prix constaté toutes ventes confondues. */
  quote: number | null;
}

export interface MarketSale {
  id: string;
  cardId: string;
  name: string;
  rarity: string;
  glyph: string;
  price: number;
  method: 'ENCHERE' | 'ACHAT_IMMEDIAT';
  soldAt: string;
  buyer: string;
  seller: string;
  /** 'ACHAT' si le joueur courant est l'acheteur, 'VENTE' s'il est le vendeur. */
  side: 'ACHAT' | 'VENTE';
}

type TabId = 'parcourir' | 'ventes' | 'encheres' | 'gagnees' | 'historique';
type SortId = 'fin' | 'prix_asc' | 'prix_desc' | 'recent' | 'rarete';

const SORTS: { id: SortId; label: string }[] = [
  { id: 'fin', label: 'Fin imminente' },
  { id: 'prix_asc', label: 'Prix croissant' },
  { id: 'prix_desc', label: 'Prix décroissant' },
  { id: 'recent', label: 'Plus récentes' },
  { id: 'rarete', label: 'Rareté' },
];

const RARITY_RANK: Record<string, number> = { C: 0, PC: 1, R: 2, SR: 3, UR: 4, L: 5 };

/** Retire accents et casse pour que « tempete » trouve « Tempête ». */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Hôtel des ventes.
 *
 * Les onglets, la recherche et les filtres travaillent sur le lot déjà chargé :
 * la ligue tient dans quelques centaines de ventes, et filtrer en local rend
 * l'interface instantanée. Au-delà, la page serveur bascule sur une requête
 * paginée sans changer ce composant.
 *
 * Chaque bouton est désactivé côté client pour l'ergonomie — sa propre vente,
 * flocons insuffisants, déjà en tête — mais toutes ces règles sont réappliquées
 * par le serveur : contourner l'affichage ne donne rien.
 */
export function MarketBoard({
  listings,
  myListings,
  myBids,
  won,
  history,
  viewerId,
  balance,
  marketOpen,
}: {
  listings: MarketListing[];
  myListings: MarketListing[];
  myBids: MarketListing[];
  won: MarketSale[];
  history: MarketSale[];
  viewerId: string | null;
  balance: number | null;
  marketOpen: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('parcourir');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('fin');
  const [rarityFilter, setRarityFilter] = useState<Set<string>>(new Set());
  const [modalCard, setModalCard] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const source =
    tab === 'ventes' ? myListings : tab === 'encheres' ? myBids : listings;

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    let rows = source;

    if (q) {
      rows = rows.filter(
        (l) => fold(l.name).includes(q) || fold(l.subtitle).includes(q) || fold(l.sellerPseudo).includes(q),
      );
    }
    if (rarityFilter.size > 0) {
      rows = rows.filter((l) => rarityFilter.has(l.rarity));
    }

    const sorted = [...rows];
    switch (sort) {
      case 'prix_asc':
        sorted.sort((a, b) => a.currentPrice - b.currentPrice);
        break;
      case 'prix_desc':
        sorted.sort((a, b) => b.currentPrice - a.currentPrice);
        break;
      case 'recent':
        sorted.sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());
        break;
      case 'rarete':
        sorted.sort(
          (a, b) =>
            (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0) ||
            b.currentPrice - a.currentPrice,
        );
        break;
      default:
        sorted.sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
    }
    return sorted;
  }, [source, query, rarityFilter, sort]);

  const sales = tab === 'gagnees' ? won : history;

  function toggleRarity(rarity: string) {
    setRarityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });
  }

  async function send(path: string, body: Record<string, unknown>, method = 'POST', key = '') {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setMessage({ kind: 'error', text: payload.error?.message ?? 'Action refusée.' });
        return;
      }
      setMessage({ kind: 'success', text: 'C’est passé.' });
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(null);
    }
  }

  const tabs: { id: TabId; label: string; count: string }[] = [
    { id: 'parcourir', label: 'Parcourir', count: String(listings.length) },
    {
      id: 'ventes',
      label: 'Mes ventes',
      count: `${myListings.length}/${MARKET.maxActiveListingsPerPlayer}`,
    },
    { id: 'encheres', label: 'Mes enchères', count: String(myBids.length) },
    { id: 'gagnees', label: 'Gagnées', count: String(won.length) },
    { id: 'historique', label: 'Historique', count: String(history.length) },
  ].filter((t) => viewerId !== null || t.id === 'parcourir') as { id: TabId; label: string; count: string }[];

  const showsListings = tab === 'parcourir' || tab === 'ventes' || tab === 'encheres';

  return (
    <div className="space-y-4">
      {!marketOpen && (
        <Notice kind="error">L’hôtel des ventes est fermé par la modération.</Notice>
      )}
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {/* ------------------------------ Onglets -------------------------- */}
      <div className="scroll-x-clean border-b border-line">
        <div className="flex min-w-max gap-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              className="tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="tab-count">({t.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* -------------------- Recherche, tri, raretés -------------------- */}
      {showsListings && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <span
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-faint"
                aria-hidden="true"
              >
                ⌕
              </span>
              <input
                className="field pl-8"
                placeholder="Rechercher une carte, un vendeur…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher"
              />
            </div>
            <select
              className="field sm:w-52"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              aria-label="Trier"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {RARITIES.map((r) => {
              const meta = rarityMeta(r);
              const active = rarityFilter.has(r);
              return (
                <button
                  key={r}
                  onClick={() => toggleRarity(r)}
                  aria-pressed={active}
                  title={meta.label}
                  className="rounded-md border px-2 py-1 font-display text-[11px] font-black tracking-wider uppercase transition-colors"
                  style={{
                    borderColor: active ? meta.color : 'var(--line-2)',
                    color: active ? '#060a12' : meta.color,
                    background: active ? meta.color : 'transparent',
                  }}
                >
                  {meta.code}
                </button>
              );
            })}
            {rarityFilter.size > 0 && (
              <button className="btn btn-sm btn-ghost" onClick={() => setRarityFilter(new Set())}>
                Tout
              </button>
            )}
            <span className="ml-auto text-[11px] text-faint">
              {filtered.length} vente{filtered.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* ----------------------------- Vignettes ------------------------- */}
      {showsListings ? (
        filtered.length === 0 ? (
          <EmptyState
            title={
              tab === 'ventes'
                ? 'Aucune vente en cours'
                : tab === 'encheres'
                  ? 'Aucune enchère en tête'
                  : 'Aucune vente ne correspond'
            }
            hint={
              tab === 'ventes'
                ? 'Mets une carte en vente depuis ta collection : tu choisis le prix de départ, l’achat immédiat et la durée.'
                : tab === 'encheres'
                  ? 'Les ventes où tu es le meilleur enchérisseur apparaîtront ici, avec tes flocons en séquestre.'
                  : 'Essaie de retirer un filtre de rareté ou d’élargir ta recherche.'
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                viewerId={viewerId}
                balance={balance}
                busy={busy}
                marketOpen={marketOpen}
                onView={() => setModalCard(listing.cardId)}
                onBid={(amount) =>
                  send('/api/market/bid', { listingId: listing.id, amount }, 'POST', listing.id)
                }
                onBuyout={() =>
                  send('/api/market/buyout', { listingId: listing.id }, 'POST', listing.id)
                }
                onCancel={() =>
                  send('/api/market/listings', { listingId: listing.id }, 'DELETE', listing.id)
                }
                onExpire={() => router.refresh()}
                isMine={tab === 'ventes'}
              />
            ))}
          </div>
        )
      ) : sales.length === 0 ? (
        <EmptyState
          title={tab === 'gagnees' ? 'Aucune carte remportée' : 'Aucune transaction'}
          hint={
            tab === 'gagnees'
              ? 'Les cartes que tu remportes aux enchères ou par achat immédiat s’afficheront ici.'
              : 'Tes ventes et tes achats apparaîtront dans cet historique.'
          }
        />
      ) : (
        <div className="panel scroll-x">
          <table className="grid-table min-w-[620px]">
            <thead>
              <tr>
                <th className="w-10" />
                <th>Carte</th>
                <th>{tab === 'gagnees' ? 'Vendeur' : 'Contrepartie'}</th>
                <th>Type</th>
                <th className="text-right">Prix</th>
                <th className="text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const meta = rarityMeta(sale.rarity);
                return (
                  <tr key={sale.id}>
                    <td>
                      <RarityChip rarity={sale.rarity} />
                    </td>
                    <td>
                      <button
                        className="flex items-center gap-1.5 text-left text-ink hover:text-ice"
                        onClick={() => setModalCard(sale.cardId)}
                      >
                        <span aria-hidden="true">{sale.glyph}</span>
                        <span className="truncate">{sale.name}</span>
                      </button>
                    </td>
                    <td className="text-muted">
                      {tab === 'gagnees' ? sale.seller : sale.side === 'VENTE' ? sale.buyer : sale.seller}
                      {tab === 'historique' && (
                        <span className="ml-1.5 text-[10px] text-faint uppercase">
                          {sale.side === 'VENTE' ? 'vendu' : 'acheté'}
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-faint">
                      {sale.method === 'ENCHERE' ? 'Enchère' : 'Achat immédiat'}
                    </td>
                    <td
                      className="num text-right font-display font-black"
                      style={{ color: meta.color }}
                    >
                      ❄ {flakes(sale.price)}
                    </td>
                    <td className="num text-right text-[11px] text-faint">
                      {new Date(sale.soldAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalCard && (
        <MarketViewModal key={modalCard} cardId={modalCard} onClose={() => setModalCard(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function ListingCard({
  listing,
  viewerId,
  balance,
  busy,
  marketOpen,
  isMine,
  onView,
  onBid,
  onBuyout,
  onCancel,
  onExpire,
}: {
  listing: MarketListing;
  viewerId: string | null;
  balance: number | null;
  busy: string | null;
  marketOpen: boolean;
  isMine: boolean;
  onView: () => void;
  onBid: (amount: number) => void;
  onBuyout: () => void;
  onCancel: () => void;
  onExpire: () => void;
}) {
  const meta = rarityMeta(listing.rarity);
  const [amount, setAmount] = useState(listing.minimumNextBid);
  const [expanded, setExpanded] = useState(false);

  const seller = viewerId === listing.sellerId;
  const leading = viewerId !== null && viewerId === listing.currentBidderId;
  const canBid = balance !== null && balance >= listing.minimumNextBid;
  const canBuy =
    listing.buyoutPrice !== null && balance !== null && balance >= listing.buyoutPrice;
  const working = busy === listing.id;

  return (
    <article
      className={`tcg tcg-hover h-full ${leading ? 'ring-1 ring-aurora/50' : ''}`}
      style={{ ['--r' as string]: meta.color }}
    >
      <button
        type="button"
        onClick={onView}
        className="block w-full text-left"
        aria-label={`Voir la cote de ${listing.name}`}
      >
        <div className={`tcg-art ${meta.holo ? 'tcg-holo' : ''}`}>
          <span className="tcg-glyph" aria-hidden="true">
            {listing.glyph}
          </span>
          <span className="absolute top-1.5 left-1.5">
            <RarityChip rarity={listing.rarity} />
          </span>
          <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1 py-px text-[9px] font-bold text-ink/90 backdrop-blur-sm">
            ⚡ {listing.power}
          </span>
        </div>
      </button>

      <div className="tcg-body">
        <h3 className="tcg-name">{listing.name}</h3>
        <p className="tcg-sub">{listing.subtitle}</p>

        <dl className="mt-2 space-y-0.5 border-t border-line pt-1.5 text-[10px]">
          <div className="flex items-baseline justify-between gap-1">
            <dt className="tracking-wider text-faint uppercase">
              {listing.bidCount > 0 ? 'Mise actuelle' : 'Mise de départ'}
            </dt>
            <dd
              className="num font-display text-sm font-black"
              style={{ color: meta.color }}
            >
              ❄ {flakes(listing.currentPrice)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <dt className="tracking-wider text-faint uppercase">Durée</dt>
            <dd className="num text-[11px]">
              <Countdown endsAt={listing.endsAt} onExpire={onExpire} />
            </dd>
          </div>
          {listing.quote !== null && (
            <div className="flex items-baseline justify-between gap-1">
              <dt className="tracking-wider text-faint uppercase">Cote</dt>
              <dd className="num text-[11px] text-muted">❄ {flakesShort(listing.quote)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="tcg-foot">
        <p className="truncate text-faint">
          {seller ? (
            <span className="text-muted">Ta vente</span>
          ) : (
            <>Vendu par <span className="text-muted">{listing.sellerPseudo}</span></>
          )}
          {listing.bidCount > 0 && (
            <span className={leading ? 'ml-1 text-aurora' : 'ml-1 text-faint'}>
              · {listing.bidCount} mise{listing.bidCount > 1 ? 's' : ''}
              {leading && ' · toi'}
            </span>
          )}
        </p>

        {isMine && viewerId && (
          <button
            className="btn btn-sm btn-danger mt-1.5 w-full"
            disabled={working || listing.bidCount > 0}
            title={listing.bidCount > 0 ? 'Impossible : des enchères sont en cours' : undefined}
            onClick={onCancel}
          >
            Retirer
          </button>
        )}

        {viewerId && !seller && marketOpen && (
          <>
            {!expanded ? (
              <button
                className="btn btn-sm btn-ice mt-1.5 w-full"
                onClick={() => setExpanded(true)}
                disabled={leading}
              >
                {leading ? 'Tu es en tête' : 'Enchérir'}
              </button>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                <div className="flex gap-1">
                  <input
                    type="number"
                    className="field num flex-1 !px-1.5 !py-1 !text-[11px]"
                    min={listing.minimumNextBid}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    aria-label={`Montant, minimum ${listing.minimumNextBid}`}
                    disabled={working}
                  />
                  <button
                    className="btn btn-sm btn-ice shrink-0 !px-2"
                    disabled={working || !canBid}
                    onClick={() => onBid(amount)}
                    title={`Minimum ${listing.minimumNextBid} ❄`}
                  >
                    OK
                  </button>
                </div>
                <p className="num text-[10px] text-faint">min ❄ {flakes(listing.minimumNextBid)}</p>
              </div>
            )}

            {listing.buyoutPrice !== null && (
              <button
                className="btn btn-sm btn-gold mt-1 w-full !text-[10px]"
                disabled={working || !canBuy}
                onClick={onBuyout}
              >
                Achat ❄ {flakesShort(listing.buyoutPrice)}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
