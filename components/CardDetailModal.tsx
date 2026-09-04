'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CardFrame } from '@/components/CardFrame';
import { IconImpact, IconSnowflake } from '@/components/icons';
import { flakes, rarityMeta } from '@/components/ui';
import { PriceChart } from '@/components/PriceChart';
import { cardNumber, getCard } from '@/lib/domain/catalog';
import { shortDateTime } from '@/lib/format';
import { ECONOMY, libelleDuree, MARKET } from '@/lib/domain/rules';

export interface CarteDetail {
  cardId: string;
  name: string;
  subtitle: string;
  description: string;
  rarity: string;
  glyph: string;
  /** Absents pour une carte de collection, qui ne se joue pas. */
  power?: number;
  nature?: 'bonus' | 'malus';
  isNew?: boolean;
  /**
   * L'exemplaire détenu, quand la fiche en désigne un.
   *
   * Absent, la fiche reste une fiche de **catalogue** : on lit la carte, on ne
   * peut ni la vendre ni la défausser. C'est ce qui permet d'ouvrir la même
   * fenêtre depuis la grille des vingt-quatre cartes et depuis sa propre
   * réserve.
   */
  instanceId?: string;
  /** L'exemplaire est déjà sous séquestre : ni jouable, ni vendable. */
  enVente?: boolean;
}

/** Une vente conclue, telle que la route la renvoie. */
interface Vente {
  id: string;
  price: number;
  method: string;
  soldAt: string;
  buyer: string;
  seller: string;
}

/** Ce que l'onglet Marché affiche, une fois la cote rapatriée. */
interface Cote {
  lastPrice: number | null;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  volume: number;
  trend7d: number | null;
  activeListings: number;
  floorPrice: number | null;
  /** Les ventes conclues, de la plus ancienne à la plus récente : la courbe. */
  history: { at: string; price: number }[];
}

/** Une ligne de fiche : intitulé à gauche, valeur à droite. */
function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/8 py-2 last:border-0">
      <span className="text-[13px] text-faint">{label}</span>
      <span className="text-right text-[14px] font-bold text-ink">{children}</span>
    </div>
  );
}

/**
 * Un chiffre qui compte, dans son propre cadre.
 *
 * Deux blocs côte à côte plutôt que deux lignes de tableau : ce sont les seules
 * valeurs qu'on cherche du regard en ouvrant une fiche, et une ligne de tableau
 * les range à égalité avec le numéro de série.
 */
function Bloc({
  label,
  valeur,
  suffixe,
  couleur,
  icone,
}: {
  label: string;
  valeur: string;
  suffixe?: string;
  couleur: string;
  icone: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 rounded-xl px-3 py-2.5"
      style={{
        background: `color-mix(in srgb, ${couleur} 12%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${couleur} 30%, transparent)`,
      }}
    >
      <p
        className="flex items-center gap-1.5 font-display text-2xl leading-none font-black tabular-nums"
        style={{ color: couleur }}
      >
        {icone}
        {valeur}
        {suffixe && <span className="text-[15px] font-bold opacity-60">{suffixe}</span>}
      </p>
      <p className="mt-1 font-display text-[11px] font-bold tracking-[0.16em] text-faint uppercase">
        {label}
      </p>
    </div>
  );
}

/** Une mesure de la cote : un chiffre, son intitulé, rien de plus. */
function Mesure({ label, valeur, couleur }: { label: string; valeur: string; couleur?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2">
      <p className="font-display text-[11px] font-bold tracking-[0.14em] text-faint uppercase">
        {label}
      </p>
      <p
        className="font-display text-lg leading-none font-black tabular-nums"
        style={{ color: couleur ?? 'var(--ink)' }}
      >
        {valeur}
      </p>
    </div>
  );
}

