'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Countdown } from '@/components/Countdown';
import { FiltreRarete } from '@/components/FiltreRarete';
import { CardTile, EmptyState, Notice, flakes } from '@/components/ui';
import { MARKET } from '@/lib/domain/rules';
import type { HandCard, ProfileView } from '@/lib/services/profile';

interface Opponent {
  id: string;
  pseudo: string;
  shielded: boolean;
}

type Dialog =
  | { kind: 'jouer'; card: HandCard }
  | { kind: 'vendre'; card: HandCard }
  | null;

/**
 * Main, collection et ventes du joueur connecté.
 *
 * Les formulaires ne transportent que des identifiants : jouer une carte
 * envoie l'identifiant de la copie et, au besoin, celui de la game ou de
 * l'adversaire visé. La puissance de l'effet et la légalité de la cible sont
 * décidées par le serveur.
 */
export function CollectionBoard({
  profile,
  opponents,
}: {
  profile: ProfileView;
  opponents: Opponent[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  // Cibles proposées pour la carte en cours : une game à soi, ou un adversaire.
  const playableGames = useMemo(
    () => profile.games.filter((g) => !g.skipped && !g.frozen),
    [profile.games],
  );

  const [gameId, setGameId] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [startPrice, setStartPrice] = useState(100);
  const [buyoutPrice, setBuyoutPrice] = useState<number | ''>('');
  const [durationHours, setDurationHours] = useState<number>(24);

  function openDialog(next: Dialog) {
    setMessage(null);
    setGameId('');
    setTargetPlayerId('');
    setStartPrice(100);
    setBuyoutPrice('');
    setDurationHours(24);
    setDialog(next);
  }

  async function post(path: string, body: Record<string, unknown>, method = 'POST') {
    setBusy(true);
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
        return false;
      }
      setMessage({
        kind: 'success',
        text: typeof payload.data?.summary === 'string' ? payload.data.summary : 'C’est fait.',
      });
      setDialog(null);
      router.refresh();
      return true;
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function playCard(card: HandCard) {
    return post('/api/cards/play', {
      cardInstanceId: card.instanceId,
      ...(card.target === 'own_game' ? { gameId } : {}),
      ...(card.target === 'opponent' ? { targetPlayerId } : {}),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  function sellCard(card: HandCard) {
    return post('/api/market/listings', {
      cardInstanceId: card.instanceId,
      startPrice,
      buyoutPrice: buyoutPrice === '' ? null : buyoutPrice,
      durationHours,
    });
  }

  /**
   * La réserve, regroupée par carte.
   *
   * Une carte détenue en trois exemplaires occupait trois cases identiques, et
   * il fallait faire défiler des doublons pour retrouver le reste. Une seule
   * vignette porte désormais son compte, et les boutons agissent sur le premier
   * exemplaire — jouer ou vendre en consomme un, peu importe lequel.
   */
  const reserve = useMemo(() => {
    const par = new Map<string, { card: HandCard; copies: number }>();
    for (const c of profile.hand) {
      const vu = par.get(c.cardId);
      if (vu) vu.copies += 1;
      else par.set(c.cardId, { card: c, copies: 1 });
    }
    return [...par.values()];
  }, [profile.hand]);

  const [rarete, setRarete] = useState<Set<string>>(new Set());

  const basculeRarete = (r: string) =>
    setRarete((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const affichees = reserve.filter(({ card }) => rarete.size === 0 || rarete.has(card.rarity));

  /*
   * Le filtre n'apparaît qu'à partir de deux raretés en réserve.
   *
   * Une barre de six boutons au-dessus de trois cartes toutes communes ne trie
   * rien : elle occupe la place de ce qu'on est venu voir. Elle arrive quand
   * elle sert.
   */
  const filtrable = new Set(reserve.map(({ card }) => card.rarity)).size > 1;

  const needsGame = dialog?.kind === 'jouer' && dialog.card.target === 'own_game';
  const needsOpponent = dialog?.kind === 'jouer' && dialog.card.target === 'opponent';
  const canPlay = !needsGame || gameId !== '';
  const canTarget = !needsOpponent || targetPlayerId !== '';

  return (
    <div className="space-y-8">
      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {/* ------------------------------- Main ------------------------------ */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-black uppercase tracking-wide text-ink">
            Ta réserve
          </h2>
          <span className="text-xs text-muted">
            <span className="num">{profile.hand.length}</span> carte
            {profile.hand.length > 1 ? 's' : ''}
            {reserve.length !== profile.hand.length && (
              <>
                {' '}
                · <span className="num">{reserve.length}</span> différentes
              </>
            )}
          </span>
        </div>

        {profile.hand.length === 0 ? (
          <EmptyState
            title="Réserve vide"
            hint="Ouvre un booster en boutique, ou achète une carte à l’hôtel des ventes."
          />
        ) : (
          <div className="space-y-3">
            {filtrable && (
              <FiltreRarete
                selection={rarete}
                onToggle={basculeRarete}
                onReset={() => setRarete(new Set())}
                compte={(r) =>
                  String(
                    profile.hand.filter((c) => c.rarity === r).length,
                  )
                }
                aide="Sous chaque palier, le nombre d'exemplaires que tu détiens. Les doublons sont regroupés sur une seule carte."
              >
                {affichees.length} carte{affichees.length > 1 ? 's' : ''}
              </FiltreRarete>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {affichees.map(({ card, copies }) => (
                <CardTile
                  key={card.cardId}
                  copies={copies}
                  cardId={card.cardId}
                  name={card.name}
                  rarity={card.rarity}
                  glyph={card.glyph}
                  subtitle={card.description}
                  nature={card.nature}
                  footer={
                    <div className="flex gap-1.5">
                      <button
                        className="btn btn-sm btn-ice flex-1"
                        onClick={() => openDialog({ kind: 'jouer', card })}
                        disabled={busy}
                      >
                        Jouer
                      </button>
                      <button
                        className="btn btn-sm flex-1"
                        onClick={() => openDialog({ kind: 'vendre', card })}
                        disabled={busy}
                      >
                        Vendre
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------- Mes ventes --------------------------- */}
      <section id="vendre">
        <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
          Mes ventes en cours
        </h2>
        {profile.myListings.length === 0 ? (
          <EmptyState
            title="Aucune vente en cours"
            hint="Choisis « Vendre » sur une carte de ta main pour la mettre aux enchères."
          />
        ) : (
          <div className="glass scroll-x">
            <table className="grid-table min-w-[600px]">
              <thead>
                <tr>
                  <th>Carte</th>
                  <th className="text-right">Enchère</th>
                  <th className="text-right">Mises</th>
                  <th>Meilleur</th>
                  <th className="text-right">Fin</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {profile.myListings.map((listing) => (
                  <tr key={listing.id}>
                    <td className="text-ink">
                      <span aria-hidden="true">{listing.card.glyph}</span> {listing.card.name}
                    </td>
                    <td className="num text-right font-bold text-ice">
                      ❄ {flakes(listing.currentPrice)}
                    </td>
                    <td className="num text-right text-muted">{listing.bidCount}</td>
                    <td className="text-muted">{listing.currentBidderPseudo ?? '—'}</td>
                    <td className="text-right">
                      <Countdown endsAt={listing.endsAt} onExpire={() => router.refresh()} />
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busy || listing.bidCount > 0}
                        title={
                          listing.bidCount > 0
                            ? 'Impossible : des enchères sont en cours'
                            : 'Retirer la vente'
                        }
                        onClick={() =>
                          post('/api/market/listings', { listingId: listing.id }, 'DELETE')
                        }
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --------------------------- Mes enchères -------------------------- */}
      {profile.myBids.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-black uppercase tracking-wide text-ink">
            Enchères où je suis en tête
          </h2>
          <div className="glass scroll-x">
            <table className="grid-table min-w-[480px]">
              <thead>
                <tr>
                  <th>Carte</th>
                  <th>Vendeur</th>
                  <th className="text-right">Ma mise</th>
                  <th className="text-right">Fin</th>
                </tr>
              </thead>
              <tbody>
                {profile.myBids.map((listing) => (
                  <tr key={listing.id}>
                    <td className="text-ink">
                      <span aria-hidden="true">{listing.card.glyph}</span> {listing.card.name}
                    </td>
                    <td className="text-muted">{listing.sellerPseudo}</td>
                    <td className="num text-right font-bold text-aurora">
                      ❄ {flakes(listing.currentPrice)}
                    </td>
                    <td className="text-right">
                      <Countdown endsAt={listing.endsAt} onExpire={() => router.refresh()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            Ces flocons sont bloqués en séquestre. Ils te sont rendus automatiquement si quelqu’un
            surenchérit.
          </p>
        </section>
      )}

      {/* ------------------------------ Dialogue --------------------------- */}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={dialog.kind === 'jouer' ? 'Jouer une carte' : 'Mettre en vente'}
        >
          <div className="glass w-full max-w-md p-5">
            <div className="mb-3 flex items-start gap-3">
              <span className="text-3xl leading-none" aria-hidden="true">
                {dialog.card.glyph}
              </span>
              <div>
                <h3 className="font-display text-lg font-black uppercase tracking-wide text-ink">
                  {dialog.card.name}
                </h3>
                <p className="text-xs text-muted">{dialog.card.description}</p>
              </div>
            </div>

            {dialog.kind === 'jouer' ? (
              <div className="space-y-3">
                {needsGame && (
                  <div>
                    <label className="label" htmlFor="game-cible">
                      Sur quelle game ?
                    </label>
                    <select
                      id="game-cible"
                      className="field"
                      value={gameId}
                      onChange={(e) => setGameId(e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      {playableGames.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.score} pts — {g.kills} kills
                          {g.placement ? ` — Top ${g.placement}` : ''}
                        </option>
                      ))}
                    </select>
                    {playableGames.length === 0 && (
                      <p className="mt-1 text-xs text-danger">
                        Aucune game modifiable : elles sont toutes gelées ou passées.
                      </p>
                    )}
                  </div>
                )}

                {needsOpponent && (
                  <div>
                    <label className="label" htmlFor="joueur-cible">
                      Sur quel adversaire ?
                    </label>
                    <select
                      id="joueur-cible"
                      className="field"
                      value={targetPlayerId}
                      onChange={(e) => setTargetPlayerId(e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      {opponents.map((o) => (
                        <option key={o.id} value={o.id} disabled={o.shielded}>
                          {o.pseudo}
                          {o.shielded ? ' — protégé 🛡' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!needsGame && !needsOpponent && (
                  <Notice>Cette carte s’applique automatiquement, sans cible à choisir.</Notice>
                )}

                <div className="flex gap-2 pt-1">
                  <button className="btn flex-1" onClick={() => setDialog(null)} disabled={busy}>
                    Annuler
                  </button>
                  <button
                    className="btn btn-ice flex-1"
                    disabled={busy || !canPlay || !canTarget}
                    onClick={() => playCard(dialog.card)}
                  >
                    {busy ? 'En cours…' : 'Confirmer'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="prix-depart">
                    Prix de départ (flocons)
                  </label>
                  <input
                    id="prix-depart"
                    type="number"
                    className="field num"
                    min={MARKET.minPrice}
                    max={MARKET.maxPrice}
                    value={startPrice}
                    onChange={(e) => setStartPrice(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="prix-immediat">
                    Achat immédiat (facultatif)
                  </label>
                  <input
                    id="prix-immediat"
                    type="number"
                    className="field num"
                    min={MARKET.minPrice}
                    max={MARKET.maxPrice}
                    placeholder="Laisser vide pour une enchère pure"
                    value={buyoutPrice}
                    onChange={(e) =>
                      setBuyoutPrice(e.target.value === '' ? '' : Number(e.target.value))
                    }
                  />
                  {buyoutPrice !== '' && buyoutPrice <= startPrice && (
                    <p className="mt-1 text-xs text-danger">
                      L’achat immédiat doit dépasser le prix de départ.
                    </p>
                  )}
                </div>

                <div>
                  <label className="label" htmlFor="duree">
                    Durée de la vente
                  </label>
                  <select
                    id="duree"
                    className="field"
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))}
                  >
                    {MARKET.durationsHours.map((h) => (
                      <option key={h} value={h}>
                        {h < 24 ? `${h} heure${h > 1 ? 's' : ''}` : `${h / 24} jour${h > 24 ? 's' : ''}`}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="text-xs text-faint">
                  Tu touches le prix de vente en entier. Une enchère de dernière minute
                  repousse la clôture d’une minute.
                </p>

                <div className="flex gap-2 pt-1">
                  <button className="btn flex-1" onClick={() => setDialog(null)} disabled={busy}>
                    Annuler
                  </button>
                  <button
                    className="btn btn-ice flex-1"
                    disabled={busy || (buyoutPrice !== '' && buyoutPrice <= startPrice)}
                    onClick={() => sellCard(dialog.card)}
                  >
                    {busy ? 'En cours…' : 'Mettre en vente'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
