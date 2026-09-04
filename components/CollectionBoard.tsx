'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CardDetailModal } from '@/components/CardDetailModal';
import { Countdown } from '@/components/Countdown';
import { FiltreRarete } from '@/components/FiltreRarete';
import { CardTile, EmptyState, Notice, flakes } from '@/components/ui';
import { ECONOMY, libelleDuree, MARKET } from '@/lib/domain/rules';
import type { HandCard, ProfileView } from '@/lib/services/profile';
import { TitreGlace } from '@/components/TitreGlace';

interface Opponent {
  id: string;
  pseudo: string;
  shielded: boolean;
}

type Dialog =
  | { kind: 'jouer'; card: HandCard }
  | { kind: 'vendre'; card: HandCard }
  /**
   * La défausse a son dialogue, et pas un simple bouton.
   *
   * Elle détruit la carte sans recours : le geste doit demander une seconde
   * intention, comme jouer ou vendre. Un bouton qui exécute au premier clic sur
   * une grille de vignettes serrées est une légendaire perdue par mégarde.
   */
  | { kind: 'defausser'; card: HandCard }
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

  /** La carte dont la fiche est ouverte, s'il y en a une. */
  const [fiche, setFiche] = useState<HandCard | null>(null);

  const [gameId, setGameId] = useState('');
  const [targetPlayerId, setTargetPlayerId] = useState('');
  const [startPrice, setStartPrice] = useState(100);
  const [buyoutPrice, setBuyoutPrice] = useState<number | ''>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);

  function openDialog(next: Dialog) {
    setMessage(null);
    setGameId('');
    setTargetPlayerId('');
    setStartPrice(100);
    setBuyoutPrice('');
    setDurationMinutes(60);
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

  /**
   * Les actions de la fiche rendent un message plutôt que de lever.
   *
   * La fiche affiche l'erreur à l'endroit du geste — sous le bouton qu'on vient
   * d'actionner — au lieu de la renvoyer en haut de la page, où elle passerait
   * inaperçue derrière la fenêtre ouverte.
   */
  async function envoie(path: string, body: Record<string, unknown>): Promise<string | null> {
    try {
      const reponse = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const charge = await reponse.json();
      if (!charge.ok) return charge.error?.message ?? 'Action refusée.';
      router.refresh();
      return null;
    } catch {
      return 'Le serveur n’a pas répondu.';
    }
  }

  function discardCard(card: HandCard) {
    return post('/api/cards/defausser', { cardInstanceId: card.instanceId });
  }

  function sellCard(card: HandCard) {
    return post('/api/market/listings', {
      cardInstanceId: card.instanceId,
      startPrice,
      buyoutPrice: buyoutPrice === '' ? null : buyoutPrice,
      durationMinutes,
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
      {/* La fiche, ouverte au clic sur une carte de la réserve. */}
      {fiche && (
        <CardDetailModal
          carte={{
            cardId: fiche.cardId,
            name: fiche.name,
            subtitle: '',
            description: fiche.description,
            rarity: fiche.rarity,
            glyph: fiche.glyph,
            nature: fiche.nature,
            instanceId: fiche.instanceId,
          }}
          onClose={() => setFiche(null)}
          onJouer={
            fiche.playable
              ? () => {
                  const carte = fiche;
                  setFiche(null);
                  openDialog({ kind: 'jouer', card: carte });
                }
              : undefined
          }
          onDefausse={(instanceId: string) => envoie('/api/cards/defausser', { cardInstanceId: instanceId })}
          onVente={(instanceId: string, prixDepart: number, dureeMinutes: number) =>
            envoie('/api/market/listings', {
              cardInstanceId: instanceId,
              startPrice: prixDepart,
              buyoutPrice: null,
              durationMinutes: dureeMinutes,
            })
          }
        />
      )}

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {/* ------------------------------- Main ------------------------------ */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <TitreGlace taille="bloc">Ta réserve</TitreGlace>
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
                  /*
                   * La carte s'ouvre, elle ne porte plus ses commandes.
                   *
                   * Trois boutons sous chaque vignette faisaient une grille de
                   * barres grises qui pesait autant que les cartes elles-mêmes,
                   * et le geste le plus dangereux — la défausse — y était un
                   * bouton de vingt pixels collé aux deux autres. Un clic ouvre
                   * maintenant la fiche, où les trois actions ont la place de
                   * s'expliquer et où chacune demande une confirmation.
                   */
                  onClick={() => setFiche(card)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------- Mes ventes --------------------------- */}
      <div className="grid gap-8 xl:grid-cols-2 xl:items-start">
      <section id="vendre">
        <TitreGlace taille="bloc" className="mb-3">
          Mes ventes en cours
        </TitreGlace>
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
          <TitreGlace taille="bloc" className="mb-3">
            Enchères où je suis en tête
          </TitreGlace>
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
          aria-label={
            dialog.kind === 'jouer'
              ? 'Jouer une carte'
              : dialog.kind === 'vendre'
                ? 'Mettre en vente'
                : 'Défausser une carte'
          }
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
            ) : dialog.kind === 'defausser' ? (
              <div className="space-y-3">
                <p className="text-[14px] leading-relaxed text-ink-2">
                  <strong>{dialog.card.name}</strong> sera détruite. Tu récupères{' '}
                  {ECONOMY.defausse} ❄, et c’est définitif — aucun moyen de la récupérer.
                </p>
                <div className="flex gap-2 pt-1">
                  <button className="btn flex-1" onClick={() => setDialog(null)} disabled={busy}>
                    Garder
                  </button>
                  <button
                    className="btn btn-danger flex-1"
                    disabled={busy}
                    onClick={() => discardCard(dialog.card)}
                  >
                    {busy ? 'En cours…' : 'Oui, défausser'}
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
                  {/* Des pastilles et non une liste déroulante : sept durées se
                      montrent, elles ne se déroulent pas — et c'est ce choix qui
                      décide si la vente se conclut à l'antenne ou pendant la
                      nuit. */}
                  <div className="flex flex-wrap gap-1.5" id="duree">
                    {MARKET.durationsMinutes.map((m) => {
                      const actif = m === durationMinutes;
                      return (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={actif}
                          onClick={() => setDurationMinutes(m)}
                          className="rounded-full px-3 py-1.5 font-display text-[13px] font-bold transition-colors"
                          style={{
                            background: actif ? 'var(--ice)' : 'transparent',
                            color: actif ? '#060a12' : 'var(--ink-2)',
                            boxShadow: `inset 0 0 0 1px ${actif ? 'var(--ice)' : 'var(--glass-edge)'}`,
                          }}
                        >
                          {libelleDuree(m)}
                        </button>
                      );
                    })}
                  </div>
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
    </div>
  );
}
