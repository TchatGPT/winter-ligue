'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CardTile, Notice, formatFlakes } from '@/components/ui';
import type { BoosterDefinition } from '@/lib/domain/types';

interface OpenedCard {
  cardId: string;
  isNew: boolean;
  name: string;
  rarity: string;
  theme: string;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
}

export interface ShopBooster extends BoosterDefinition {
  finalPrice: number;
}

/**
 * Boutique de boosters.
 *
 * Le tirage a lieu entièrement sur le serveur : ce composant se contente
 * d'envoyer un identifiant de booster et d'afficher ce qui revient. Une clé
 * d'idempotence est générée par ouverture, ce qui rend un double clic ou une
 * reprise réseau inoffensifs — le serveur rejoue la même réponse au lieu de
 * débiter une seconde fois.
 */
export function BoosterShop({
  boosters,
  balance,
  discount,
  shopOpen,
  connected,
  catalog,
}: {
  boosters: ShopBooster[];
  balance: number | null;
  discount: number;
  shopOpen: boolean;
  connected: boolean;
  catalog: Record<string, Omit<OpenedCard, 'cardId' | 'isNew'>>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ boosterId: string; cards: OpenedCard[] } | null>(null);

  async function open(boosterId: string) {
    setBusy(boosterId);
    setError(null);
    setOpened(null);

    try {
      const response = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ boosterId, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json();

      if (!payload.ok) {
        setError(payload.error?.message ?? 'Ouverture impossible.');
        return;
      }

      setOpened({
        boosterId,
        cards: payload.data.cards.map((c: { cardId: string; isNew: boolean }) => ({
          ...c,
          ...catalog[c.cardId],
        })),
      });
      // Le solde et la collection ont changé : on rafraîchit le rendu serveur.
      router.refresh();
    } catch {
      setError('Le serveur n’a pas répondu. Réessaie dans un instant.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {!shopOpen && <Notice kind="error">La boutique est actuellement fermée.</Notice>}
      {!connected && (
        <Notice>
          Connecte-toi pour acheter des boosters. Les prix affichés n’incluent pas encore ta
          remise de collection.
        </Notice>
      )}
      {discount > 0 && (
        <Notice kind="success">
          Famille Solstice complète&nbsp;: −{Math.round(discount * 100)} % sur tous les boosters.
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {boosters.map((booster) => {
          const affordable = balance !== null && balance >= booster.finalPrice;
          const disabled = !connected || !shopOpen || !affordable || busy !== null;

          return (
            <article key={booster.id} className="panel panel-frost flex flex-col p-4">
              <div className="text-3xl leading-none" aria-hidden="true">
                {booster.glyph}
              </div>
              <h2 className="mt-2 font-display text-base font-black uppercase tracking-wide text-ink">
                {booster.name}
              </h2>
              <p className="text-xs text-faint">{booster.tagline}</p>

              <dl className="mt-3 space-y-1 text-xs text-muted">
                <div className="flex justify-between">
                  <dt>Cartes</dt>
                  <dd className="num text-ink">{booster.cardCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Garantie</dt>
                  <dd className="text-ink">
                    {booster.guaranteed ? `1 ${booster.guaranteed.toLowerCase()}` : 'aucune'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Chance légendaire</dt>
                  <dd className="num text-gold">
                    {(
                      (booster.weights.LEGENDAIRE /
                        Object.values(booster.weights).reduce((a, b) => a + b, 0)) *
                      100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
              </dl>

              <div className="mt-auto pt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="num font-display text-xl font-black text-ice">
                    ❄ {formatFlakes(booster.finalPrice)}
                  </span>
                  {booster.finalPrice !== booster.price && (
                    <span className="num text-xs text-faint line-through">
                      {formatFlakes(booster.price)}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-ice w-full"
                  disabled={disabled}
                  onClick={() => open(booster.id)}
                >
                  {busy === booster.id
                    ? 'Ouverture…'
                    : !connected
                      ? 'Connexion requise'
                      : !affordable
                        ? 'Flocons insuffisants'
                        : 'Ouvrir'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {opened && (
        <section className="panel panel-frost p-4">
          <h2 className="font-display text-lg font-black uppercase tracking-wide text-ice">
            Contenu du booster
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {opened.cards.map((card, i) => (
              <div key={`${card.cardId}-${i}`} className="relative">
                {card.isNew && (
                  <span className="badge absolute -right-1 -top-2 z-10 border-aurora bg-bg-2 text-aurora">
                    Nouvelle
                  </span>
                )}
                <CardTile
                  cardId={card.cardId}
                  name={card.name}
                  rarity={card.rarity}
                  theme={card.theme}
                  glyph={card.glyph}
                  description={card.description}
                  nature={card.nature}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