/**
 * La fiche d'une carte, ouverte depuis une vignette.
 *
 * ## Deux onglets, et pourquoi
 *
 * **Détails** est immédiat : tout y est déjà dans le catalogue que la page a
 * reçu, et une fiche qui charge est une fiche qui clignote.
 *
 * **Marché** ne l'est pas, et c'est assumé : la cote demande de lire les ventes
 * et les enchères en cours, ce qu'on ne peut pas envoyer d'avance pour les
 * vingt-quatre cartes d'une grille. Elle est donc rapatriée **au premier clic
 * sur l'onglet**, une seule fois, et gardée tant que la fiche reste ouverte.
 * Charger d'emblée ferait une requête par carte survolée, pour une information
 * que la plupart des visiteurs ne regardent pas.
 *
 * Le grand format à gauche est la même carte que dans la grille, simplement
 * plus large : ses tailles sont en `cqw`, donc la description, masquée sur une
 * vignette faute de place, réapparaît ici sans autre réglage.
 */
export function CardDetailModal({
  carte,
  onClose,
  marcheOuvert,
  onJouer,
  onDefausse,
  onVente,
}: {
  carte: CarteDetail;
  onClose: () => void;
  /** Faux quand la modération a fermé l'hôtel des ventes. */
  marcheOuvert?: boolean;
  /**
   * Jouer la carte. Le bouton ferme la fiche et laisse l'appelant ouvrir sa
   * propre boîte de dialogue : jouer demande une cible — une game à soi, un
   * adversaire — et cette question n'a pas sa place dans une fiche de lecture.
   */
  onJouer?: () => void;
  /** Rend un message d'erreur, ou rien si la défausse a réussi. */
  onDefausse?: (instanceId: string) => Promise<string | null>;
  /** Idem : un message si le serveur refuse, rien si la vente est ouverte. */
  onVente?: (
    instanceId: string,
    prixDepart: number,
    dureeMinutes: number,
  ) => Promise<string | null>;
}) {
  const [onglet, setOnglet] = useState<'details' | 'marche'>('details');
  /** Le panneau ouvert : aucun, la mise en vente, ou la confirmation de défausse. */
  const [panneau, setPanneau] = useState<null | 'vente' | 'defausse'>(null);
  const [prix, setPrix] = useState('');
  const [duree, setDuree] = useState<number>(60);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [cote, setCote] = useState<Cote | null>(null);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [coteEtat, setCoteEtat] = useState<'repos' | 'charge' | 'prete' | 'echec'>('repos');

  // Échappe pour fermer, et la page dessous ne défile plus : sans ce verrou, la
  // molette traverse la fiche et fait défiler la grille derrière elle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = precedent;
    };
  }, [onClose]);

  /** La cote, rapatriée une seule fois, au moment où on la demande. */
  const ouvreMarche = useCallback(async () => {
    setOnglet('marche');
    if (coteEtat !== 'repos') return;
    setCoteEtat('charge');
    try {
      const reponse = await fetch(`/api/market/stats/${carte.cardId}`, { cache: 'no-store' });
      const charge = await reponse.json();
      if (!charge.ok) {
        setCoteEtat('echec');
        return;
      }
      setCote(charge.data.stats as Cote);
      setVentes((charge.data.sales ?? []) as Vente[]);
      setCoteEtat('prete');
    } catch {
      setCoteEtat('echec');
    }
  }, [carte.cardId, coteEtat]);

  /*
   * Une carte de collection ne s'échange pas.
   *
   * Les cartes Joueur et Moment vivent en base, pas au catalogue, et
   * `createListing` refuse tout ce qu'il n'y trouve pas : leur proposer une
   * mise en vente serait promettre un bouton qui échoue à tous les coups. Leur
   * cote n'existe pas davantage — la route de statistiques répondait
   * « introuvable », et l'onglet Marché affichait une erreur là où il n'y a
   * simplement rien à dire.
   *
   * L'onglet et le bouton disparaissent donc pour elles. La défausse, en
   * revanche, reste : elle ne regarde que la propriété de l'exemplaire.
   */
  const echangeable = getCard(carte.cardId) !== null;

  const meta = rarityMeta(carte.rarity);

  const prixNombre = Number(prix);
  const prixValide =
    Number.isInteger(prixNombre) && prixNombre >= MARKET.minPrice && prixNombre <= MARKET.maxPrice;

  async function vendre() {
    if (!carte.instanceId || !onVente || !prixValide) return;
    setOccupe(true);
    setErreur(null);
    const message = await onVente(carte.instanceId, prixNombre, duree);
    setOccupe(false);
    if (message) setErreur(message);
    else onClose();
  }

  async function defausser() {
    if (!carte.instanceId || !onDefausse) return;
    setOccupe(true);
    setErreur(null);
    const message = await onDefausse(carte.instanceId);
    setOccupe(false);
    if (message) setErreur(message);
    else onClose();
  }

  const sousOnglet = (cle: 'details' | 'marche', libelle: string) => {
    const actif = onglet === cle;
    return (
      <button
        key={cle}
        type="button"
        aria-pressed={actif}
        onClick={() => (cle === 'marche' ? void ouvreMarche() : setOnglet('details'))}
        className="rounded-full px-3 py-1.5 font-display text-[13px] font-bold transition-colors"
        style={{
          background: actif ? 'var(--ice)' : 'transparent',
          color: actif ? '#060a12' : 'var(--muted)',
        }}
      >
        {libelle}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={carte.name}
      onClick={onClose}
    >
      {/*
        Le défilement vit **dans** la plaque, pas sur elle.

        C'était le défaut visible en bas de fiche : `.glass` porte son biseau en
        pseudo-élément posé à `inset: 0`, et dans un conteneur qui défile, un
        élément absolu défile avec le contenu. L'anneau restait donc ancré en
        haut du contenu, et en descendant on voyait sa bordure inférieure passer
        en travers des boutons — une ligne arrondie au milieu de nulle part.

        La plaque ne défile plus : elle rogne (`overflow-hidden`), son anneau
        reste sur ses bords, et c'est une boîte intérieure qui défile si jamais
        la fenêtre est trop courte. En pratique elle ne défile plus : le contenu
        a été taillé pour tenir — cinq ventes au lieu de dix, et les mesures
        resserrées.
      */}
      <div
        className="glass flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-b-none sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
        {/*
          Dans l'onglet Marché, la carte s'efface et le contenu prend toute la
          largeur.

          Une courbe, cinq mesures et dix lignes de ventes dans une colonne de
          quatre cents pixels, ce sont trois éléments illisibles côte à côte
          d'une illustration qu'on vient déjà de regarder. Le grand format sert
          l'onglet Détails, où c'est bien la carte qu'on examine ; sur le
          Marché, ce qu'on examine est son cours.
        */}
        <div
          className={`grid gap-4 p-3 sm:gap-5 sm:p-5 ${
            onglet === 'marche' ? '' : 'sm:grid-cols-[minmax(0,272px)_1fr]'
          }`}
        >
          {/* ------------------------ Le grand format ------------------- */}
          <div className={`mx-auto w-full max-w-[300px] ${onglet === 'marche' ? 'hidden' : ''}`}>
            <CardFrame
              cardId={carte.cardId}
              name={carte.name}
              description={carte.description}
              rarity={carte.rarity}
              glyph={carte.glyph}
              power={carte.power}
              nature={carte.nature}
            />
          </div>

          {/* ---------------------------- La fiche ---------------------- */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl leading-tight font-black tracking-wide text-ink">
                  {carte.name}
                </h2>
                <span
                  className="mt-1.5 inline-block rounded-md px-2 py-0.5 font-display text-[12px] font-black tracking-wider uppercase"
                  style={{ background: meta.color, color: '#0b1420' }}
                >
                  {meta.label}
                </span>
              </div>

              {/* Les deux onglets, à hauteur du titre. */}
              <div
                className="flex shrink-0 gap-0.5 rounded-full p-0.5"
                style={{ background: echangeable ? 'rgb(255 255 255 / 0.06)' : 'transparent' }}
              >
                {sousOnglet('details', 'Détails')}
                {echangeable && sousOnglet('marche', 'Marché')}
              </div>

              <button
                className="btn btn-sm btn-ghost shrink-0"
                onClick={onClose}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {/* ======================= Onglet Détails ==================== */}
            {onglet === 'details' && (
              <div className="min-w-0">
                {carte.subtitle && (
                  <p className="mt-3 text-[15px] leading-relaxed text-muted italic">
                    « {carte.subtitle} »
                  </p>
                )}

                <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[15px] leading-relaxed text-ink">
                  {carte.description}
                </div>

                {/* Puissance et nature n'existent que pour une carte à effet.
                    Les afficher à vide pour une carte Joueur ou Moment lui
                    prêterait des caractéristiques de jeu qu'elle n'a pas. */}
                {carte.power !== undefined && (
                  <div className="mt-4 flex gap-2">
                    <Bloc
                      label="Puissance"
                      valeur={String(carte.power)}
                      suffixe="/ 100"
                      couleur={meta.color}
                      icone={<IconImpact className="h-[0.8em] w-[0.8em]" />}
                    />
                    <Bloc
                      label={carte.nature === 'malus' ? 'Malus' : 'Bonus'}
                      valeur={carte.nature === 'malus' ? '−' : '+'}
                      couleur={carte.nature === 'malus' ? 'var(--danger)' : 'var(--aurora)'}
                      icone={<IconSnowflake className="h-[0.8em] w-[0.8em]" />}
                    />
                  </div>
                )}

                <div className="mt-4">
                  <Ligne label="Rareté">
                    <span style={{ color: meta.color }}>{meta.label}</span>
                  </Ligne>
                  <Ligne label="Numéro">
                    <span className="num text-faint">{cardNumber(carte.cardId)}</span>
                  </Ligne>
                </div>
              </div>
            )}

            {/* ======================== Onglet Marché ==================== */}
            {onglet === 'marche' && (
              <div className="mt-3 min-w-0">
                {coteEtat === 'charge' && <p className="text-[14px] text-muted">Un instant…</p>}
                {coteEtat === 'echec' && (
                  <p className="text-[14px] text-danger">La cote n’a pas pu être lue.</p>
                )}

                {coteEtat === 'prete' && cote && (
                  <>
                    {/*
                      Jamais vendue n'est pas « valeur nulle ».
                      Afficher « 0 ❄ » ferait croire que la carte ne vaut rien,
                      alors que personne ne l'a encore mise en vente. La
                      distinction compte pour une légendaire fraîchement sortie.
                    */}
                    {cote.volume === 0 ? (
                      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-[14px] leading-relaxed text-muted">
                        Cette carte ne s’est <strong>jamais vendue</strong>. Aucune cote ne peut
                        être établie — c’est toi qui fixeras la première.
                      </div>
                    ) : (
                      <>
                        <p className="mb-2 font-display text-[12px] font-bold tracking-[0.18em] text-muted uppercase">
                          Évolution des prix
                        </p>

                        {/* Les cinq mesures d'un coup d'œil. Une grille et non
                            une ligne : à cinq, elles ne tiennent pas côte à côte
                            sur un téléphone, et une valeur tronquée ne vaut
                            rien. */}
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2">
                          <Mesure label="Ventes" valeur={String(cote.volume)} />
                          <Mesure
                            label="Dernier"
                            valeur={cote.lastPrice === null ? '—' : flakes(cote.lastPrice)}
                            couleur={meta.color}
                          />
                          <Mesure
                            label="Moyenne"
                            valeur={
                              cote.averagePrice === null
                                ? '—'
                                : flakes(Math.round(cote.averagePrice))
                            }
                          />
                          <Mesure
                            label="Min"
                            valeur={cote.minPrice === null ? '—' : flakes(cote.minPrice)}
                          />
                          <Mesure
                            label="Max"
                            valeur={cote.maxPrice === null ? '—' : flakes(cote.maxPrice)}
                          />
                        </div>

                        {/* La courbe, et c'est celle du marché, telle quelle :
                            un second graphique dessiné autrement ferait douter
                            de celui des deux qui dit vrai. */}
                        {cote.history.length > 1 && (
                          <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/25 p-2">
                            <PriceChart
                              points={cote.history}
                              color={meta.color}
                              average={cote.averagePrice}
                            />
                          </div>
                        )}

                        {/* La tendance saute sur téléphone : c'est la ligne la
                            moins essentielle des trois, et c'est elle qui faisait
                            déborder la fiche de quarante pixels. */}
                        {cote.trend7d !== null && (
                          <div className="mt-3 hidden sm:block">
                            <Ligne label="Tendance 7 jours">
                              <span
                                className="num"
                                style={{
                                  color: cote.trend7d >= 0 ? 'var(--aurora)' : 'var(--danger)',
                                }}
                              >
                                {cote.trend7d >= 0 ? '+' : ''}
                                {cote.trend7d.toFixed(1)} %
                              </span>
                            </Ligne>
                          </div>
                        )}

                        {/* Qui l'a achetée, et à qui.

                            Une cote sans les noms est un cours de bourse ; avec
                            eux, c'est l'histoire d'une carte dans une ligue de
                            vingt personnes — et surtout on sait à qui aller la
                            racheter. */}
                        {ventes.length > 0 && (
                          <div className="mt-4">
                            <p className="mb-2 font-display text-[12px] font-bold tracking-[0.18em] text-muted uppercase">
                              <span className="sm:hidden">{Math.min(3, ventes.length)}</span>
                              <span className="hidden sm:inline">{Math.min(5, ventes.length)}</span>{' '}
                              dernières ventes
                              {ventes.length > 5 && (
                                <span className="ml-1.5 text-faint normal-case">
                                  sur {ventes.length}
                                </span>
                              )}
                            </p>
                            <ul className="space-y-1">
                              {ventes.slice(0, 5).map((v, i) => (
                                <li
                                  key={v.id}
                                  /* Trois ventes sur téléphone, cinq ensuite :
                                     c'est la coupe qui permet à la fiche de tenir
                                     sans défiler sur un écran de poche. */
                                  className={`items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 ${
                                    i < 3 ? 'flex' : 'hidden sm:flex'
                                  }`}
                                  style={{ borderLeft: `3px solid ${meta.color}` }}
                                >
                                  <span className="num shrink-0 text-[13px] text-muted">
                                    {shortDateTime(v.soldAt)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                                    {v.seller} → <strong className="text-ink-2">{v.buyer}</strong>
                                    <span className="ml-1 text-faint">
                                      {v.method === 'ENCHERE' ? '· enchère' : '· achat immédiat'}
                                    </span>
                                  </span>
                                  <span
                                    className="num shrink-0 font-display text-[15px] font-black"
                                    style={{ color: meta.color }}
                                  >
                                    ❄ {flakes(v.price)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                  </>
                )}

                {/* Ce qui se vend en ce moment tient dans le lien, sans ligne
                    dédiée : « aucune » occupait une ligne entière pour dire qu'il
                    n'y avait rien à dire. */}
                {echangeable && (
                  <Link
                    href={`/marche/${carte.cardId}`}
                    className="mt-3 inline-block text-[13px] font-bold text-ice no-underline hover:underline"
                  >
                    {cote && cote.activeListings > 0
                      ? `${cote.activeListings} en vente${
                          cote.floorPrice !== null ? ` dès ${flakes(cote.floorPrice)} ❄` : ''
                        } · voir sur le marché →`
                      : 'Voir la courbe complète sur le marché →'}
                  </Link>
                )}
              </div>
            )}

            {/* --------------------------- Les actions -------------------

                Elles n'apparaissent que si la carte est **un exemplaire à toi**,
                et elles restent visibles quel que soit l'onglet : on décide de
                vendre en regardant la cote, pas en revenant aux détails.

                Les deux gestes sont irréversibles et demandent chacun une
                seconde intention — un panneau qui s'ouvre, pas un clic qui
                exécute. Défausser une légendaire par mégarde n'a aucun recours,
                la carte n'existe plus. */}
            {carte.instanceId && (
              <div className="mt-auto space-y-2 border-t border-white/10 pt-3">
                {carte.enVente ? (
                  <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[13px] text-muted">
                    Cette carte est <strong>en vente</strong>. Annule la vente à l’hôtel des ventes
                    pour pouvoir la jouer, la revendre autrement ou la défausser.
                  </p>
                ) : (
                  <>
                    {panneau === null && onJouer && (
                      <button
                        type="button"
                        className="btn btn-ice w-full"
                        disabled={occupe}
                        onClick={onJouer}
                      >
                        Jouer cette carte
                      </button>
                    )}

                    {panneau === null && (
                      <div className={echangeable ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2'}>
                        {echangeable && (
                          <button
                            type="button"
                            className={onJouer ? 'btn' : 'btn btn-ice'}
                            disabled={occupe || marcheOuvert === false}
                            onClick={() => setPanneau('vente')}
                          >
                            Mettre aux enchères
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={occupe}
                          onClick={() => setPanneau('defausse')}
                        >
                          Défausser · +{ECONOMY.defausse} ❄
                        </button>
                      </div>
                    )}

                    {marcheOuvert === false && panneau === null && (
                      <p className="text-[13px] text-faint">
                        L’hôtel des ventes est fermé par la modération.
                      </p>
                    )}

                    {/* ------------------------ La mise en vente ---------- */}
                    {panneau === 'vente' && (
                      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
                        <label className="block space-y-1">
                          <span className="eyebrow">Prix de départ</span>
                          <input
                            className="field"
                            type="number"
                            inputMode="numeric"
                            min={MARKET.minPrice}
                            max={MARKET.maxPrice}
                            value={prix}
                            onChange={(e) => setPrix(e.target.value)}
                            autoFocus
                          />
                          <span className="block text-[12px] text-faint">
                            Entre {MARKET.minPrice} et {flakes(MARKET.maxPrice)} ❄. Les enchères
                            partent de là.
                          </span>
                        </label>

                        <div className="space-y-1">
                          <span className="eyebrow">Durée</span>
                          {/* Des pastilles et non une liste déroulante : sept
                              durées se montrent, elles ne se déroulent pas — et
                              c'est le choix qui décide si la vente se conclut à
                              l'antenne ou pendant la nuit. */}
                          <div className="flex flex-wrap gap-1.5">
                            {MARKET.durationsMinutes.map((m) => {
                              const actif = m === duree;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  aria-pressed={actif}
                                  onClick={() => setDuree(m)}
                                  className="rounded-full px-3 py-1.5 font-display text-[13px] font-bold transition-colors"
                                  style={{
                                    background: actif ? 'var(--ice)' : 'transparent',
                                    color: actif ? '#060a12' : 'var(--ink-2)',
                                    boxShadow: `inset 0 0 0 1px ${
                                      actif ? 'var(--ice)' : 'var(--glass-edge)'
                                    }`,
                                  }}
                                >
                                  {libelleDuree(m)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {erreur && <p className="text-[13px] text-danger">{erreur}</p>}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-ice flex-1"
                            disabled={occupe || !prixValide}
                            onClick={vendre}
                          >
                            {occupe ? 'Un instant…' : `Mettre en vente · ${libelleDuree(duree)}`}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={occupe}
                            onClick={() => {
                              setPanneau(null);
                              setErreur(null);
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {/* -------------------------- La défausse ------------- */}
                    {panneau === 'defausse' && (
                      <div className="space-y-3 rounded-xl border border-danger/35 bg-danger/8 p-3">
                        <p className="text-[14px] leading-relaxed text-ink-2">
                          <strong>{carte.name}</strong> sera détruite. Tu récupères{' '}
                          {ECONOMY.defausse} ❄, et c’est définitif — aucun moyen de la récupérer.
                        </p>
                        {erreur && <p className="text-[13px] text-danger">{erreur}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn btn-danger flex-1"
                            disabled={occupe}
                            onClick={defausser}
                          >
                            {occupe ? 'Un instant…' : 'Oui, défausser'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={occupe}
                            onClick={() => {
                              setPanneau(null);
                              setErreur(null);
                            }}
                          >
                            Garder
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* La fiche de catalogue, sans exemplaire, garde son lien : c'est
                sa seule sortie vers le marché. */}
            {!carte.instanceId && echangeable && onglet === 'details' && (
              <Link
                href={`/marche/${carte.cardId}`}
                className="btn btn-ice mt-4 w-full justify-center no-underline"
              >
                Voir la cote sur le marché
              </Link>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
