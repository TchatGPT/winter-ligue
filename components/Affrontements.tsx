'use client';

/**
 * Le salon des affrontements.
 *
 * Quatre choses sur un même écran : de quoi en monter un, ceux qui cherchent un
 * adversaire, les plus gros de la semaine, et les derniers joués. La cinquième —
 * l'arène — recouvre tout dès qu'un affrontement se joue, parce qu'à ce
 * moment-là il n'y a plus rien d'autre à regarder.
 *
 * ## Le sondage plutôt que le temps réel
 *
 * Le projet n'a pas de canal permanent, et n'en a pas besoin ici. Un
 * affrontement se rejoint en un clic ; deux secondes de retard sur l'affichage
 * n'ont jamais fait rater personne, et un WebSocket ouvert en permanence pour
 * une poignée de joueurs coûterait plus qu'il ne rapporte. Le sondage s'arrête
 * d'ailleurs pendant qu'un affrontement se joue, où il ne servirait à rien.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BatailleArene,
  type BatailleVueClient,
  type CatalogueCarte,
} from '@/components/BatailleArene';
import { RangeeBoosters } from '@/components/RangeeBoosters';
import { NAV_ICONS } from '@/components/icons';
import { boosterArt } from '@/lib/domain/catalog';
import { reveilleSon } from '@/components/bruitage';
import { CardFrame } from '@/components/CardFrame';
import { EmptyState, Notice, RarityChip, flakes, rarityMeta } from '@/components/ui';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { BoosterDefinition, Rarity } from '@/lib/domain/types';
import { SnowCap } from '@/components/SnowCap';

/** Le rythme du sondage, quand personne ne joue. */
const SONDAGE = 2000;

interface Charge {
  batailles: BatailleVueClient[];
  top: BatailleVueClient[];
  boosters: BoosterDefinition[];
  shopOpen: boolean;
  balance: number | null;
  bornes: { min: number; max: number };
  moiId: string | null;
}

/* -------------------------------------------------------------------------- */

/* ============================ Les briques ================================= */

/**
 * La vignette d'un sachet.
 *
 * Le sachet en trois dimensions est superbe et coûte cher : cinq par ligne sur
 * vingt lignes feraient cent scènes à composer pour un salon qu'on parcourt du
 * pouce. Un carré à son dégradé et son glyphe suffit à le reconnaître — c'est le
 * même code couleur que la rangée de création.
 */
function Vignette({
  sachet,
  boosters,
  taille = 60,
}: {
  sachet: { id: string; nom: string };
  boosters: BoosterDefinition[];
  taille?: number;
}) {
  const def = boosters.find((b) => b.id === sachet.id);
  const art = boosterArt(sachet.id);
  return (
    <span
      className="duel-sachet"
      style={{
        width: taille,
        height: taille,
        ['--haut' as string]: def?.gradient[0] ?? '#22314a',
        ['--bas' as string]: def?.gradient[1] ?? '#101a2c',
      }}
      title={sachet.nom}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" style={{ fontSize: taille * 0.4 }}>
          {def?.glyph ?? '❄'}
        </span>
      )}
    </span>
  );
}

/** Le pot : les deux mises réunies. C'est ce qui change de mains. */
const pot = (b: BatailleVueClient) => b.mise * 2;

/**
 * Les plus belles cartes tombées dans l'affrontement.
 *
 * C'est ce qu'on vient regarder, et c'était absent : une ligne annonçait
 * « 30 000 ❄ » sans jamais montrer ce que ces trente mille avaient donné. Un
 * classement des plus gros affrontements de la semaine qui ne montre pas les
 * cartes n'est qu'un tableau de comptabilité.
 *
 * Les plus hautes raretés d'abord, doublons écartés — voir trois fois la même
 * légendaire remplit la ligne sans rien apprendre.
 */
function meilleuresCartes(
  b: BatailleVueClient,
  catalog: Record<string, CatalogueCarte>,
  combien: number,
): { cardId: string; carte: CatalogueCarte }[] {
  const vues = new Set<string>();
  return b.camps
    .flatMap((c) => c.cartes)
    .map((c) => ({ cardId: c.cardId, carte: catalog[c.cardId] }))
    .filter((c): c is { cardId: string; carte: CatalogueCarte } => Boolean(c.carte))
    .sort(
      (x, y) =>
        (RARITY_ORDER[y.carte.rarity as Rarity] ?? 0) -
        (RARITY_ORDER[x.carte.rarity as Rarity] ?? 0),
    )
    .filter((c) => {
      if (vues.has(c.cardId)) return false;
      vues.add(c.cardId);
      return true;
    })
    .slice(0, combien);
}

