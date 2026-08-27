'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Countdown } from '@/components/Countdown';
import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

export interface ListingItem {
  id: string;
  cardId: string;
  card: { id: string; name: string; rarity: string; theme: string; glyph: string };
  sellerId: string;
  sellerPseudo: string;
  currentPrice: number;
  buyoutPrice: number | null;
  currentBidderId: string | null;
  currentBidderPseudo: string | null;
  bidCount: number;
  minimumNextBid: number;
  endsAt: string;
}

/**
 * Une vente à l'hôtel des ventes.
 *
 * Les boutons sont désactivés côté client pour l'ergonomie (sa propre vente,
 * flocons insuffisants, déjà en tête), mais chacune de ces règles est
 * réappliquée par le serveur : contourner l'affichage ne donne rien.
 */
export function ListingRow({
  listing,
  viewerId,
  balance,
}: {
  listing: ListingItem;
  viewerId: string | null;
  balance: number | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(listing.minimumNextBid);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const meta = RARITY_META[listing.card.rarity as Rarity] ?? RARITY_META.COMMUNE;
  const isSeller = viewerId === listing.sellerId;
  const isLeading = viewerId !== null && viewerId === listing.currentBidderId;
  const canAffordBid = balance !== null && balance >= listing.minimumNextBid;
  const canAffordBuyout =
    listing.buyoutPrice !== null && balance !== null && balance >= listing.buyoutPrice;

  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setMessage({ kind: 'error', text: payload.error?.message ?? 'Action refusée.' });
        // Le minimum a peut-être bougé entre-temps : on le reprend du serveur.
        if (typeof payload.error?.minimum === 'number') setAmount(payload.error.minimum);
        return;
      }
      setMessage({ kind: 'success', text: 'C’est passé.' });
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="game-card"
      style={{ ['--rarity' as string]: meta.color }}
    >
      <div className="flex items-start gap-3">
        <span className="game-card__glyph" aria-hidden="true">
          {listing.card.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            href={`/marche/${listing.cardId}`}
            className="block truncate font-display text-sm font-bold uppercase leading-tight tracking-wide text-ink no-underline hover:text-ice"
          >
            {listing.card.name}
          </Link>
          <span
            className="font-display text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-tight">
          <div className="text-faint">Fin dans</div>
          <Countdown endsAt={listing.endsAt} onExpire={() => router.refresh()} />
        </div>
      </div>

      <dl className="mt-3 space-y-1 border-t border-line pt-2.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-faint">Enchère</dt>
          <dd className="num font-display text-base font-black text-ice">
            ❄ {listing.currentPrice.toLocaleString('fr-FR')}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-faint">Mises</dt>
          <dd className="num text-muted">
            {listing.bidCount}
            {listing.currentBidderPseudo && (
              <span className={isLeading ? 'ml-1 text-aurora' : 'ml-1 text-muted'}>
                · {isLeading ? 'toi' : listing.currentBidderPseudo}
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-faint">Vendeur</dt>
          <dd className="truncate text-muted">{isSeller ? 'toi' : listing.sellerPseudo}</dd>
        </div>
      </dl>

      {viewerId && !isSeller && (
        <div className="mt-3 space-y-2 border-t border-line pt-2.5">
          <div className="flex gap-1.5">
            <input
              type="number"
              className="field num flex-1 !py-1 !text-xs"
              min={listing.minimumNextBid}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={`Montant de l’enchère, minimum ${listing.minimumNextBid}`}
              disabled={busy || isLeading}
            />
            <button
              className="btn btn-sm btn-ice shrink-0"
              disabled={busy || isLeading || !canAffordBid}
              onClick={() => send('/api/market/bid', { listingId: listing.id, amount })}
              title={
                isLeading
                  ? 'Tu es déjà le meilleur enchérisseur'
                  : `Minimum ${listing.minimumNextBid} ❄`
              }
            >
              Enchérir
            </button>
          </div>

          {listing.buyoutPrice !== null && (
            <button
              className="btn btn-sm btn-gold w-full"
              disabled={busy || !canAffordBuyout}
              onClick={() => send('/api/market/buyout', { listingId: listing.id })}
            >
              Achat immédiat — ❄ {listing.buyoutPrice.toLocaleString('fr-FR')}
            </button>
          )}
        </div>
      )}

      {message && (
        <p
          className={`mt-2 text-[11px] ${message.kind === 'error' ? 'text-danger' : 'text-aurora'}`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </article>
  );
}
