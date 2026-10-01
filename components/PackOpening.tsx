'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RangeePacks } from '@/components/RangeePacks';
import { SnowCap } from '@/components/SnowCap';
import { prechargeSons, reveilleSon } from '@/components/bruitage';
import { RailPack, type CarteRailPack } from '@/components/RailPack';
import { CartesParRarete, type CarteSaison } from '@/components/CartesParRarete';
import { DestinCarte } from '@/components/DestinCarte';
import { CardTile, Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { packArt } from '@/lib/domain/catalog';
import { ECONOMY, libelleMultiplicateur, rarityPercent, SUB_MILESTONES } from '@/lib/domain/rules';
import type { PackDefinition, PackId, Rarity } from '@/lib/domain/types';
import type { OuvertureVue, PackDuVue } from '@/lib/services/packs';
import { COURBE_MESUREE } from '@/lib/spin/courbe';
import { TitreGlace } from '@/components/TitreGlace';
import { GlaceCartes, GlaceEpees, GlaceSachet } from '@/components/DessinsGlace';

const RARITY_LADDER: Rarity[] = ['C', 'R', 'UR', 'L'];

/**
 * Les taux, du blanc de la commune au vert des évènements pour la
 * légendaire, en passant par le bleu ciel : une seule échelle de froid, qui
 * monte avec la rareté.
 */
const COULEURS_TAUX: Record<Rarity, string> = {
  C: '#ffffff',
  R: '#bfe6ff',
  UR: '#7cefe2',
  L: '#63eec4',
};

export interface PackVitrine extends PackDefinition {
  /** Les cartes que ce pack peut donner : le pool des leurres du rail. */
  cartes: CarteRailPack[];
}

export interface JoueurOuverture {
  id: string;
  pseudo: string;
  snowflakes: number;
  chance: number;
}

/**
 * Les trois états de l'écran : le choix, le rail qui tourne, la carte posée.
 *
 * Reste `tirage`, où le rail met en scène un résultat **déjà acquis** : le
 * serveur a tiré avant que la première tuile n'existe.
 */
type Phase = 'repos' | 'demande' | 'tirage' | 'reveal';

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
  const [selected, setSelected] = useState<PackId>(packs[0]?.id ?? 'perso');
  const [joueurId, setJoueurId] = useState('');
  const [phase, setPhase] = useState<Phase>('repos');
  const [error, setError] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<OuvertureVue | null>(null);

  useEffect(() => {
    if (moderateur) void prechargeSons();
  }, [moderateur]);

  const pack = useMemo(() => packs.find((p) => p.id === selected) ?? packs[0], [packs, selected]);
  const busy = phase === 'demande' || phase === 'tirage';
  const pourUnJoueur = pack?.portee === 'JOUEUR';
  const joueur = joueurs.find((j) => j.id === joueurId);

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

  /** Les joueurs, ceux qui ont un booster à ouvrir en tête. */
  const joueursTries = useMemo(
    () => [...joueurs].sort((a, b) => (dusParJoueur.get(b.id) ?? 0) - (dusParJoueur.get(a.id) ?? 0)),
    [joueurs, dusParJoueur],
  );

  /**
   * Ce que le bouton peut ouvrir : les boosters dus à ce joueur, ou, pour un
   * booster collectif, ceux que les paliers ont mis en file. Le serveur ne
   * laisse rien ouvrir d'autre.
   */
  const restants = pack?.portee === 'JOUEUR' ? (joueurId ? (dusParJoueur.get(joueurId) ?? 0) : 0) : dus.length;

  /** Le prochain palier d'un booster collectif : à combien de subs, et combien il en manque. */
  const palier = SUB_MILESTONES.find((m) => m.kind === 'PACK' && m.packId === pack?.id);
  const prochainPalier = palier ? (Math.floor(totalSubs / palier.every) + 1) * palier.every : null;

  /**
   * Ce qui reste à ouvrir, d'un coup d'œil : le total, puis chaque booster avec
   * son nombre et, pour ceux qui vont à quelqu'un, le détail par joueur.
   */
  const aOuvrir = useMemo(
    () =>
      packs.map((p) => {
        const siens = file.filter((d) => d.packId === p.id);
        const parJoueur = new Map<string, number>();
        for (const d of siens) if (d.pseudo) parJoueur.set(d.pseudo, (parJoueur.get(d.pseudo) ?? 0) + 1);
        return { id: p.id, nom: p.name, n: siens.length, parJoueur: [...parJoueur] };
      }),
    [packs, file],
  );

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
      setOuverture(payload.data as OuvertureVue);
      setPhase('tirage');
    } catch {
      setError('Le serveur n’a pas répondu. Réessaie dans un instant.');
      setPhase('repos');
    }
  }

  function reset() {
    setPhase('repos');
    setOuverture(null);
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

  return (
    <div className="space-y-6 xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-6 xl:space-y-0">
      {error && (
        <div className="xl:col-span-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}

      {/* Comment ça marche, en tête et en travers. */}
      <section className="glass relative overflow-hidden px-6 py-6 xl:col-span-2">
        <SnowCap radius="var(--r-lg)" seed="boosters-etapes" epaisseur={16} />
        <TitreGlace taille="bloc" eyebrow="En trois étapes" className="relative mb-5">
          Comment ça marche
        </TitreGlace>
        <ol className="etapes-cartes">
          {[
            {
              titre: 'Un booster t’est dû',
              texte:
                'Cinq subs offerts, c’est un Booster Perso pour toi. Cinquante subs de la saison, c’est un Booster Commu pour ceux que le sort désigne. Ta dernière game de la saison, c’est le Booster Finisseur.',
              icone: <GlaceSachet className="h-16 w-16" />,
            },
            {
              titre: 'La streameuse l’ouvre',
              texte:
                'À l’antenne, devant tout le monde. Le serveur tire une carte, une seule, avant que le rail ne tourne. Tes flocons poussent les raretés vers le haut quand le booster est pour toi, jusqu’à ×1,5.',
              icone: <GlaceCartes className="h-16 w-16" />,
            },
            {
              titre: 'La carte se joue',
              texte:
                'Le plus souvent sur ta prochaine game : elle s’y applique, puis disparaît. Certaines relèvent une game déjà jouée, ou donnent tout de suite des flocons, une game de plus, une immunité. Jamais plus de 25 points sur une game.',
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

      {/* ------------------------------ La scène ---------------------------- */}
      <div className="glass glass-reflet glass-vitre relative overflow-hidden">
        <SnowCap radius="var(--r-lg)" seed="packs" />
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 42%, ${pack.gradient[0]}33 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        <div className="relative flex min-h-[400px] flex-col items-center justify-center gap-6 px-4 py-10 sm:min-h-[460px]">
          {phase === 'tirage' && gagnante ? (
            <div className="w-full">
              <p className="mb-4 text-center font-display text-[13px] tracking-[0.12em] text-faint uppercase">
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
                onFini={() => setPhase('reveal')}
              />
            </div>
          ) : phase !== 'reveal' ? (
            <>
              <div className="flex flex-col items-center gap-2 text-center">
                <TitreGlace taille="page" niveau={2} align="center" givre={false}>
                  {pack.name}
                </TitreGlace>
              </div>

              {moderateur && (
                <section className="a-ouvrir" aria-label="Boosters à ouvrir">
                  <p className="a-ouvrir-total">
                    À ouvrir : <strong className="num">{file.length}</strong>
                  </p>
                  <ul className="a-ouvrir-liste">
                    {aOuvrir.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className="a-ouvrir-type"
                          data-vide={t.n === 0 ? '' : undefined}
                          aria-pressed={pack.id === t.id}
                          disabled={busy}
                          onClick={() => choisir(t.id)}
                        >
                          <span>{t.nom}</span>
                          <strong className="num">{t.n}</strong>
                        </button>
                        {t.parJoueur.length > 0 && (
                          <p className="a-ouvrir-joueurs">
                            {t.parJoueur.map(([pseudo, n]) => (n > 1 ? `${pseudo} ×${n}` : pseudo)).join(' · ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <RangeePacks packs={packs} selection={pack.id} onSelection={choisir} fige={busy} />

              {moderateur ? (
                <div className="flex w-full max-w-md flex-col items-center gap-3">
                  {aLaMain && pourUnJoueur && (
                    <select
                      className="field w-full"
                      value={joueurId}
                      onChange={(e) => setJoueurId(e.target.value)}
                      disabled={busy}
                      aria-label="Joueur pour qui le pack s’ouvre"
                    >
                      <option value="">— Pour quel joueur ? —</option>
                      {joueursTries.map((j) => {
                        const n = dusParJoueur.get(j.id) ?? 0;
                        return (
                          <option key={j.id} value={j.id} disabled={n === 0}>
                            {j.pseudo} — {n === 0 ? 'aucun à ouvrir' : `${n} à ouvrir`} · {libelleMultiplicateur(j.chance)}
                          </option>
                        );
                      })}
                    </select>
                  )}
                  {aLaMain && pourUnJoueur && joueur && (
                    <p className="text-center text-[14px] text-ink-2">
                      Multiplicateur de chance de <strong className="text-ink">{joueur.pseudo}</strong> :{' '}
                      <strong className="num text-aurora">{libelleMultiplicateur(joueur.chance)}</strong>{' '}
                      <span className="text-faint">
                        · ❄ {flakes(joueur.snowflakes)} sur {flakes(ECONOMY.soldeMax)}
                      </span>
                    </p>
                  )}
                  {aLaMain && (
                    <button
                      className={`btn btn-ice ${busy ? 'btn-lg' : 'btn-ouvrir'}`}
                      disabled={busy || restants === 0}
                      onClick={() =>
                        ouvre({ packId: pack.id, ...(pourUnJoueur ? { joueurId } : {}) })
                      }
                    >
                      <span>
                        {busy
                          ? 'Ouverture…'
                          : pourUnJoueur && !joueurId
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
                          {pourUnJoueur && !joueurId
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

                  {dus.length > 0 && (
                    <div className="w-full">
                      <p className="mb-1.5 text-center text-[13px] tracking-[0.12em] text-faint uppercase">
                        Dus — {dus.length}
                      </p>
                      <ul className="space-y-1.5">
                        {dus.map((d) => (
                          <li
                            key={d.id}
                            className="flex items-center gap-3 rounded-full bg-black/22 py-1.5 pr-1.5 pl-4 text-[14px]"
                          >
                            <span className="min-w-0 flex-1 truncate text-ink-2">
                              {d.pseudo ? (
                                <>
                                  pour <strong className="text-aurora">{d.pseudo}</strong>
                                </>
                              ) : (
                                `pour ${pack.pourQui}`
                              )}{' '}
                              <span className="text-faint">· {d.raison}</span>
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm btn-ice"
                              disabled={busy}
                              onClick={() => ouvre({ packDuId: d.id })}
                            >
                              Ouvrir
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="max-w-md text-center text-[14px] leading-relaxed text-muted">
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
              )}
            </>
          ) : ouverture ? (
            <div className="w-full">
              <div className="mb-5 flex flex-wrap items-center justify-center gap-3 text-center">
                <span
                  className="font-display text-xl font-black tracking-wide uppercase"
                  style={{ color: rarityMeta(ouverture.rarity).color }}
                >
                  {ouverture.rarity === 'L'
                    ? '★ Légendaire ★'
                    : ouverture.rarity === 'UR'
                      ? 'Ultra rare !'
                      : ouverture.rarity === 'R'
                          ? 'Une rare'
                          : 'Ouvert'}
                </span>
              </div>

              <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center">
                <div className="reveal relative w-[220px] shrink-0">
                  {rarityMeta(ouverture.rarity).holo && (
                    <span
                      className="reveal-halo"
                      style={{ ['--r' as string]: rarityMeta(ouverture.rarity).color }}
                      aria-hidden="true"
                    />
                  )}
                  <CardTile
                    cardId={ouverture.cardId}
                    name={ouverture.nom}
                    description={ouverture.description}
                    rarity={ouverture.rarity}
                    glyph={ouverture.glyph}
                    power={ouverture.power}
                    nature={ouverture.nature}
                  />
                </div>
                <div className="max-w-sm text-center sm:text-left">
                  <RarityChip rarity={ouverture.rarity} />
                  <h3
                    className="mt-2 font-display text-[28px] leading-none font-black"
                    style={{ color: rarityMeta(ouverture.rarity).color }}
                  >
                    {ouverture.nom}
                  </h3>
                  {ouverture.action && (
                    <p className="mt-2 font-display text-[15px] font-bold tracking-wide text-ink uppercase">
                      {ouverture.action}
                    </p>
                  )}
                  <p className="mt-1.5 text-[15px] text-ink-2">{ouverture.description}</p>
                  {ouverture.joueurId && (
                    <p className="num mt-1 text-[13px] text-faint">
                      tirée avec un multiplicateur de {libelleMultiplicateur(ouverture.chance)}
                    </p>
                  )}
                  <div className="mt-3">
                    <DestinCarte o={ouverture} />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <button className="btn btn-ice" onClick={reset}>
                  Ouvrir un autre booster
                </button>
              </div>
            </div>
          ) : null}
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
              <div>
                <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">Pour qui</dt>
                <dd className="mt-0.5 font-display text-[20px] leading-none font-black text-ink">
                  {pack.pourQui}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[13px] tracking-[0.12em] text-faint uppercase">Déclencheur</dt>
                <dd className="mt-1 text-[16px] text-ink">{pack.declencheur}</dd>
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
          <ul className="divide-y divide-white/10 xl:flex xl:flex-1 xl:flex-col xl:justify-around">
            {RARITY_LADDER.map((rarity) => {
              const meta = rarityMeta(rarity);
              const per = rarityPercent(pack.weights, rarity);
              const fmt = (v: number) => (v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(1));
              return (
                <li key={rarity} className="flex items-center gap-3 px-4 py-2.5">
                  <RarityChip rarity={rarity} taille={26} />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{meta.label}</span>
                  <span
                    className="num shrink-0 font-display text-[24px] leading-none font-black"
                    style={{ color: per > 0 ? COULEURS_TAUX[rarity] : 'var(--faint)' }}
                  >
                    {fmt(per)} %
                  </span>
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