/** Une pastille d'état : ce que la ligne raconte avant même qu'on la lise. */
function Etat({ enAttente }: { enAttente: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 font-display text-[11px] font-black tracking-[0.14em] uppercase"
      style={{
        background: enAttente ? 'rgb(255 217 125 / 0.16)' : 'rgb(99 238 196 / 0.14)',
        color: enAttente ? 'var(--gold)' : 'var(--aurora)',
        boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.08)',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: 'currentColor',
          boxShadow: '0 0 8px currentColor',
        }}
        aria-hidden="true"
      />
      {enAttente ? 'En attente' : 'Terminé'}
    </span>
  );
}

/**
 * Une ligne d'affrontement, en trois bandes.
 *
 * ## Pourquoi elle a été refaite, deux fois
 *
 * D'abord une barre de quarante pixels : deux pseudos, un chiffre, des
 * pastilles grosses comme des confettis. Rien n'avait de poids, et rien ne
 * montrait ce qui s'était passé.
 *
 * Puis trois colonnes — qui joue, ce qui est en jeu, ce qu'il y a à gagner. La
 * structure était juste mais la répartition fausse : tout se tassait à gauche
 * dans une colonne trop étroite pendant qu'un panneau presque vide occupait le
 * quart droit de chaque ligne.
 *
 * Trois **bandes** horizontales, donc, qui occupent toute la largeur :
 *
 *  1. les sachets en jeu, et le pot à l'autre bout — ce qu'on met, ce qu'on
 *     gagne, sur la même ligne des yeux ;
 *  2. l'affrontement lui-même : les deux camps face à face, leurs scores de
 *     part et d'autre du VS, et le bouton qui engage ;
 *  3. les cartes sorties, une fois la partie jouée.
 *
 * C'est la lecture d'une affiche de match, et c'est ce que la liste raconte.
 */
