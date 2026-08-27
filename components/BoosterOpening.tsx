'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { TradingCard } from '@/components/TradingCard';
import { Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { boosterArt, boosterSize, cardArt } from '@/lib/domain/catalog';
import { atLeastOnePercent, rarityPercent } from '@/lib/domain/rules';
import type { BoosterDefinition, Rarity } from '@/lib/domain/types';

const RARITY_LADDER: Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

export interface ShopBooster extends BoosterDefinition {
  finalPrice: number;
}

export interface CatalogCard {
  name: string;
  subtitle: string;
  rarity: string;
  theme: string;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  power: number;
}

interface Pulled extends CatalogCard {
  cardId: string;
  isNew: boolean;
  /** Retournée par le joueur, ou par le bouton « Tout retourner ». */
  flipped: boolean;
}

type Phase = 'repos' | 'achat' | 'secousse' | 'eclat' | 'reveal';

/**
 * Achat et ouverture d'un booster, avec le sachet en 3D.
 *
 * Le tirage est fait par le serveur dès l'achat ; l'animation ne fait que
 * mettre en scène un résultat déjà décidé. Impossible d'influencer le contenu
 * en interrompant l'animation, en rechargeant, ou en rejouant la requête — la
 * clé d'idempotence renvoie alors exactement les mêmes cartes.
 */
export function BoosterOpening({
  boosters,
  balance,
  shopOpen,
  connected,
  catalog,
}: {
  boosters: ShopBooster[];
  balance: number | null;
  shopOpen: boolean;
  connected: boolean;
  catalog: Record<string, CatalogCard>;
}) {
  const [selected, setSelected] = useState<string>(boosters[0]?.id ?? 'givre');
  const [phase, setPhase] = useState<Phase>('repos');
  const [error, setError] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Pulled[]>([]);
  const [spent, setSpent] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const arret = useRef<ReturnType<typeof setTimeout> | null>(null);

  const booster = useMemo(
    () => boosters.find((b) => b.id === selected) ?? boosters[0],
    [boosters, selected],
  );

  /** Amène un sachet au centre du rail. */
  const centrer = useCallback((index: number, doux = true) => {
    const piste = rail.current;
    const case_ = piste?.children[index] as HTMLElement | undefined;
    if (!piste || !case_) return;
    piste.scrollTo({
      left: case_.offsetLeft + case_.offsetWidth / 2 - piste.clientWidth / 2,
      behavior: doux ? 'smooth' : 'auto',
    });
  }, []);

  /**
   * Le défilement fait foi.
   *
   * On attend l'arrêt plutôt que de suivre chaque événement : pendant un
   * défilement fluide, le sachet le plus proche du centre change plusieurs fois
   * par seconde, et changer de sélection à chaque fois ferait clignoter la
   * scène et le prix.
   */
  const onScroll = useCallback(() => {
    if (arret.current) clearTimeout(arret.current);
    arret.current = setTimeout(() => {
      const piste = rail.current;
      if (!piste) return;
      const centre = piste.scrollLeft + piste.clientWidth / 2;
      let proche = 0;
      let ecart = Infinity;
      Array.from(piste.children).forEach((el, i) => {
        const c = (el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth / 2;
        const d = Math.abs(c - centre);
        if (d < ecart) {
          ecart = d;
          proche = i;
        }
      });
      const cible = boosters[proche];
      if (cible) setSelected((actuel) => (cible.id === actuel ? actuel : cible.id));
    }, 130);
  }, [boosters]);

  // Au premier rendu, le sachet retenu doit déjà être au centre — sans
  // animation, sinon la page s'ouvre sur un défilement qu'on n'a pas demandé.
  const monte = useRef(false);
  useEffect(() => {
    if (monte.current) return;
    monte.current = true;
    centrer(
      boosters.findIndex((b) => b.id === selected),
      false,
    );
  }, [boosters, selected, centrer]);

  useEffect(
    () => () => {
      if (arret.current) clearTimeout(arret.current);
    },
    [],
  );

  // Les minuteries de l'animation doivent mourir avec le composant, sinon un
  // changement de page en cours d'ouverture déclencherait un setState fantôme.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const schedule = useCallback((fn: () => void, delay: number) => {
    timers.current.push(setTimeout(fn, delay));
  }, []);

  const affordable = balance !== null && booster !== undefined && balance >= booster.finalPrice;
  const busy = phase !== 'repos' && phase !== 'reveal';

  async function open() {
    if (!booster || busy) return;

    setError(null);
    setPulled([]);
    setPhase('achat');

    try {
      const response = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ boosterId: booster.id, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json();

      if (!payload.ok) {
        setError(payload.error?.message ?? 'Ouverture impossible.');
        setPhase('repos');
        return;
      }

      const cards: Pulled[] = payload.data.cards.map(
        (c: { cardId: string; isNew: boolean }) => ({
          ...catalog[c.cardId],
          cardId: c.cardId,
          isNew: c.isNew,
          flipped: false,
        }),
      );

      setSpent(payload.data.pricePaid);
      setNewBalance(payload.data.balance);

      // Secousse, éclat, puis révélation : le rythme fait tout l'effet.
      setPhase('secousse');
      schedule(() => setPhase('eclat'), 620);
      schedule(() => {
        setPulled(cards);
        setPhase('reveal');
      }, 1_060);
    } catch {
      setError('Le serveur n’a pas répondu. Réessaie dans un instant.');
      setPhase('repos');
    }
  }

  function flip(index: number) {
    setPulled((prev) => prev.map((c, i) => (i === index ? { ...c, flipped: true } : c)));
  }

  function flipAll() {
    setPulled((prev) => prev.map((c) => ({ ...c, flipped: true })));
  }

  function reset() {
    setPhase('repos');
    setPulled([]);
    setSpent(null);
  }

  const allFlipped = pulled.length > 0 && pulled.every((c) => c.flipped);
  /** La plus haute rareté du lot : c'est elle qui donne le ton du bandeau. */
  const bestRarity = pulled.reduce<Rarity>((best, c) => {
    const r = c.rarity as Rarity;
    return RARITY_LADDER.indexOf(r) > RARITY_LADDER.indexOf(best) ? r : best;
  }, 'C');

  if (!booster) return null;

  return (
    <div className="space-y-6">
      {!shopOpen && <Notice kind="error">La boutique est fermée par la modération.</Notice>}
      {!connected && (
        <Notice>
          Connecte-toi pour ouvrir des boosters. Les prix affichés n’incluent pas encore ta remise
          de collection.
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {/* ------------------------- Scène 3D ------------------------------ */}
      <div className="glass relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 42%, ${booster.gradient[0]}33 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        <div className="relative flex min-h-[400px] flex-col items-center justify-center gap-6 px-4 py-10 sm:min-h-[460px]">
          {phase !== 'reveal' ? (
            <>
              {/* Ce que portaient les fiches supprimées : composition du sachet,
                  rareté garantie et promesse. Ici il n'y en a qu'une, celle du
                  booster choisi — donc lisible au lieu d'être répétée quatre fois. */}
              <div className="flex flex-col items-center gap-1 text-center">
                <h2 className="font-display text-2xl leading-none font-black tracking-wide text-ink uppercase">
                  {booster.name}
                </h2>
                <p className="text-[13px] text-faint">
                  {booster.slots.effet} effet{booster.slots.effet > 1 ? 's' : ''} +{' '}
                  {booster.slots.collection} collection · {booster.tagline}
                </p>
                {booster.guaranteed && (
                  <span className="flex items-center gap-1.5 text-[13px] text-faint">
                    garanti <RarityChip rarity={booster.guaranteed} />
                  </span>
                )}
              </div>

              {/* Les sachets sont alignés dans la scène : on fait défiler le
                  rail, ou on clique sur un voisin. Le sachet centré est celui
                  qu'on ouvre — le choix et la mise en scène sont le même geste,
                  au lieu d'être une rangée de fiches en haut de page.

                  Seul le sachet centré porte le maillage complet. Les voisins
                  sont des vignettes : cent quarante tuiles chacun, en afficher
                  quatre coûterait cher pour un gain nul à cette taille. */}
              <div
                ref={rail}
                className="carrousel"
                onScroll={onScroll}
                role="listbox"
                aria-label="Choix du booster"
              >
                {boosters.map((b, i) => {
                  const actif = b.id === booster.id;
                  return (
                    <div
                      key={b.id}
                      className={`carrousel-case ${actif ? 'carrousel-case-actif' : ''}`}
                      role="option"
                      aria-selected={actif}
                    >
                      <button
                        type="button"
                        className="carrousel-prise"
                        disabled={busy}
                        aria-label={`Choisir le booster ${b.name}`}
                        onClick={() => !busy && !actif && centrer(i)}
                      >
                        <div
                          className={`scene ${actif && phase === 'secousse' ? 'pack-shake' : ''} ${
                            actif && phase === 'eclat' ? 'pack-burst' : ''
                          }`}
                        >
                          {/* Le sachet centré tourne librement : on le prend, on
                              le retourne, on regarde ses tranches. L'ouverture
                              se déclenche par le bouton, jamais par le clic sur
                              le sachet — sinon chaque tentative de le faire
                              pivoter dépenserait des flocons. */}
                          <BoosterPack3D
                            name={b.name}
                            cardCount={boosterSize(b)}
                            gradient={b.gradient}
                            art={boosterArt(b.id)}
                            frozen={busy}
                            vignette={!actif}
                          />
                          {actif && phase === 'eclat' && (
                            <span className="shockwave" aria-hidden="true" />
                          )}
                        </div>
                        {/* Nom et prix ne servent qu'aux voisins : pour le
                            sachet centré, ils sont déjà au-dessus de la scène
                            et sur le bouton d'ouverture. */}
                        <span className="carrousel-etiquette">
                          <span className="carrousel-nom">{b.name}</span>
                          <span className="num carrousel-prix">❄ {flakes(b.finalPrice)}</span>
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  className="btn btn-ice btn-lg"
                  disabled={!connected || !shopOpen || !affordable || busy}
                  onClick={open}
                >
                  {busy
                    ? 'Ouverture…'
                    : !connected
                      ? 'Connexion requise'
                      : !affordable
                        ? 'Flocons insuffisants'
                        : `Ouvrir — ❄ ${flakes(booster.finalPrice)}`}
                </button>
                {balance !== null && (
                  <p className="num text-xs text-faint">
                    Solde : ❄ {flakes(newBalance ?? balance)}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="w-full">
              <div className="mb-5 flex flex-wrap items-center justify-center gap-3 text-center">
                <span
                  className="font-display text-xl font-black tracking-wide uppercase"
                  style={{ color: rarityMeta(bestRarity).color }}
                >
                  {bestRarity === 'L'
                    ? '★ Légendaire ★'
                    : bestRarity === 'UR'
                      ? 'Ultra rare !'
                      : bestRarity === 'SR'
                        ? 'Super rare !'
                        : bestRarity === 'R'
                          ? 'Une rare'
                          : 'Ouvert'}
                </span>
                {spent !== null && (
                  <span className="num text-xs text-faint">−❄ {flakes(spent)}</span>
                )}
              </div>

              <div className="mx-auto grid max-w-3xl grid-cols-2 justify-center gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {pulled.map((card, i) => {
                  const meta = rarityMeta(card.rarity);
                  return (
                    <div
                      key={`${card.cardId}-${i}`}
                      className="reveal relative"
                      style={{ animationDelay: `${i * 110}ms` }}
                    >
                      {card.flipped && meta.holo && (
                        <span
                          className="reveal-halo"
                          style={{ ['--r' as string]: meta.color }}
                          aria-hidden="true"
                        />
                      )}

                      <div
                        className={`flipper ${card.flipped ? 'is-flipped' : ''}`}
                        onClick={() => flip(i)}
                        role="button"
                        tabIndex={0}
                        aria-label={card.flipped ? card.name : 'Retourner la carte'}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            flip(i);
                          }
                        }}
                      >
                        {/* Face cachée : le dos, tant qu'on n'a pas retourné. */}
                        <div className="flip-face">
                          <div className="card-back aspect-[5/7]">
                            <span className="text-3xl opacity-70" aria-hidden="true">
                              ❄
                            </span>
                          </div>
                        </div>

                        {/* Face visible après retournement. */}
                        <div className="flip-back">
                          <TradingCard
                            card={{
                              cardId: card.cardId,
                              name: card.name,
                              subtitle: card.subtitle,
                              description: card.description,
                              rarity: card.rarity,
                              theme: card.theme,
                              glyph: card.glyph,
                              power: card.power,
                              nature: card.nature,
                              art: cardArt(card.cardId),
                            }}
                          />
                          {card.isNew && (
                            <span
                              className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 font-display text-[12px] font-black tracking-wider uppercase"
                              style={{ background: '#5fe3bd', color: '#04211a' }}
                            >
                              Nouvelle
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {!allFlipped && (
                  <button className="btn" onClick={flipAll}>
                    Tout retourner
                  </button>
                )}
                <button className="btn btn-ice" onClick={reset} disabled={!allFlipped}>
                  Ouvrir un autre booster
                </button>
              </div>

              {!allFlipped && (
                <p className="mt-3 text-center text-xs text-faint">
                  Clique sur une carte pour la retourner.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --------------------- Taux du booster choisi -------------------- */}
      <section className="glass">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-2.5">
          <h2 className="font-display text-sm font-black tracking-wider text-ink uppercase">
            Taux du booster {booster.name}
          </h2>
          <span className="text-[13px] text-faint">
            Taux des {booster.slots.effet} emplacement{booster.slots.effet > 1 ? 's' : ''} d’effet.
            Les {booster.slots.collection} autres tirent des cartes Joueur et Moment.
          </span>
        </div>

        <div className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6">
          {RARITY_LADDER.map((rarity) => {
            const meta = rarityMeta(rarity);
            const per = rarityPercent(booster.weights, rarity);
            const atLeast = atLeastOnePercent(booster.weights, rarity, booster.slots.effet);
            return (
              <div key={rarity} className="border-t border-white/10 px-3 py-2.5 sm:border-r">
                <div className="flex items-center gap-1.5">
                  <RarityChip rarity={rarity} />
                  <span className="text-[13px] text-muted">{meta.label}</span>
                </div>
                <div className="num mt-1 font-display text-lg font-black" style={{ color: meta.color }}>
                  {per < 0.1 ? per.toFixed(3) : per < 1 ? per.toFixed(2) : per.toFixed(1)} %
                </div>
                <div className="num text-[13px] text-faint">
                  {atLeast < 0.1 ? atLeast.toFixed(3) : atLeast.toFixed(1)} % par booster
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
