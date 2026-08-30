'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { aUneIllustration } from '@/components/CardArt';
import { CardDetailModal, type CarteDetail } from '@/components/CardDetailModal';
import { Tirage } from '@/components/Tirage';
import { bruitDeDechirure, bruitDeSelection } from '@/components/bruitage';
import { CardTile, Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { boosterArt, boosterSize } from '@/lib/domain/catalog';
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
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  power: number;
}

interface Pulled extends CatalogCard {
  cardId: string;
  isNew: boolean;
}

type Phase = 'repos' | 'achat' | 'secousse' | 'eclat' | 'tirage' | 'reveal';

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
  /** La carte dont la fiche est ouverte, s'il y en a une. */
  const [fiche, setFiche] = useState<CarteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulled, setPulled] = useState<Pulled[]>([]);
  const [spent, setSpent] = useState<number | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const booster = useMemo(
    () => boosters.find((b) => b.id === selected) ?? boosters[0],
    [boosters, selected],
  );

  const rang = Math.max(
    0,
    boosters.findIndex((b) => b.id === (booster?.id ?? selected)),
  );

  // Déclaré ici, et non plus bas avec le reste de l'ouverture : la rangée
  // s'en sert pour neutraliser la navigation pendant qu'un sachet s'ouvre.
  const busy = phase !== 'repos' && phase !== 'reveal';

  const rangee = useRef<HTMLDivElement>(null);
  const cases = useRef<(HTMLDivElement | null)[]>([]);

  /**
   * La rangée déborde-t-elle de sa boîte ?
   *
   * C'est ce qui décide de l'affichage des flèches. Une requête de média sur
   * la largeur de l'écran s'en approcherait, sans jamais tomber juste : ce qui
   * compte est de savoir si les quatre sachets tiennent côte à côte, ce qui
   * dépend aussi de la largeur de la fenêtre sur un ordinateur, et du niveau
   * de zoom.
   */
  const [deborde, setDeborde] = useState(false);

  useEffect(() => {
    const el = rangee.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const mesure = () => setDeborde(el.scrollWidth > el.clientWidth + 4);
    mesure();
    const observateur = new ResizeObserver(mesure);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [boosters.length]);

  /** Retient un booster, et le fait entendre. */
  const choisir = useCallback((id: string) => {
    setSelected((actuel) => {
      if (actuel === id) return actuel;
      bruitDeSelection();
      return id;
    });
  }, []);

  /**
   * Le sachet le plus proche du centre de la rangée devient le sachet retenu.
   *
   * C'est ce qui rend le balayage tactile équivalent au clic : on pousse la
   * rangée, et chaque sachet qui passe devant marque son passage — il
   * s'illumine, et on l'entend. Sur un écran large la rangée ne défile pas, et
   * ce gestionnaire ne se déclenche jamais.
   */
  const onScroll = () => {
    if (busy) return;
    const el = rangee.current;
    if (!el) return;
    const milieu = el.scrollLeft + el.clientWidth / 2;
    let plusProche = 0;
    let ecart = Infinity;
    cases.current.forEach((c, i) => {
      if (!c) return;
      const centre = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(centre - milieu);
      if (d < ecart) {
        ecart = d;
        plusProche = i;
      }
    });
    const b = boosters[plusProche];
    if (b) choisir(b.id);
  };

  /** Amène un sachet au centre de la rangée, quand elle défile. */
  const defileVers = (i: number) => {
    const el = rangee.current;
    const c = cases.current[i];
    if (!el || !c) return;
    el.scrollTo({
      left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2,
      behavior: 'smooth',
    });
  };

  /** Un cran à gauche ou à droite, par les flèches ou par le clavier. */
  const decale = useCallback(
    (pas: number) => {
      if (busy) return;
      const cible = Math.max(0, Math.min(boosters.length - 1, rang + pas));
      const b = boosters[cible];
      if (!b) return;
      choisir(b.id);
      defileVers(cible);
    },
    [boosters, busy, choisir, rang],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const pas = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!pas) return;
    event.preventDefault();
    decale(pas);
  };
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

  /**
   * Les leurres du carrousel.
   *
   * Ils n'ont aucune existence dans la partie — ils passent sous le repère et
   * disparaissent. Les prendre dans le vrai catalogue plutôt que d'inventer des
   * formes est ce qui rend le rail crédible : on reconnaît des cartes qu'on
   * possède, et on les voit filer.
   *
   * Seules les cartes qui ont une illustration entrent dans le rail. Le
   * catalogue contient aussi les cartes Joueur et Moment, créées par la
   * modération et sans dessin : elles défilaient en tuiles grises et vides, au
   * milieu des autres. Une carte vide dans une bande d'ouverture ne se lit pas
   * comme « pas encore illustrée », elle se lit comme un bogue.
   */
  const leurres = useMemo(
    () =>
      Object.entries(catalog)
        .filter(([cardId]) => aUneIllustration(cardId))
        .map(([cardId, c]) => ({
          cardId,
          name: c.name,
          description: c.description,
          rarity: c.rarity,
          glyph: c.glyph,
          power: c.power,
          nature: c.nature,
        })),
    [catalog],
  );

  /**
   * Les cartes que les rails mettent en scène : toutes celles du booster.
   *
   * Une seule colonne, sur la meilleure du lot, faisait durer le suspense une
   * fois puis livrait le reste en grille — on voyait le booster s'ouvrir une
   * fois pour cinq cartes. Les colonnes s'arrêtent maintenant l'une après
   * l'autre, et la tension redémarre à chaque carte.
   */
  const vedettes = useMemo(
    () =>
      pulled.map((c) => ({
        cardId: c.cardId,
        name: c.name,
        description: c.description,
        rarity: c.rarity,
        glyph: c.glyph,
        power: c.power,
        nature: c.nature,
      })),
    [pulled],
  );

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
        }),
      );

      setSpent(payload.data.pricePaid);
      setNewBalance(payload.data.balance);

      /*
       * Secousse, éclat, tirage, puis révélation : le rythme fait tout l'effet.
       *
       * Les cartes sont posées avant le tirage et non après : le rail a besoin
       * de connaître la gagnante pour la placer, et il ne tire rien lui-même.
       * Tout est déjà décidé par le serveur à cet instant — le carrousel ne met
       * en scène qu'un résultat acquis.
       *
       * Le préambule dure moins d'une demi-seconde. Il en faisait 1,06 — et
       * comme il s'ajoutait à l'aller-retour au serveur, qui n'est pas
       * instantané non plus, le joueur restait deux bonnes secondes devant un
       * sachet qui tremble après avoir cliqué. La secousse et l'éclat doivent
       * ponctuer le clic, pas faire patienter : dès qu'ils durent assez pour
       * qu'on les regarde, ils sont trop longs.
       */
      setPulled(cards);
      setPhase('secousse');
      schedule(() => setPhase('eclat'), 200);
      schedule(() => setPhase('tirage'), 460);
    } catch {
      setError('Le serveur n’a pas répondu. Réessaie dans un instant.');
      setPhase('repos');
    }
  }

  function reset() {
    setPhase('repos');
    setPulled([]);
    setSpent(null);
  }

  /** La plus haute rareté du lot : c'est elle qui donne le ton du bandeau. */
  const bestRarity = pulled.reduce<Rarity>((best, c) => {
    const r = c.rarity as Rarity;
    return RARITY_LADDER.indexOf(r) > RARITY_LADDER.indexOf(best) ? r : best;
  }, 'C');

  if (!booster) return null;

  return (
    <div className="space-y-6">
      {fiche && <CardDetailModal carte={fiche} onClose={() => setFiche(null)} />}

      {!shopOpen && <Notice kind="error">La boutique est fermée par la modération.</Notice>}
      {!connected && (
        <Notice>
          Connecte-toi pour ouvrir des boosters. Les prix affichés n’incluent pas encore ta remise
          de collection.
        </Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}

      {/* ------------------------- Scène 3D ------------------------------ */}
      <div className="glass glass-reflet relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 42%, ${booster.gradient[0]}33 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        <div className="relative flex min-h-[400px] flex-col items-center justify-center gap-6 px-4 py-10 sm:min-h-[460px]">
          {phase === 'tirage' && vedettes.length > 0 ? (
            <>
              <p className="font-display text-sm tracking-[0.18em] text-muted uppercase">
                Tirage en cours
              </p>
              <Tirage
                cartes={leurres}
                gagnantes={vedettes}
                onFini={() => setPhase('reveal')}
              />
            </>
          ) : phase !== 'reveal' ? (
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

              {/* Les sachets sont posés côte à côte, sans rotation.

                  Un présentoir tournant a précédé : les sachets étaient
                  répartis sur un cercle et s'inclinaient à mesure qu'ils s'en
                  éloignaient. Les planches sont désormais peintes en
                  perspective trois quarts — la rotation venait donc se
                  superposer à celle du dessin, et les sachets s'écrasaient de
                  profil. Une rangée plate laisse voir les quatre illustrations
                  pour ce qu'elles sont.

                  Quand les quatre ne tiennent plus dans la largeur, la rangée
                  défile : au doigt, ou par les deux flèches. */}
              <div className="rangee-cadre">
                {deborde && (
                  <button
                    type="button"
                    className="rangee-fleche rangee-fleche-avant"
                    onClick={() => decale(-1)}
                    disabled={busy || rang === 0}
                    aria-label="Booster précédent"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                )}

                <div
                  ref={rangee}
                  className={`rangee ${busy ? 'rangee-gros-plan' : ''}`}
                  onScroll={onScroll}
                  onKeyDown={onKeyDown}
                  role="listbox"
                  aria-label="Choix du booster"
                  tabIndex={0}
                >
                  {/* La piste porte les sachets et se centre elle-même : un
                      `justify-content: center` sur la boîte qui défile rogne le
                      premier sachet dès que le contenu déborde, alors qu'une
                      marge automatique sur une piste aussi large que son contenu
                      reste centrée sans jamais rogner. */}
                  <div className="rangee-piste">
                    {boosters.map((b, i) => {
                      const actif = b.id === booster.id;
                      return (
                        <div
                          key={b.id}
                          ref={(el) => {
                            cases.current[i] = el;
                          }}
                          className={`rangee-case ${actif ? 'rangee-case-actif' : ''}`}
                          role="option"
                          aria-selected={actif}
                        >
                          <button
                            type="button"
                            className="rangee-prise"
                            disabled={busy}
                            aria-label={
                              actif
                                ? `Ouvrir le booster ${b.name} — double-clic`
                                : `Choisir le booster ${b.name}`
                            }
                            onClick={() => {
                              if (busy) return;
                              // Un clic sur le sachet déjà retenu ne fait rien :
                              // il n'y a qu'un seul geste sur cet objet, le
                              // double-clic qui l'ouvre. Un simple clic qui
                              // agirait aussi déclencherait l'ouverture au
                              // premier des deux.
                              if (actif) return;
                              choisir(b.id);
                              defileVers(i);
                            }}
                            onDoubleClick={() => {
                              // Les mêmes conditions que le bouton : sans ça, un
                              // double-clic hors connexion ou à découvert partait
                              // en requête vouée à revenir en erreur.
                              if (!actif || busy || !connected || !shopOpen || !affordable) return;
                              bruitDeDechirure();
                              void open();
                            }}
                          >
                            <div
                              className={`scene ${actif && phase === 'secousse' ? 'pack-shake' : ''} ${
                                actif && phase === 'eclat' ? 'pack-burst' : ''
                              }`}
                            >
                              <BoosterPack3D
                                name={b.name}
                                cardCount={boosterSize(b)}
                                gradient={b.gradient}
                                art={boosterArt(b.id)}
                                frozen={busy}
                                rarete={b.guaranteed}
                                vignette={!actif}
                              />
                              {actif && phase === 'eclat' && (
                                <span className="shockwave" aria-hidden="true" />
                              )}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {deborde && (
                  <button
                    type="button"
                    className="rangee-fleche rangee-fleche-apres"
                    onClick={() => decale(1)}
                    disabled={busy || rang === boosters.length - 1}
                    aria-label="Booster suivant"
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                )}
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

              {/*
               * Les cartes arrivent face visible, et cliquables.
               *
               * Elles étaient posées de dos, à retourner une par une ou d'un
               * bouton. Deux défauts : le rail venait de faire tout un travail
               * de suspense, et on redemandait au joueur de le refaire à la
               * main ; et une fois retournées, elles tenaient dans cinq
               * colonnes, où le texte d'effet — la seule chose qui dise à quoi
               * sert la carte — était illisible.
               *
               * C'est la vignette de collection qui sert ici, et non le grand
               * format : le joueur doit reconnaître les cartes qu'il vient
               * d'obtenir dans la grille où il les retrouvera ensuite. Le grand
               * format est à un clic, dans la fiche.
               */}
              <div className="mx-auto grid max-w-4xl grid-cols-2 justify-center gap-4 sm:grid-cols-3">
                {pulled.map((card, i) => {
                  const meta = rarityMeta(card.rarity);
                  return (
                    <div
                      key={`${card.cardId}-${i}`}
                      className="reveal relative"
                      style={{ animationDelay: `${i * 130}ms` }}
                    >
                      {meta.holo && (
                        <span
                          className="reveal-halo"
                          style={{ ['--r' as string]: meta.color }}
                          aria-hidden="true"
                        />
                      )}

                      <CardTile
                        cardId={card.cardId}
                        name={card.name}
                        description={card.description}
                        rarity={card.rarity}
                        glyph={card.glyph}
                        power={card.power}
                        nature={card.nature}
                        onClick={() => setFiche(card)}
                        corner={
                          card.isNew ? (
                            <span
                              className="rounded-full px-2 py-0.5 font-display text-[11px] font-black tracking-wider uppercase"
                              style={{ background: '#5fe3bd', color: '#04211a' }}
                            >
                              Nouvelle
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button className="btn btn-ice" onClick={reset}>
                  Ouvrir un autre booster
                </button>
              </div>
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
