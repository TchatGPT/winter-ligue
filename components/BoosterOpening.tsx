'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RangeeBoosters } from '@/components/RangeeBoosters';
import { SnowCap } from '@/components/SnowCap';
import { prechargeSons, reveilleSon } from '@/components/bruitage';
import { CardDetailModal, type CarteDetail } from '@/components/CardDetailModal';
import { SpinReel, type CarteRail } from '@/components/SpinReel';
import { CardTile, Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { boosterArt } from '@/lib/domain/catalog';
import { rarityPercent } from '@/lib/domain/rules';
import type { BoosterDefinition, Rarity } from '@/lib/domain/types';
import { COURBE_MESUREE } from '@/lib/spin/courbe';
import { TitreGlace } from '@/components/TitreGlace';
import { GlaceCartes, GlaceEpees, GlaceSachet } from '@/components/DessinsGlace';

const RARITY_LADDER: Rarity[] = ['C', 'PC', 'R', 'SR', 'UR', 'L'];

/**
 * Les taux, du blanc de la commune au vert des évènements pour la
 * légendaire, en passant par le bleu ciel : une seule échelle de froid, qui
 * monte avec la rareté. Ce n'est pas la palette des cartes — elle reste à
 * elles — c'est celle de cette table.
 */
const COULEURS_TAUX: Record<Rarity, string> = {
  C: '#ffffff',
  PC: '#e4f3ff',
  R: '#bfe6ff',
  SR: '#93dcff',
  UR: '#7cefe2',
  L: '#63eec4',
};

export interface ShopBooster extends BoosterDefinition {
  finalPrice: number;
  /** Le prix hors évènement. Barré à l'écran quand il dépasse `finalPrice`. */
  basePrice?: number;
}

export interface CatalogCard {
  name: string;
  subtitle: string;
  rarity: string;
  glyph: string;
  description: string;
  /** Absents pour une carte de collection, qui ne se joue pas. */
  nature?: 'bonus' | 'malus';
  power?: number;
}

interface Pulled extends CatalogCard {
  cardId: string;
  /**
   * L'exemplaire créé pour cette carte.
   *
   * Il était jeté à la réception : la fiche ouverte depuis la révélation ne
   * pouvait donc rien proposer, alors que c'est le moment où l'on sait le mieux
   * ce qu'on veut faire d'une carte — la garder, la vendre, ou s'en défaire.
   *
   * Vide quand le serveur rejoue une ouverture déjà faite (clé d'idempotence) :
   * il ne renvoie alors que le contenu, sans recréer d'exemplaires. Les actions
   * s'effacent dans ce cas plutôt que de porter sur un identifiant absent.
   */
  instanceId: string;
  isNew: boolean;
  /** Mise en vente depuis la révélation : plus ni vendable ni défaussable. */
  enVente?: boolean;
  /** Le jeton Winter Spin est tombé sur cet emplacement, et le serveur a rejoué. */
  relance: boolean;
}

/**
 * Les quatre états de l'écran.
 *
 * Il y en avait six : `secousse` et `eclat` faisaient trembler puis briller le
 * sachet entre le clic et le tirage. Ils ne reviennent pas. Le préambule durait
 * 1,06 s et s'ajoutait à l'aller-retour au serveur, qui n'est pas instantané non
 * plus : le joueur restait deux bonnes secondes devant un sachet qui tremble
 * après avoir cliqué. Une ponctuation qui dure assez pour qu'on la regarde est
 * déjà trop longue.
 *
 * Reste `tirage`, où le rail met en scène un résultat **déjà acquis** : le
 * serveur a tiré et débité avant que la première tuile n'existe.
 */
type Phase = 'repos' | 'achat' | 'tirage' | 'reveal';

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
  marketOpen,
  connected,
  catalog,
}: {
  boosters: ShopBooster[];
  balance: number | null;
  shopOpen: boolean;
  /** L’hôtel des ventes accepte-t-il de nouvelles ventes ? */
  marketOpen: boolean;
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

  /*
   * Trois cents kilo-octets rapatriés et décodés pendant qu'on choisit son
   * sachet, pour que la première dent ne se fasse pas attendre. Le décodage est
   * la partie coûteuse, et il ne se fait qu'une fois.
   */
  useEffect(() => {
    void prechargeSons();
  }, []);

  /** Tout ce que le rail peut montrer en leurre. */
  const poolRail: CarteRail[] = useMemo(
    () =>
      Object.entries(catalog).map(([cardId, c]) => ({
        cardId,
        name: c.name,
        rarity: c.rarity,
        glyph: c.glyph,
        description: c.description,
        power: c.power,
        nature: c.nature,
      })),
    [catalog],
  );

  const booster = useMemo(
    () => boosters.find((b) => b.id === selected) ?? boosters[0],
    [boosters, selected],
  );

  // Déclaré ici, et non plus bas avec le reste de l'ouverture : la rangée
  // s'en sert pour neutraliser la navigation pendant qu'un sachet s'ouvre.
  const busy = phase !== 'repos' && phase !== 'reveal';

  /** Retient un booster. */
  const choisir = useCallback((id: string) => {
    setSelected((actuel) => (actuel === id ? actuel : id));
  }, []);
  // Les minuteries restantes doivent mourir avec le composant, sinon un
  // changement de page en cours d'achat déclencherait un setState fantôme.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const affordable = balance !== null && booster !== undefined && balance >= booster.finalPrice;

  async function open() {
    if (!booster || busy) return;

    /*
     * Le contexte audio se réveille ici, et nulle part ailleurs.
     *
     * Un contexte ouvert hors d'un geste de l'utilisateur naît suspendu : son
     * horloge ne tourne pas, et tout ce qu'on lui programme s'entasse au même
     * instant pour partir d'un bloc au réveil. C'était le défaut du « son en
     * retard ». Ce clic est le geste ; l'appel doit être **avant** le premier
     * `await`, sans quoi il n'en fait plus partie.
     */
    reveilleSon();

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
        (c: { cardId: string; instanceId?: string; isNew: boolean; relance?: boolean }) => ({
          ...catalog[c.cardId],
          cardId: c.cardId,
          instanceId: c.instanceId ?? '',
          isNew: c.isNew,
          relance: c.relance === true,
        }),
      );

      setSpent(payload.data.pricePaid);
      setNewBalance(payload.data.balance);

      /*
       * Les cartes sont posées avant le rail, et non après.
       *
       * Le rail a besoin de connaître la gagnante pour la placer à son rang : il
       * ne tire rien lui-même, il révèle. Tout est déjà décidé par le serveur à
       * cet instant — `purchaseAndOpen` a tiré les cartes, débité le prix et
       * renvoyé le tableau, dans la même transaction.
       */
      setPulled(cards);
      setPhase('tirage');
    } catch {
      setError('Le serveur n’a pas répondu. Réessaie dans un instant.');
      setPhase('repos');
    }
  }

  /** Rend le message d'erreur du serveur, ou rien si l'action a abouti. */
  async function envoie(path: string, body: Record<string, unknown>): Promise<string | null> {
    try {
      const reponse = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const charge = await reponse.json();
      if (!charge.ok) return charge.error?.message ?? 'Action refusée.';
      if (typeof charge.data?.balance === 'number') setNewBalance(charge.data.balance);
      return null;
    } catch {
      return 'Le serveur n’a pas répondu.';
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
    <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-6 xl:space-y-0">
      {fiche && (
        <CardDetailModal
          carte={fiche}
          onClose={() => setFiche(null)}
          marcheOuvert={marketOpen}
          onDefausse={async (instanceId) => {
            const message = await envoie('/api/cards/defausser', { cardInstanceId: instanceId });
            // La carte n'existe plus : elle quitte la révélation, sans quoi on
            // pourrait rouvrir sa fiche et la défausser une seconde fois.
            if (!message) setPulled((liste) => liste.filter((c) => c.instanceId !== instanceId));
            return message;
          }}
          onVente={async (instanceId, prixDepart, dureeMinutes) => {
            const message = await envoie('/api/market/listings', {
              cardInstanceId: instanceId,
              startPrice: prixDepart,
              buyoutPrice: null,
              durationMinutes: dureeMinutes,
            });
            // Elle reste affichée — on vient de l'ouvrir — mais sous séquestre :
            // le drapeau empêche de la remettre en vente ou de la défausser.
            if (!message) {
              setPulled((liste) =>
                liste.map((c) => (c.instanceId === instanceId ? { ...c, enVente: true } : c)),
              );
            }
            return message;
          }}
        />
      )}

      {!shopOpen && <Notice kind="error">La boutique est fermée par la modération.</Notice>}
      {!connected && (
        <Notice>
          Connecte-toi pour ouvrir des boosters. Les prix affichés n’incluent pas encore ta remise
          de collection.
        </Notice>
      )}
      {error && (
        <div className="xl:col-span-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {/* Comment ça marche, en tête et en travers : trois cartes côte à côte,
          une par étape, avant la scène. Chacune porte une pastille de glace
          avec son dessin en glace, un titre, et deux phrases qui disent ce
          qui se passe et ce que ça change pour le joueur. En colonne sur mobile. */}
      <section className="glass px-6 py-6 xl:col-span-2">
        <TitreGlace taille="bloc" eyebrow="En trois étapes" className="mb-5">
          Comment ça marche
        </TitreGlace>
        <ol className="etapes-cartes">
          {[
            {
              titre: 'Choisis ton booster',
              texte:
                'Quatre boosters, du Givre à l’Everest. Plus il coûte cher, plus ses cartes ont de chances d’être rares. Le prix se paie en flocons, ceux que tu gagnes sur tes games.',
              icone: <GlaceSachet className="h-16 w-16" />,
            },
            {
              titre: 'Ouvre-le',
              texte:
                'Le serveur tire tes trois cartes et débite le prix avant même que les rouleaux tournent. Rien ne dépend de ton écran : ferme la page, le résultat sera le même.',
              icone: <GlaceCartes className="h-16 w-16" />,
            },
            {
              titre: 'Garde, joue, vends ou mise',
              texte:
                'Les trois cartes vont dans ta réserve. Joue un bonus sur ta game ou un malus sur un adversaire, mets-en une aux enchères, ou mise-la dans un affrontement.',
              icone: <GlaceEpees className="h-16 w-16" />,
            },
          ].map((etape) => (
            <li key={etape.titre} className="etape-carte glass glass-soft">
              <span className="etape-icone" aria-hidden="true">
                {etape.icone}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[17px] leading-tight font-black tracking-wide text-ink uppercase">
                  {etape.titre}
                </span>
                <span className="mt-1.5 block text-[14px] leading-relaxed text-ink-2">{etape.texte}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------- Scène 3D ------------------------------ */}
      <div className="glass glass-reflet glass-vitre relative overflow-hidden">
        <SnowCap radius="var(--r-lg)" seed="boosters" />
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 42%, ${booster.gradient[0]}33 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        <div className="relative flex min-h-[400px] flex-col items-center justify-center gap-6 px-4 py-10 sm:min-h-[460px]">
          {phase === 'tirage' ? (
            <SpinReel
              pool={poolRail}
              poids={booster.weights}
              gagnantes={pulled}
              relances={pulled.map((c) => c.relance)}
              duree={COURBE_MESUREE.duree}
              onFini={() => setPhase('reveal')}
            />
          ) : phase !== 'reveal' ? (
            <>
              {/* Ce que portaient les fiches supprimées : composition du sachet,
                  rareté garantie et promesse. Ici il n'y en a qu'une, celle du
                  booster choisi — donc lisible au lieu d'être répétée quatre fois. */}
              {/*
                Le nom du sachet est le titre de cette scène, et il se comportait
                comme une légende : deux fois plus petit que celui de la page,
                alors que c'est lui qui change quand on fait défiler la rangée.
                C'est le seul mot qui bouge à l'écran — il mérite la taille d'un
                titre.

                Les explications tiennent dessous, en une phrase. Elles étaient
                en trois cadres au-dessus de la page : trois boîtes à lire avant
                d'arriver aux sachets, pour dire ce qui se dit en une ligne.
              */}
              <div className="flex flex-col items-center gap-2 text-center">
                <TitreGlace taille="page" niveau={2} align="center" givre={false}>
                  {booster.name}
                </TitreGlace>
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
              <RangeeBoosters
                boosters={boosters}
                selection={booster.id}
                onSelection={choisir}
                fige={busy}
                ouvrable={connected && shopOpen && affordable}
                onOuvrir={() => void open()}
              />

              <div className="flex flex-col items-center gap-3">
                {/*
                 * Le prix ne s'affiche que lorsqu'il y a un prix à payer.
                 *
                 * Hors connexion, ou à découvert, le bouton dit pourquoi il ne
                 * marche pas — et une étiquette de prix à côté d'un refus ne
                 * fait qu'ajouter du bruit à un message qui doit se lire d'un
                 * coup.
                 */}
                {(() => {
                  const empeche = !connected || !shopOpen || !affordable;
                  const libelle = busy
                    ? 'Ouverture…'
                    : !connected
                      ? 'Connexion requise'
                      : !shopOpen
                        ? 'Boutique fermée'
                        : !affordable
                          ? 'Flocons insuffisants'
                          : 'Ouvrir';
                  return (
                    <button
                      className={`btn btn-ice ${empeche || busy ? 'btn-lg' : 'btn-ouvrir'}`}
                      disabled={empeche || busy}
                      onClick={open}
                    >
                      <span>{libelle}</span>
                      {!empeche && !busy && (
                        <span className="btn-ouvrir-prix">
                          <span aria-hidden="true">❄</span>
                          {booster.basePrice !== undefined && booster.basePrice > booster.finalPrice && (
                            <s className="prix-barre">{flakes(booster.basePrice)}</s>
                          )}
                          {flakes(booster.finalPrice)}
                        </span>
                      )}
                    </button>
                  );
                })()}

                {balance !== null && (
                  <p className="solde">
                    <span>Solde</span>
                    <span className="solde-valeur">
                      <span className="text-ice" aria-hidden="true">
                        ❄
                      </span>{' '}
                      {flakes(newBalance ?? balance)}
                    </span>
                    {spent !== null && newBalance !== null && (
                      <span className="solde-delta">−{flakes(spent)}</span>
                    )}
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
                        dimmed={card.enVente}
                        onClick={() =>
                          setFiche({
                            ...card,
                            instanceId: card.instanceId || undefined,
                            enVente: card.enVente,
                          })
                        }
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

      {/* ------------------------ La colonne du booster -------------------
          À droite de la scène sur grand écran, dessous sinon. Trois cartes de
          même largeur : ce qu'est le booster choisi, ses taux, et comment
          l'ouverture fonctionne. Avant, seule la table des taux était là, en
          bandeau sous la scène puis seule en haut d'une colonne vide — un
          meuble dans une pièce sans rien d'autre. */}
      <aside className="grid gap-4 sm:grid-cols-2 xl:flex xl:flex-col xl:self-stretch">
        {/* 1. Le booster choisi. */}
        <section className="glass @container relative overflow-hidden">
          {(() => {
            const art = boosterArt(booster.id);
            return art ? (
              <div
                // Fondu vers le bas : le bandeau se dissout dans la plaque au lieu
                // de s'y arrêter sur une ligne.
                className="relative h-48 overflow-hidden [mask-image:linear-gradient(180deg,#000_45%,transparent_100%)] @md:h-56"
              >
                {/* Le fond : la même illustration, agrandie et floutée, comme
                    une pochette vue à travers du givre. Elle donne au bandeau
                    la couleur du booster sans qu'on ait à la choisir. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={art}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-[1.8] object-cover object-[50%_40%] opacity-90 blur-[22px] saturate-[1.3]"
                  draggable={false}
                  aria-hidden="true"
                />
                {/* Le dégradé : sombre à gauche pour la légende, et vers le bas
                    pour se fondre dans la plaque. */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, rgb(6 14 28 / 0.72) 0%, rgb(6 14 28 / 0.25) 45%, transparent 70%), linear-gradient(180deg, rgb(6 14 28 / 0.15) 0%, transparent 35%, rgb(6 14 28 / 0.55) 100%)',
                  }}
                  aria-hidden="true"
                />
                {/* Le sachet, net, posé par-dessus. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={art}
                  alt=""
                  className="absolute top-4 right-6 h-[calc(100%-2rem)] w-auto object-contain drop-shadow-[0_14px_22px_rgb(0_0_0/0.65)]"
                  draggable={false}
                />
              </div>
            ) : null;
          })()}
          <div className="relative -mt-16 px-4 pb-4">
            <p className="eyebrow">Booster choisi</p>
            <TitreGlace taille="bloc">{booster.name}</TitreGlace>
            <p className="mt-1 text-[16px] text-ink-2">{booster.tagline}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[16px]">
              <div>
                <dt className="text-[12px] tracking-[0.16em] text-faint uppercase">Contenu</dt>
                <dd className="mt-0.5 font-display text-[22px] leading-none font-black text-ink">
                  {booster.slots.effet + booster.slots.collection} cartes
                </dd>
              </div>
              <div>
                <dt className="text-[12px] tracking-[0.16em] text-faint uppercase">Prix</dt>
                <dd className="num mt-0.5 font-display text-[22px] leading-none font-black text-ink">
                  {booster.basePrice !== undefined && booster.basePrice > booster.finalPrice && (
                    <s className="mr-1.5 text-[15px] font-semibold text-faint">
                      {flakes(booster.basePrice)}
                    </s>
                  )}
                  ❄ {flakes(booster.finalPrice)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[12px] tracking-[0.16em] text-faint uppercase">Garantie</dt>
                <dd className="mt-1 text-[16px] text-ink">
                  {booster.guaranteed ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      Au moins une carte{' '}
                      <strong style={{ color: rarityMeta(booster.guaranteed).color }}>
                        {rarityMeta(booster.guaranteed).label}
                      </strong>{' '}
                      ou mieux <RarityChip rarity={booster.guaranteed} />
                    </span>
                  ) : (
                    <span className="text-muted">
                      Aucune : chaque carte est tirée aux taux ci-dessous.
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* 2. Les taux, une ligne par rareté. */}
        {/* Sur grand écran, la table prend la hauteur qui reste, pour finir au
            niveau de la scène : les lignes se répartissent. */}
        <section className="glass xl:flex xl:flex-1 xl:flex-col">
          <div className="border-b border-white/10 px-4 pt-4 pb-3">
            <TitreGlace taille="bloc" eyebrow={booster.name}>
              Taux de rareté
            </TitreGlace>
          </div>
          {/* Six lignes, une par rareté : le flocon, le nom, le taux en grand.
              Rien d'autre — la chance « au moins une par booster » a été
              affichée dessous, en petit, et retirée : un seul nombre par ligne. */}
          <ul className="divide-y divide-white/10 xl:flex xl:flex-1 xl:flex-col xl:justify-around">
            {RARITY_LADDER.map((rarity) => {
              const meta = rarityMeta(rarity);
              const per = rarityPercent(booster.weights, rarity);
              const fmt = (v: number) => (v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(1));
              return (
                <li key={rarity} className="flex items-center gap-3 px-4 py-2.5">
                  <RarityChip rarity={rarity} taille={26} />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{meta.label}</span>
                  <span
                    className="num shrink-0 font-display text-[24px] leading-none font-black"
                    style={{ color: COULEURS_TAUX[rarity] }}
                  >
                    {fmt(per)} %
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>
    </div>
  );
}
