'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChoixJoueurBooster, type CandidatBooster } from '@/components/ChoixJoueurBooster';
import { RangeePacks } from '@/components/RangeePacks';
import { SnowCap } from '@/components/SnowCap';
import { prechargeSons, reveilleSon } from '@/components/bruitage';
import { RailJoueurs } from '@/components/RailJoueurs';
import { RailPack, type CarteRailPack } from '@/components/RailPack';
import { CartesParRarete, type CarteSaison } from '@/components/CartesParRarete';
import { DestinCarte } from '@/components/DestinCarte';
import { CardTile, Notice, flakes, rarityMeta } from '@/components/ui';
import { packArt } from '@/lib/domain/catalog';
import { ECONOMY, libelleMultiplicateur, PACKS_REGLES, rarityPercent, SUB_MILESTONES } from '@/lib/domain/rules';
import { CE_QUI_COMPTE, CE_QUI_NE_COMPTE_PAS } from '@/lib/domain/twitchSubs';
import { IconCoche, IconCroix } from '@/components/icons';
import type { PackDefinition, PackId, Rarity } from '@/lib/domain/types';
import type { OuvertureVue, PackDuVue, TirageJoueurs } from '@/lib/services/packs';
import { COURBE_MESUREE } from '@/lib/spin/courbe';
import { TitreGlace } from '@/components/TitreGlace';
import { GlaceCartes, GlaceEpees, GlaceSachet } from '@/components/DessinsGlace';
import { EmblemeRarete } from '@/components/EmblemeRarete';

const RARITY_LADDER: Rarity[] = ['C', 'R', 'UR', 'L'];

