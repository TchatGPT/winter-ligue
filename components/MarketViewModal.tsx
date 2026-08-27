'use client';

import { useEffect, useState } from 'react';
import { PriceChart } from '@/components/PriceChart';
import { RarityChip, flakes, rarityMeta } from '@/components/ui';
import type { MarketStats } from '@/lib/domain/types';

interface CardInfo {
  id: string;
  name: string;
  subtitle: string;
  rarity: string;
  theme: string;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  power: number;
}

interface SaleRow {
  id: string;
  price: number;
  method: 'ENCHERE' | 'ACHAT_IMMEDIAT';
  soldAt: string;
  buyer: string;
  seller: string;
  rarity: string;
}

interface Payload {
  card: CardInfo;
  stats: MarketStats;
  lastBuyer: string | null;
  sales: SaleRow[];
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[13px] font-bold tracking-[0.16em] text-faint uppercase">{label}</div>
      <div
        className="num font-display text-lg leading-tight font-black"
        style={{ color: accent ?? 'var(--ink)' }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * « Vue du marché » d'une carte : cote, extrêmes, tendance, courbe et dernières
 * transactions.
 *
 * Les données sont chargées à l'ouverture plutôt qu'embarquées dans la page :
 * précalculer la cote des 24 cartes pour chaque visiteur serait du travail jeté
 * dans 23 cas sur 24.
 */
export function MarketViewModal({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pas de remise à zéro synchrone ici : le composant est monté avec une clé
  // par carte, il repart donc toujours d'un état vierge.
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/market/stats/${encodeURIComponent(cardId)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.ok) {
          setError(payload.error?.message ?? 'Cote indisponible.');
          return;
        }
        setData(payload.data);
      })
      .catch(() => {
        if (!cancelled) setError('Le serveur n’a pas répondu.');
      });

    return () => {
      cancelled = true;
    };
  }, [cardId]);

  // Échap ferme, et le défilement de la page est gelé tant que la boîte est là.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const meta = data ? rarityMeta(data.card.rarity) : null;
  const trend = data?.stats.trend7d ?? null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Vue du marché"
      onClick={onClose}
    >
      <div
        className="glass max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-b-none sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* -------------------------- Entête -------------------------- */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-white/10 bg-[#0a1220]/85 px-4 py-3 backdrop-blur">
          {data && (
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl"
              style={{
                background: `linear-gradient(160deg, ${meta!.color}33, transparent)`,
                border: `1px solid ${meta!.color}55`,
              }}
              aria-hidden="true"
            >
              {data.card.glyph}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-lg leading-tight font-black tracking-wide text-ink uppercase">
                {data ? data.card.name : 'Vue du marché'}
              </h2>
              {data && <RarityChip rarity={data.card.rarity} />}
            </div>
            <p className="truncate text-xs text-faint">
              {data ? data.card.description : 'Chargement de la cote…'}
            </p>
          </div>
          <button
            className="btn btn-sm btn-ghost shrink-0"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-4">
          {error && <p className="text-sm text-danger">{error}</p>}

          {!data && !error && (
            <div className="flex h-64 items-center justify-center text-sm text-faint">
              Chargement…
            </div>
          )}

          {data && (
            <>
              <section>
                <h3 className="mb-2 font-display text-xs font-bold tracking-[0.18em] text-muted uppercase">
                  Évolution des prix
                </h3>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Stat label="Ventes" value={String(data.stats.volume)} />
                  <Stat
                    label="Dernier"
                    value={data.stats.lastPrice !== null ? flakes(data.stats.lastPrice) : '—'}
                    accent={meta!.color}
                  />
                  <Stat
                    label="Moyenne"
                    value={data.stats.averagePrice !== null ? flakes(data.stats.averagePrice) : '—'}
                  />
                  <Stat
                    label="Min"
                    value={data.stats.minPrice !== null ? flakes(data.stats.minPrice) : '—'}
                  />
                  <Stat
                    label="Max"
                    value={data.stats.maxPrice !== null ? flakes(data.stats.maxPrice) : '—'}
                  />
                </div>

                <div className="mt-3 rounded-lg border border-white/10 bg-white/5 pt-2">
                  <PriceChart
                    points={data.stats.history}
                    color={meta!.color}
                    average={data.stats.averagePrice}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-faint">
                  <span>
                    Tendance 7 j :{' '}
                    {trend === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className={trend >= 0 ? 'text-aurora' : 'text-danger'}>
                        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)} %
                      </span>
                    )}
                  </span>
                  {data.lastBuyer && (
                    <span>
                      Dernier acheteur : <span className="text-muted">{data.lastBuyer}</span>
                    </span>
                  )}
                  {data.stats.floorPrice !== null && (
                    <span>
                      Plancher actuel :{' '}
                      <span className="num text-ice">❄ {flakes(data.stats.floorPrice)}</span>
                    </span>
                  )}
                  <span>
                    {data.stats.activeListings} en vente · ⚡ {data.card.power} de puissance
                  </span>
                </div>
              </section>

              <section>
                <h3 className="mb-2 font-display text-xs font-bold tracking-[0.18em] text-muted uppercase">
                  {Math.min(10, data.sales.length)} dernières ventes
                </h3>

                {data.sales.length === 0 ? (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-6 text-center text-xs text-faint">
                    Cette carte n’a encore jamais changé de mains.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {data.sales.slice(0, 10).map((sale) => (
                      <li
                        key={sale.id}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                        style={{ borderLeft: `3px solid ${meta!.color}` }}
                      >
                        <RarityChip rarity={sale.rarity} />
                        <span className="num shrink-0 text-[13px] text-faint">
                          {new Date(sale.soldAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                          {sale.seller} → {sale.buyer}
                          <span className="ml-1.5 text-faint">
                            {sale.method === 'ENCHERE' ? '· enchère' : '· achat immédiat'}
                          </span>
                        </span>
                        <span
                          className="num shrink-0 font-display text-sm font-black"
                          style={{ color: meta!.color }}
                        >
                          ❄ {flakes(sale.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