function Ligne({
  affrontement,
  boosters,
  catalog,
  moiId,
  rang,
  action,
  onRelire,
}: {
  affrontement: BatailleVueClient;
  boosters: BoosterDefinition[];
  catalog: Record<string, CatalogueCarte>;
  moiId: string | null;
  /** Le rang dans le classement de la semaine, s'il y en a un. */
  rang?: number;
  action?: React.ReactNode;
  onRelire?: () => void;
}) {
  const b = affrontement;
  const hote = b.camps[0];
  const adverse = b.camps[1];
  const fini = b.statut === 'TERMINEE';
  const cartes = fini ? meilleuresCartes(b, catalog, 6) : [];
  const eclat = fini
    ? cartes[0]
      ? rarityMeta(cartes[0].carte.rarity).color
      : 'var(--ice)'
    : 'var(--gold)';

  /** Un camp, avec son score du côté du centre. */
  const camp = (c: (typeof b.camps)[number] | undefined, cote: 'gauche' | 'droite') => {
    const gagne = fini && c && b.vainqueurId === c.id;
    const nom = (
      <span className="flex min-w-0 items-center gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[13px] font-black"
          style={{
            background: gagne
              ? 'linear-gradient(150deg, rgb(99 238 196 / 0.45), rgb(99 238 196 / 0.12))'
              : 'rgb(255 255 255 / 0.07)',
            boxShadow: gagne
              ? 'inset 0 0 0 1px rgb(99 238 196 / 0.5), 0 0 14px rgb(99 238 196 / 0.28)'
              : 'inset 0 0 0 1px rgb(255 255 255 / 0.12)',
            color: gagne ? 'var(--aurora)' : 'var(--muted)',
          }}
          aria-hidden="true"
        >
          {c ? (c.bot ? '🤖' : (c.pseudo[0] ?? '?').toUpperCase()) : '?'}
        </span>
        <span
          className={`min-w-0 truncate font-display text-[15px] font-bold ${
            gagne ? 'text-aurora' : fini ? 'text-muted' : 'text-ink'
          }`}
        >
          {c?.pseudo ?? <span className="font-normal text-faint">place libre</span>}
          {moiId && c?.id === moiId && <span className="ml-1.5 text-[11px] text-muted">(toi)</span>}
        </span>
      </span>
    );
    const score = fini ? (
      <span
        className={`shrink-0 font-display text-2xl leading-none font-black tabular-nums ${
          gagne ? 'text-aurora' : 'text-faint'
        }`}
      >
        {c?.score ?? 0}
      </span>
    ) : null;

    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-3 ${
          cote === 'droite' ? 'flex-row-reverse' : ''
        }`}
      >
        {nom}
        {score}
      </div>
    );
  };

  const corps = (
    <>
      <span className="duel-nappe" style={{ ['--eclat' as string]: eclat }} aria-hidden="true" />

      <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-5">
        {/* ---- Bande 1 : ce qu'on met, et ce qu'on gagne ------------------ */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {rang !== undefined && (
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-black"
              style={{
                background:
                  rang === 0
                    ? 'linear-gradient(150deg, #ffe9a8, #d19a17)'
                    : rang === 1
                      ? 'linear-gradient(150deg, #e6eef7, #93a7bb)'
                      : rang === 2
                        ? 'linear-gradient(150deg, #f0c9a0, #b0763c)'
                        : 'rgb(255 255 255 / 0.07)',
                color: rang < 3 ? '#1a1305' : 'var(--muted)',
                boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.5)',
              }}
            >
              {rang + 1}
            </span>
          )}

          <span className="flex flex-wrap items-center gap-2">
            {b.sachets.map((s, i) => (
              <Vignette key={`${s.id}-${i}`} sachet={s} boosters={boosters} />
            ))}
          </span>

          <span className="hidden font-display text-[12px] font-bold tracking-wider text-faint uppercase sm:inline">
            {b.manches} sachet{b.manches > 1 ? 's' : ''} par camp
          </span>

          {/* Le pot pousse à droite : c'est le bout de la ligne des yeux. */}
          <span className="ml-auto flex items-center gap-3 text-right">
            <Etat enAttente={!fini} />
            <span>
              <span className="block font-display text-[26px] leading-none font-black tabular-nums text-ink sm:text-[30px]">
                {flakes(pot(b))} <span className="text-ice">❄</span>
              </span>
              <span className="block font-display text-[11px] font-bold tracking-[0.16em] text-faint uppercase">
                Pot total
              </span>
            </span>
          </span>
        </div>

        {/* ---- Bande 2 : l'affrontement ----------------------------------- */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-black/22 px-3 py-2.5">
          {camp(hote, 'gauche')}
          <span
            className="shrink-0 font-display text-[13px] font-black tracking-[0.2em] text-faint"
            aria-hidden="true"
          >
            VS
          </span>
          {camp(adverse, 'droite')}
          {action && <span className="flex shrink-0 gap-2">{action}</span>}
        </div>

        {/* ---- Bande 3 : ce qui en est sorti ------------------------------ */}
        {cartes.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="shrink-0 font-display text-[11px] font-bold tracking-[0.16em] text-faint uppercase">
              Sorties
            </span>
            <span className="flex flex-wrap gap-1.5">
              {cartes.map(({ cardId, carte }) => (
                <span key={cardId} className="w-[52px] shrink-0" title={carte.name}>
                  <CardFrame
                    cardId={cardId}
                    name={carte.name}
                    description={carte.description}
                    rarity={carte.rarity}
                    glyph={carte.glyph}
                    power={carte.power}
                    nature={carte.nature}
                  />
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </>
  );

  const classes = 'glass duel relative w-full overflow-hidden text-left';

  return (
    <li>
      {onRelire ? (
        <button type="button" onClick={onRelire} className={classes}>
          {corps}
        </button>
      ) : (
        <div className={classes}>{corps}</div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

export function Affrontements({
  initial,
  catalog,
}: {
  initial: Charge;
  catalog: Record<string, CatalogueCarte>;
}) {
  const [etat, setEtat] = useState<Charge>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  /** Le sachet mis en avant dans la rangée — celui qu'un clic ajoutera. */
  const [vise, setVise] = useState(initial.boosters[0]?.id ?? '');
  /**
   * Le panier, dans l'ordre où les sachets s'ouvriront.
   *
   * Une liste, et non un compteur : c'est ce qui permet de finir sur un Everest
   * après trois Givre. L'ordre est celui des manches, et il change la partie.
   */
  const [panier, setPanier] = useState<string[]>([]);

  /** Quelle liste on regarde. Une à la fois, comme sur la référence. */
  type Onglet = 'attente' | 'top' | 'miens' | 'jouees';
  const [onglet, setOnglet] = useState<Onglet>('attente');
  /** Le panneau de création, replié tant qu'on ne le demande pas. */
  const [creation, setCreation] = useState(false);

  const parametres = useSearchParams();
  const routeur = useRouter();
  const demandee = parametres.get('affrontement');

  const [arene, setArene] = useState<BatailleVueClient | null>(
    () => initial.batailles.find((b) => b.id === demandee && b.statut === 'TERMINEE') ?? null,
  );
  const [anime, setAnime] = useState(parametres.get('anime') === '1');

  const prixDe = useCallback(
    (id: string) => etat.boosters.find((b) => b.id === id)?.price ?? 0,
    [etat.boosters],
  );
  const mise = panier.reduce((n, id) => n + prixDe(id), 0);
  const solde = etat.balance;
  const abordable = solde !== null && solde >= mise;
  const plein = panier.length >= etat.bornes.max;

  const recharge = useCallback(async () => {
    try {
      const reponse = await fetch('/api/affrontements', { cache: 'no-store' });
      const charge = await reponse.json();
      if (charge.ok) setEtat(charge.data);
    } catch {
      // Un sondage qui échoue ne mérite pas de message : le suivant passera.
    }
  }, []);

  const areneOuverte = arene !== null;
  useEffect(() => {
    if (areneOuverte) return;
    const t = setInterval(recharge, SONDAGE);
    return () => clearInterval(t);
  }, [areneOuverte, recharge]);

  const enCours = useRef(false);

  async function agit(url: string, corps: unknown, animer: boolean) {
    if (enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    setErreur(null);

    // Le contexte audio se réveille ici, avant le premier `await` : un contexte
    // ouvert hors d'un geste naît suspendu, et tout ce qu'on lui programme part
    // d'un bloc au réveil.
    if (animer) reveilleSon();

    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.message ?? 'Action impossible.');
        return;
      }
      const vue = charge.data as BatailleVueClient;
      if (vue.statut === 'TERMINEE') {
        setAnime(animer);
        setArene(vue);
      } else {
        // Un affrontement créé attend : le panier est parti à l'enjeu, on le vide
        // pour que le suivant reparte d'une page blanche.
        setPanier([]);
      }
      await recharge();
    } catch {
      setErreur('Le serveur n’a pas répondu. Réessaie dans un instant.');
    } finally {
      enCours.current = false;
      setOccupe(false);
    }
  }

  function ferme() {
    setArene(null);
    if (demandee) routeur.replace('/affrontements', { scroll: false });
    void recharge();
  }

  /* --------------------------------- Arène -------------------------------- */

  if (arene) {
    // Les taux de **tous** les sachets : un panier mélangé change de table à
    // chaque manche, et l'arène choisit la bonne au moment de la jouer.
    const poids = Object.fromEntries(
      etat.boosters.map((b) => [b.id, b.weights as Record<string, number>]),
    );
    return (
      <div className="space-y-4">
        <BatailleArene
          bataille={arene}
          catalog={catalog}
          poids={poids}
          moiId={etat.moiId}
          anime={anime}
        />
        <div className="flex justify-center">
          <button type="button" className="btn btn-ghost" onClick={ferme}>
            Revenir au salon
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------- Salon -------------------------------- */

  const attente = etat.batailles.filter((b) => b.statut === 'ATTENTE');
  const jouees = etat.batailles.filter((b) => b.statut === 'TERMINEE');
  const miens = etat.batailles.filter(
    (b) => etat.moiId !== null && b.camps.some((c) => c.id === etat.moiId),
  );
  const booster = etat.boosters.find((b) => b.id === vise) ?? etat.boosters[0];

  const relire = (b: BatailleVueClient) => () => {
    setAnime(false);
    setArene(b);
  };

  /** Les boutons d'une ligne en attente : rejoindre, ou disposer de la sienne. */
  const actionsDe = (b: BatailleVueClient) => {
    if (b.statut !== 'ATTENTE') return null;
    const mien = b.hoteId === etat.moiId;
    return mien ? (
      <>
        <button
          type="button"
          className="btn btn-ice btn-sm"
          disabled={occupe}
          onClick={() => agit('/api/affrontements/bot', { batailleId: b.id }, true)}
        >
          Contre le bot
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={occupe}
          onClick={() => agit('/api/affrontements/annuler', { batailleId: b.id }, false)}
        >
          Annuler
        </button>
      </>
    ) : (
      <button
        type="button"
        className="btn btn-ice btn-sm"
        disabled={occupe || etat.moiId === null || (solde !== null && solde < b.mise)}
        onClick={() => agit('/api/affrontements/rejoindre', { batailleId: b.id }, true)}
      >
        Rejoindre · {flakes(b.mise)} ❄
      </button>
    );
  };

  const listes = {
    attente: { titre: 'En attente', lignes: attente, rangs: false },
    top: { titre: 'Top de la semaine', lignes: etat.top, rangs: true },
    miens: { titre: 'Les miens', lignes: miens, rangs: false },
    jouees: { titre: 'Terminés', lignes: jouees, rangs: false },
  } as const;
  const liste = listes[onglet];

  return (
    <div className="space-y-5">
      {!etat.shopOpen && <Notice kind="error">La boutique est fermée par la modération.</Notice>}
      {etat.moiId === null && (
        <Notice>Connecte-toi pour monter un affrontement ou en rejoindre un.</Notice>
      )}
      {erreur && <Notice kind="error">{erreur}</Notice>}

      {/* ------------------------------ Les onglets -------------------------

          Quatre listes, une à la fois, plutôt que quatre sections empilées.
          Empilées, il fallait faire défiler trois écrans pour voir le top de la
          semaine, et la page n'avait pas de haut : on ne savait pas ce qu'on
          regardait. Un onglet dit où l'on est, et son compteur dit s'il y a
          quelque chose à y voir avant même d'y aller. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Les onglets défilent au doigt plutôt que de se replier : repliés,
            quatre onglets prenaient quatre lignes sur un téléphone et
            repoussaient la première ligne de la liste sous le pli. */}
        <div className="scroll-x-clean flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {(['attente', 'top', 'miens', 'jouees'] as const)
            .filter((cle) => cle !== 'miens' || etat.moiId !== null)
            .map((cle) => {
              const actif = onglet === cle;
              const n = listes[cle].lignes.length;
              return (
                <button
                  key={cle}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setOnglet(cle)}
                  className={`flex min-h-[46px] shrink-0 items-center gap-2 rounded-full px-4 font-display text-[14px] font-bold whitespace-nowrap tracking-wide transition-colors ${
                    actif ? 'nav-pilule text-ice' : 'text-muted hover:text-ink'
                  }`}
                >
                  <NAV_ICONS.swords className="h-[18px] w-[18px]" />
                  {listes[cle].titre}
                  {n > 0 && (
                    <span
                      className={`num rounded-full px-1.5 text-[11px] ${
                        actif ? 'bg-ice/25 text-frost' : 'bg-white/8 text-faint'
                      }`}
                    >
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        <button
          type="button"
          className="btn btn-ice shrink-0"
          aria-expanded={creation}
          onClick={() => setCreation((v) => !v)}
        >
          {creation ? 'Fermer' : '+ Monter un affrontement'}
        </button>
      </div>

      {/* ---------------------- Monter un affrontement ---------------------

          Repliée par défaut, et c'est un changement de fond : le panneau de
          création occupait le haut de la page en permanence, si bien qu'il
          fallait faire défiler pour voir s'il y avait un adversaire à
          affronter. On vient d'abord voir ce qui se joue ; on monte le sien
          quand rien ne convient. */}
      {creation && (
        <section className="glass relative space-y-5 px-4 py-5">
          <SnowCap radius="var(--r-lg)" seed="affrontements" />
          {booster && (
            <div className="flex flex-col items-center gap-1 text-center">
              <h3 className="font-display text-2xl leading-none font-black tracking-wide text-ink uppercase">
                {booster.name}
              </h3>
              <p className="text-[13px] text-faint">
                {booster.slots.effet} effet{booster.slots.effet > 1 ? 's' : ''} +{' '}
                {booster.slots.collection} collection · {flakes(booster.price)} ❄
              </p>
              {booster.guaranteed && (
                <span className="flex items-center gap-1.5 text-[13px] text-faint">
                  garanti <RarityChip rarity={booster.guaranteed} />
                </span>
              )}
            </div>
          )}

          <RangeeBoosters
            boosters={etat.boosters}
            selection={booster?.id ?? ''}
            onSelection={setVise}
            fige={occupe}
          />

          <div className="flex justify-center">
            <button
              type="button"
              className="btn btn-ice"
              disabled={occupe || !booster || plein}
              onClick={() => booster && setPanier((p) => [...p, booster.id])}
            >
              {plein ? `${etat.bornes.max} sachets au maximum` : `Ajouter ${booster?.name ?? ''}`}
            </button>
          </div>

          {/*
            Le panier.

            Il se lit de gauche à droite comme les manches se joueront, et chaque
            sachet s'enlève d'un clic. Les emplacements vides sont dessinés : sans
            eux, on ne voit pas combien il en reste, et le plafond de cinq
            n'apparaît qu'au moment où l'on bute dessus.
          */}
          <div className="space-y-2">
            <p className="eyebrow text-center">
              Le panier — {panier.length} / {etat.bornes.max}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {panier.map((id, i) => {
                const def = etat.boosters.find((b) => b.id === id);
                return (
                  <button
                    key={`${id}-${i}`}
                    type="button"
                    disabled={occupe}
                    onClick={() => setPanier((p) => p.filter((_, k) => k !== i))}
                    aria-label={`Retirer ${def?.name ?? id} de la manche ${i + 1}`}
                    className="flex items-center gap-2 rounded-full border py-1.5 pr-3 pl-1.5 transition-colors"
                    style={{ borderColor: 'var(--glass-edge)' }}
                  >
                    <Vignette
                      sachet={{ id, nom: def?.name ?? id }}
                      boosters={etat.boosters}
                      taille={36}
                    />
                    <span className="font-display text-[13px] font-bold">{def?.name}</span>
                    <span className="text-faint" aria-hidden="true">
                      ×
                    </span>
                  </button>
                );
              })}

              {Array.from({ length: etat.bornes.max - panier.length }, (_, i) => (
                <span
                  key={`vide-${i}`}
                  className="h-[46px] w-[46px] rounded-full border border-dashed"
                  style={{ borderColor: 'rgb(255 255 255 / 0.12)' }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            {(() => {
              const empeche =
                panier.length < etat.bornes.min ||
                !etat.shopOpen ||
                etat.moiId === null ||
                !abordable;
              const libelle =
                etat.moiId === null
                  ? 'Connexion requise'
                  : !etat.shopOpen
                    ? 'Boutique fermée'
                    : panier.length < etat.bornes.min
                      ? 'Ajoute un sachet'
                      : !abordable
                        ? 'Flocons insuffisants'
                        : 'Miser';
              return (
                <button
                  type="button"
                  className={`btn btn-ice ${empeche || occupe ? 'btn-lg' : 'btn-ouvrir'}`}
                  disabled={occupe || empeche}
                  onClick={() => agit('/api/affrontements', { boosterIds: panier }, false)}
                >
                  <span>{occupe ? 'Un instant…' : libelle}</span>
                  {!empeche && !occupe && (
                    <span className="btn-ouvrir-prix">
                      <span aria-hidden="true">❄</span>
                      {flakes(mise)}
                    </span>
                  )}
                </button>
              );
            })()}

            {solde !== null && (
              <p className="solde">
                <span>Solde</span>
                <span className="solde-valeur">
                  <span className="text-ice" aria-hidden="true">
                    ❄
                  </span>{' '}
                  {flakes(solde)}
                </span>
              </p>
            )}

            <p className="max-w-2xl text-center text-[13px] leading-relaxed text-faint">
              Les deux camps ouvrent <strong>la même liste de sachets</strong>, manche par manche.
              Celui dont les cartes totalisent la plus haute <strong>somme de raretés</strong>{' '}
              remporte tout — les siennes et celles de l’autre. À somme égale, la plus haute carte
              tranche.
              {solde !== null && !abordable && panier.length > 0 && (
                <> Il te manque {flakes(mise - solde)} ❄ pour cette mise.</>
              )}
            </p>
          </div>
        </section>
      )}

      {/* ------------------------------ La liste ---------------------------- */}
      <section className="space-y-2">
        {onglet === 'top' && (
          <p className="px-1 text-[13px] text-faint">
            Les sept derniers jours, classés sur le pot mis en jeu.
          </p>
        )}

        {liste.lignes.length === 0 ? (
          <EmptyState
            title={
              onglet === 'attente'
                ? 'Aucun affrontement ouvert'
                : onglet === 'top'
                  ? 'Rien cette semaine'
                  : onglet === 'miens'
                    ? 'Tu n’en as encore joué aucun'
                    : 'Aucun affrontement terminé'
            }
            hint={
              onglet === 'attente'
                ? 'Monte le tien : si personne ne se présente, le bot répondra.'
                : 'Les affrontements joués apparaissent ici, rejouables carte par carte.'
            }
          />
        ) : (
          <ul className="space-y-2">
            {liste.lignes.map((b, i) => (
              <Ligne
                key={b.id}
                affrontement={b}
                boosters={etat.boosters}
                catalog={catalog}
                moiId={etat.moiId}
                rang={liste.rangs ? i : undefined}
                action={actionsDe(b)}
                onRelire={b.statut === 'TERMINEE' ? relire(b) : undefined}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