/** Un taux en pourcentage, à la française : « 83,0 % », « 0,20 % ». */
function pourcent(v: number): string {
  const decimales = v === 0 ? 0 : v < 0.1 ? 3 : v < 1 ? 2 : 1;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

/**
 * Le même taux, en chances : « 1 sur 500 » parle mieux que « 0,20 % ». Au-delà
 * d'une sur cinq, on compte sur dix. Approché, il porte un « ≈ ».
 */
function chances(v: number): string {
  if (v <= 0) return 'jamais';
  if (v >= 20) {
    const sur10 = Math.round(v / 10);
    return `${sur10 * 10 === v ? '' : '≈ '}${sur10} sur 10`;
  }
  const n = 100 / v;
  const arrondi = Math.round(n);
  return `${Math.abs(n - arrondi) < 1e-9 ? '' : '≈ '}1 sur ${arrondi.toLocaleString('fr-FR')}`;
}

/** Tous les combien de subs de la saison un booster de la ligue tombe. */
function palierDe(pack: PackId): number | undefined {
  return SUB_MILESTONES.find((m) => m.kind === 'PACK' && m.packId === pack)?.every;
}

/**
 * Sous l'étape 1 : ce qui compte pour un sub, et ce qui ne compte pas, en
 * pastilles qu'on lit d'un coup d'œil. Les listes viennent de
 * `lib/domain/twitchSubs.ts`, comme la règle qu'elles disent.
 */
function CeQuiCompte() {
  return (
    <div className="etape-subs">
      <div className="etape-subs-ligne" data-compte="">
        <span className="etape-subs-titre">
          <IconCoche className="h-5 w-5" />
          Compte, un sub chacun
        </span>
        <ul className="etape-subs-puces">
          {CE_QUI_COMPTE.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="etape-subs-ligne">
        <span className="etape-subs-titre">
          <IconCroix className="h-5 w-5" />
          Ne compte pas
        </span>
        <ul className="etape-subs-puces">
          {CE_QUI_NE_COMPTE_PAS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export interface PackVitrine extends PackDefinition {
  /** Les cartes que ce pack peut donner : le pool des leurres du rail. */
  cartes: CarteRailPack[];
}

export interface JoueurOuverture {
  id: string;
  pseudo: string;
  avatarUrl: string | null;
  snowflakes: number;
  chance: number;
}

/**
 * Les trois états de l'écran : le choix, le rail qui tourne, la carte posée.
 *
 * Reste `tirage`, où le rail met en scène un résultat **déjà acquis** : le
 * serveur a tiré avant que la première tuile n'existe.
 */
type Phase = 'repos' | 'demande' | 'tirage' | 'joueurs' | 'reveal';

/** Une ouverture, et son second tirage quand la carte tombe sur des joueurs tirés au sort. */
type OuvertureTiree = OuvertureVue & { tirage?: TirageJoueurs | null };

/**
 * La page des packs, telle qu'elle était pour les boosters : la rangée de
 * sachets, la scène, la colonne du pack choisi. Avec une différence de fond :
 * **personne n'achète**. Seule la modération ouvre, et choisit pour qui.
 *
 * Le tirage est fait par le serveur à l'ouverture ; l'animation ne fait que
 * mettre en scène un résultat déjà décidé. Rejouer la requête avec la même
 * clé rend exactement la même carte.
 */
export function PackOpening({
  packs,
  saison,
  file,
  joueurs,
  moderateur,
  aLaMain = false,
  totalSubs = 0,
}: {
  packs: PackVitrine[];
  /** Toutes les cartes de la saison, montrées par rareté sous les boosters. */
  saison: CarteSaison[];
  /** Ce qui est dû, pour que la modération l'ouvre d'un clic. */
  file: PackDuVue[];
  /** Les joueurs, pour choisir à qui le pack s'ouvre. Vide hors modération. */
  joueurs: JoueurOuverture[];
  /** Vrai si la session peut ouvrir. Le serveur revérifie de toute façon. */
  moderateur: boolean;
  /**
   * Vrai si la session voit le choix du joueur et le bouton d'ouverture. Le
   * bouton n'ouvre que ce qui est dû — le serveur le revérifie.
   */
  aLaMain?: boolean;
  /** Les subs de la saison : pour annoncer le prochain palier d'un booster collectif. */
  totalSubs?: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PackId>(packs[0]?.id ?? 'perso');
  const [joueurId, setJoueurId] = useState('');
  const [phase, setPhase] = useState<Phase>('repos');
  const [error, setError] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<OuvertureTiree | null>(null);
  /** Quel joueur le second tirage déroule : le premier, puis le second. */
  const [rangJoueur, setRangJoueur] = useState(0);

  useEffect(() => {
    if (moderateur) void prechargeSons();
  }, [moderateur]);

  const pack = useMemo(() => packs.find((p) => p.id === selected) ?? packs[0], [packs, selected]);
  const busy = phase === 'demande' || phase === 'tirage' || phase === 'joueurs';
  const pourUnJoueur = pack?.portee === 'JOUEUR';

  const choisir = useCallback((id: string) => {
    setSelected((actuel) => (actuel === id ? actuel : (id as PackId)));
  }, []);

  /** La file, restreinte au pack choisi. */
  const dus = useMemo(() => file.filter((p) => p.packId === pack?.id), [file, pack]);

  /** Combien de boosters de ce type attendent chaque joueur. */
  const dusParJoueur = useMemo(() => {
    const n = new Map<string, number>();
    for (const d of dus) if (d.joueurId) n.set(d.joueurId, (n.get(d.joueurId) ?? 0) + 1);
    return n;
  }, [dus]);

  /** Les joueurs qui ont un booster de ce type à ouvrir : les seuls qu'on peut choisir. */
  const candidats = useMemo(
    (): CandidatBooster[] =>
      joueurs
        .filter((j) => dusParJoueur.has(j.id))
        .map((j) => ({
          id: j.id,
          pseudo: j.pseudo,
          avatarUrl: j.avatarUrl,
          chance: j.chance,
          n: dusParJoueur.get(j.id) ?? 0,
        }))
        .sort((a, b) => b.n - a.n || a.pseudo.localeCompare(b.pseudo, 'fr')),
    [joueurs, dusParJoueur],
  );

  /**
   * Le joueur choisi, tant qu'il a un booster à ouvrir ; seul candidat, il est
   * choisi d'office. Déduit à chaque rendu plutôt que gardé : après une
   * ouverture, la file se recharge, et qui n'a plus rien à ouvrir ne reste pas
   * choisi.
   */
  const choisi = candidats.some((c) => c.id === joueurId)
    ? joueurId
    : candidats.length === 1
      ? candidats[0].id
      : '';
  const joueur = joueurs.find((j) => j.id === choisi);

  /**
   * Ce que le bouton peut ouvrir : les boosters dus à ce joueur, ou, pour un
   * booster collectif, ceux que les paliers ont mis en file. Le serveur ne
   * laisse rien ouvrir d'autre.
   */
  const restants = pack?.portee === 'JOUEUR' ? (choisi ? (dusParJoueur.get(choisi) ?? 0) : 0) : dus.length;

  /** Le prochain palier d'un booster collectif : à combien de subs, et combien il en manque. */
  const palier = SUB_MILESTONES.find((m) => m.kind === 'PACK' && m.packId === pack?.id);
  const prochainPalier = palier ? (Math.floor(totalSubs / palier.every) + 1) * palier.every : null;

  async function ouvre(corps: Record<string, unknown>) {
    if (!pack || busy) return;
    // Le contexte audio se réveille sur ce clic, avant le premier `await`.
    reveilleSon();
    setError(null);
    setPhase('demande');

    try {
      const response = await fetch('/api/admin/packs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...corps, idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setError(payload.error?.message ?? 'Ouverture impossible.');
        setPhase('repos');
        return;
      }
      // La carte est connue avant que le rail ne parte : il ne tire rien, il
      // révèle.
      setOuverture(payload.data as OuvertureTiree);
      setRangJoueur(0);
      setPhase('tirage');
      // La file se recharge pendant que le rail tourne, caché sous lui : la
      // pastille d'un joueur qui n'a plus rien à ouvrir s'éteint, les compteurs
      // descendent.
      router.refresh();
    } catch {
      setError('Le serveur n’a pas répondu. Réessaie dans un instant.');
      setPhase('repos');
    }
  }

  function reset() {
    setPhase('repos');
    setOuverture(null);
    setRangJoueur(0);
  }

  if (!pack) return null;

  const gagnante: CarteRailPack | null = ouverture
    ? {
        cardId: ouverture.cardId,
        name: ouverture.nom,
        rarity: ouverture.rarity,
        glyph: ouverture.glyph,
        description: ouverture.description,
        power: ouverture.power,
        nature: ouverture.nature,
      }
    : null;
  const packOuvert = ouverture ? (packs.find((p) => p.id === ouverture.packId) ?? pack) : pack;
  /** Ce qui se pose par-dessus le repos : le rail qui tourne, ou la carte tirée. */
  const tirage = ouverture?.tirage?.gagnants.length ? ouverture.tirage : null;
  const surScene =
    phase === 'tirage' && gagnante
      ? 'tirage'
      : phase === 'joueurs' && tirage
        ? 'joueurs'
        : phase === 'reveal' && ouverture
          ? 'reveal'
          : null;

  return (
    <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-6 xl:space-y-0">
      {error && (
        <div className="xl:col-span-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {/* Comment ça marche, en tête et en travers : trois étapes numérotées,
          reliées par une flèche quand elles tiennent sur une ligne. */}
      <section className="glass @container relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6 xl:col-span-2 3xl:px-8 3xl:py-7">
        <SnowCap radius="var(--r-lg)" seed="boosters-etapes" epaisseur={16} />
        <TitreGlace taille="bloc" eyebrow="En trois étapes" className="relative mb-5">
          Comment ça marche
        </TitreGlace>
        <ol className="etapes-cartes">
          {[
            {
              titre: 'Un booster t’est dû',
              texte: `Un sub T3, ou ${PACKS_REGLES.persoTousLes} subs offerts : un Booster Perso pour toi. Tous les ${palierDe('commu')} subs de la saison, un Booster Commu pour ceux que le sort désigne ; tous les ${palierDe('folie')}, un Booster Folie. Ta dernière game de la saison : le Booster Finisseur.`,
              detail: <CeQuiCompte />,
              icone: <GlaceSachet className="h-full w-full" />,
            },
            {
              titre: 'La streameuse l’ouvre',
              texte:
                'À l’antenne, devant tout le monde. Le serveur tire une carte, une seule, avant que le rail ne tourne. Tes flocons poussent les raretés vers le haut quand le booster est pour toi, jusqu’à ×4.',
              icone: <GlaceCartes className="h-full w-full" />,
            },
            {
              titre: 'La carte se joue',
              texte:
                'Le plus souvent sur ta prochaine game : elle s’y applique, puis disparaît. Certaines relèvent une game déjà jouée, ou donnent tout de suite des flocons, une game de plus, une immunité. Jamais plus de 25 points sur une game.',
              icone: <GlaceEpees className="h-full w-full" />,
            },
          ].map((etape: { titre: string; texte: string; detail?: React.ReactNode; icone: React.ReactNode }, i) => (
            <li key={etape.titre} className="etape-case">
              <div className="etape-carte glass glass-soft">
                <span className="etape-icone" aria-hidden="true">
                  {etape.icone}
                </span>
                <div className="min-w-0">
                  <span className="etape-numero">Étape {i + 1}</span>
                  <span className="etape-titre">{etape.titre}</span>
                  <span className="etape-texte">{etape.texte}</span>
                  {etape.detail}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------ La scène ---------------------------- */}
      <div className="glass glass-reflet glass-vitre relative overflow-hidden xl:self-stretch">
        <SnowCap radius="var(--r-lg)" seed="packs" />
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 42%, ${pack.gradient[0]}33 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        {/* La scène garde sa hauteur. Le repos — titre, rangée, réglages — reste
            toujours en place : invisible pendant le tirage et la révélation,
            qui se posent par-dessus dans la même case. Changer de booster,
            choisir un joueur ou ouvrir ne fait donc rien bouger autour, ni la
            scène ni la colonne des taux, qui suit sa hauteur. */}
        <div className="scene-boosters relative grid min-h-[400px] grid-cols-[minmax(0,1fr)] px-4 py-10 sm:min-h-[460px] xl:h-full">
          <div
            className={`col-start-1 row-start-1 flex flex-col items-center justify-center gap-6 ${
              surScene ? 'invisible' : ''
            }`}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <TitreGlace taille="page" niveau={2} align="center" givre={false}>
                {pack.name}
              </TitreGlace>
            </div>

            <RangeePacks packs={packs} selection={pack.id} onSelection={choisir} fige={busy || surScene !== null} />

            {moderateur ? (
              <div className="flex w-full max-w-md flex-col items-center gap-3 4xl:max-w-xl">
                {/* Le choix garde sa place pour les boosters collectifs, où il n'y
                    a personne à choisir : sans lui, la scène raccourcissait. */}
                {aLaMain && (
                  <ChoixJoueurBooster
                    candidats={candidats}
                    choisi={choisi}
                    onChoix={setJoueurId}
                    fige={busy || !pourUnJoueur}
                    nomBooster={pack.name}
                    cache={!pourUnJoueur}
                  />
                )}
                {/* La ligne du multiplicateur, réservée sur deux lignes : un long
                    pseudo la fait passer à la ligne. */}
                {aLaMain && (
                  <div className="grid min-h-[2.75rem] w-full place-items-center text-center text-[14px] leading-snug text-ink-2">
                    {pourUnJoueur && joueur && (
                      <p>
                        Multiplicateur de chance de <strong className="text-ink">{joueur.pseudo}</strong> :{' '}
                        <strong className="num text-aurora">{libelleMultiplicateur(joueur.chance)}</strong>{' '}
                        <span className="text-faint">
                          · ❄ {flakes(joueur.snowflakes)} sur {flakes(ECONOMY.soldeMax)}
                        </span>
                      </p>
                    )}
                  </div>
                )}
                {aLaMain && (
                  <button
                    className={`btn btn-ice ${busy ? 'btn-lg min-h-[62px]' : 'btn-ouvrir'}`}
                    disabled={busy || restants === 0}
                    onClick={() => ouvre({ packId: pack.id, ...(pourUnJoueur ? { joueurId: choisi } : {}) })}
                  >
                    <span>
                      {busy
                        ? 'Ouverture…'
                        : pourUnJoueur && !choisi
                          ? dus.length === 0
                            ? 'Aucun à ouvrir'
                            : 'Choisis un joueur'
                          : restants === 0
                            ? pourUnJoueur
                              ? 'Aucun à ouvrir'
                              : 'Palier pas atteint'
                            : pourUnJoueur && joueur
                              ? `Ouvrir pour ${joueur.pseudo}`
                              : 'Ouvrir'}
                    </span>
                    {!busy && (
                      <span className="btn-ouvrir-prix">
                        {pourUnJoueur && !choisi
                          ? `${dus.length} à ouvrir`
                          : restants > 0
                            ? `${restants} restant${restants > 1 ? 's' : ''}`
                            : prochainPalier !== null
                              ? `à ${prochainPalier} subs`
                              : '0 restant'}
                      </span>
                    )}
                  </button>
                )}

                {!aLaMain && dus.length === 0 && (
                  <p className="text-center text-[14px] text-muted">Rien dans la file pour ce booster.</p>
                )}
              </div>
            ) : (
              <div className="grid min-h-[3.25rem] max-w-md place-items-center text-center text-[14px] leading-relaxed text-muted">
                <p>
                  Les boosters s’ouvrent à l’antenne, par la streameuse.
                  {dus.length > 0 && (
                    <>
                      {' '}
                      <strong className="text-aurora">
                        {dus.length} {pack.name}
                        {dus.length > 1 ? 's' : ''}
                      </strong>{' '}
                      en attente d’ouverture.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Le tirage, d'un bord à l'autre de la scène : il déborde de la marge
              de la grille, et le verre de la scène lui sert de fond. */}
          {surScene === 'tirage' && gagnante && (
            <div className="rail-dans-scene col-start-1 row-start-1 -mx-4 self-center">
              <p className="mb-5 px-4 text-center font-display text-[15px] tracking-[0.12em] text-faint uppercase">
                {packOuvert.name}
                {ouverture?.pseudo ? ` — pour ${ouverture.pseudo}` : ` — pour ${packOuvert.pourQui}`}
                {ouverture && ouverture.joueurId && (
                  <span className="num ml-3 text-aurora normal-case tracking-normal">
                    chance {libelleMultiplicateur(ouverture.chance)}
                  </span>
                )}
              </p>
              <RailPack
                key={ouverture?.id}
                pool={packOuvert.cartes}
                poids={packOuvert.weights}
                gagnante={gagnante}
                duree={COURBE_MESUREE.duree}
                onFini={() => setPhase(tirage ? 'joueurs' : 'reveal')}
              />
            </div>
          )}

          {/* Le second tirage : sur qui tombe la carte, quand elle tombe sur des
              joueurs tirés au sort — un rail par joueur, l'un après l'autre. */}
          {surScene === 'joueurs' && tirage && ouverture && (
            <div className="rail-dans-scene col-start-1 row-start-1 -mx-4 self-center">
              <div className="mb-5 flex flex-col items-center gap-1.5 px-4 text-center">
                <span
                  className="font-display text-[17px] font-black tracking-[0.08em] uppercase xl:text-[19px]"
                  style={{ color: rarityMeta(ouverture.rarity).color }}
                >
                  {ouverture.nom}
                </span>
                <span className="font-display text-[26px] leading-none font-black tracking-wide text-ink uppercase xl:text-[32px]">
                  {tirage.gagnants.length > 1
                    ? rangJoueur === 0
                      ? 'Premier joueur'
                      : 'Second joueur'
                    : 'Sur qui tombe-t-elle ?'}
                </span>
              </div>
              <RailJoueurs
                key={rangJoueur}
                joueurs={tirage.joueurs}
                gagnant={tirage.gagnants[rangJoueur]}
                onFini={() =>
                  rangJoueur + 1 < tirage.gagnants.length ? setRangJoueur(rangJoueur + 1) : setPhase('reveal')
                }
              />
            </div>
          )}

          {/* La carte posée : elle en grand, sa fumée derrière elle — la même que
              derrière les boosters, à la couleur de sa rareté —, et à côté, en
              grand aussi, ce qu'elle est et où elle est tombée. Sur un
              téléphone, tout s'empile au centre. Les tailles se règlent sur la
              largeur de la scène, pas sur celle de l'écran. */}
          {surScene === 'reveal' && ouverture && (
            <div
              className="revelation col-start-1 row-start-1 w-full self-center"
              data-rarete={ouverture.rarity}
              style={{ ['--rarete' as string]: rarityMeta(ouverture.rarity).color }}
            >
              <div className="revelation-carte">
                <div className="reveal-fumee" aria-hidden="true">
                  <span className="fumee-nappe fumee-nappe-1" />
                  <span className="fumee-nappe fumee-nappe-2" />
                  <span className="fumee-nappe fumee-nappe-3" />
                </div>
                <div className="reveal relative">
                  <CardTile
                    cardId={ouverture.cardId}
                    name={ouverture.nom}
                    description={ouverture.description}
                    rarity={ouverture.rarity}
                    glyph={ouverture.glyph}
                    nature={ouverture.nature}
                  />
                </div>
              </div>

              <div className="revelation-texte">
                <p className="revelation-booster">{packOuvert.name}</p>
                <p className="revelation-rarete">
                  <EmblemeRarete rarity={ouverture.rarity} className="revelation-embleme" />
                  {ouverture.rarity === 'L' ? '★ Légendaire ★' : rarityMeta(ouverture.rarity).label}
                </p>
                <h3 className="revelation-nom">{ouverture.nom}</h3>
                {ouverture.action && <p className="revelation-action">{ouverture.action}</p>}
                <p className="revelation-description">{ouverture.description}</p>
                <div className="revelation-destin">
                  <DestinCarte o={ouverture} />
                </div>
                {ouverture.joueurId && (
                  <p className="revelation-chance num">
                    Tirée avec une chance de {libelleMultiplicateur(ouverture.chance)}
                  </p>
                )}
                <button className="btn btn-ice revelation-suite" onClick={reset}>
                  Ouvrir un autre booster
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------ La colonne du pack ---------------------- */}
      <aside className="grid gap-4 sm:grid-cols-2 xl:flex xl:flex-col xl:self-stretch">
        {/* 1. Le pack choisi. */}
        <section className="glass @container relative overflow-hidden">
          {(() => {
            const art = packArt(pack.id);
            return art ? (
              <div className="relative h-48 overflow-hidden [mask-image:linear-gradient(180deg,#000_45%,transparent_100%)] @md:h-56">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={art}
                  alt=""
                  className="absolute inset-0 h-full w-full scale-[1.8] object-cover object-[50%_40%] opacity-90 blur-[22px] saturate-[1.3]"
                  draggable={false}
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, rgb(6 14 28 / 0.72) 0%, rgb(6 14 28 / 0.25) 45%, transparent 70%), linear-gradient(180deg, rgb(6 14 28 / 0.15) 0%, transparent 35%, rgb(6 14 28 / 0.55) 100%)',
                  }}
                  aria-hidden="true"
                />
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
            <TitreGlace taille="bloc">{pack.name}</TitreGlace>
            <p className="mt-1 text-[16px] text-ink-2">{pack.tagline}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[16px]">
              <div>
                <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">Contenu</dt>
                <dd className="mt-0.5 font-display text-[22px] leading-none font-black text-ink">
                  1 carte
                </dd>
              </div>
              {/* Deux lignes réservées pour « Pour qui » et le déclencheur : d'un
                  booster à l'autre, le bloc garde sa hauteur, et les taux dessous
                  la leur. */}
              <div>
                <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">Pour qui</dt>
                <dd className="mt-0.5 min-h-[2.4em] font-display text-[20px] leading-[1.2] font-black text-ink">
                  {pack.pourQui}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">Déclencheur</dt>
                <dd className="mt-1 min-h-[3em] text-[16px] leading-normal text-ink">{pack.declencheur}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* 2. Les taux, une ligne par rareté. */}
        <section className="glass relative overflow-hidden xl:flex xl:flex-1 xl:flex-col">
          <SnowCap radius="var(--r-lg)" seed="boosters-taux" epaisseur={14} />
          <div className="relative border-b border-white/10 px-4 pt-6 pb-3">
            <TitreGlace taille="bloc" eyebrow={pack.name}>
              Taux de rareté
            </TitreGlace>
          </div>
          {/* Une tuile par rareté : l'emblème, le rang en losanges, le taux, la
              jauge en longueur vraie — la légendaire n'y est qu'un éclat — et
              les chances en clair. */}
          <ul className="taux-liste">
            {RARITY_LADDER.map((rarity, rang) => {
              const meta = rarityMeta(rarity);
              const per = rarityPercent(pack.weights, rarity);
              return (
                <li
                  key={rarity}
                  className="taux-ligne"
                  data-vide={per === 0 ? '' : undefined}
                  style={{ ['--rarete' as string]: meta.color }}
                >
                  <EmblemeRarete rarity={rarity} className="taux-embleme" />
                  <div className="taux-corps">
                    <div className="taux-tete">
                      <span className="taux-nom">{meta.label}</span>
                      <span className="taux-rang" aria-hidden="true">
                        {RARITY_LADDER.map((r, i) => (
                          <i key={r} data-on={i <= rang ? '' : undefined} />
                        ))}
                      </span>
                      <span className="taux-pct num">{pourcent(per)}</span>
                    </div>
                    <div className="taux-pied">
                      <span className="taux-jauge" aria-hidden="true">
                        {per > 0 && <span style={{ width: `${per}%` }} />}
                      </span>
                      <span className="taux-chance">{chances(per)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>

      {/* ------------------------- Les cartes de la saison ------------------
          Toutes les cartes du jeu, rangées par rareté : ce qu'on peut tirer,
          quel que soit le booster. Elle ne suit plus la sélection de la
          rangée — on cherche ce que fait une légendaire, pas ce que contient
          un booster. */}
      <section className="glass relative overflow-hidden px-5 py-6 sm:px-6 xl:col-span-2">
        <SnowCap radius="var(--r-lg)" seed="cartes-saison" epaisseur={14} />
        <TitreGlace taille="bloc" eyebrow="Par rareté" className="mb-3">
          Les cartes de la saison
        </TitreGlace>
        <CartesParRarete cartes={saison} />
      </section>
    </div>
  );
}
