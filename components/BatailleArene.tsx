'use client';

/**
 * Une bataille qui se rejoue à l'écran.
 *
 * Tout est déjà décidé quand ce composant se monte : les deux tirages, les deux
 * scores, le vainqueur. Le serveur a ouvert les sachets, comparé et attribué
 * dans une seule transaction — fermer l'onglet ici ne change pas une carte, et
 * recharger la page rejoue exactement la même bataille.
 *
 * ## Pourquoi manche par manche
 *
 * Un duel de cinq manches, c'est quinze cartes par camp, trente en
 * tout. Trente rouleaux côte à côte donnent des cartes de la largeur d'un
 * ongle, et le suspense tient précisément à ce qu'on voie ce qui tombe. On joue
 * donc une manche à la fois, les deux camps en même temps : trois rouleaux par
 * panneau, et un total qui monte d'une manche à l'autre.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prechargeSons } from '@/components/bruitage';
import { SpinReel, type CarteRail } from '@/components/SpinReel';
import { CardTile, Notice, flakes } from '@/components/ui';
import { valeurCarte } from '@/lib/domain/bataille';
import { COURBE_MESUREE } from '@/lib/spin/courbe';

export interface CarteBataille {
  cardId: string;
  relance: boolean;
}

export interface CampVueClient {
  id: string;
  pseudo: string;
  bot: boolean;
  cartes: CarteBataille[];
  score: number;
}

export interface BatailleVueClient {
  id: string;
  manches: number;
  /** Cartes par manche et par camp. */
  cartesParManche: number;
  mise: number;
  statut: 'ATTENTE' | 'TERMINEE' | 'ANNULEE';
  hoteId: string;
  camps: CampVueClient[];
  vainqueurId: string | null;
}

/** Ce que le client sait d'une carte, pour l'afficher sans second aller-retour. */
export interface CatalogueCarte {
  name: string;
  subtitle: string;
  rarity: string;
  glyph: string;
  description: string;
  nature?: 'bonus' | 'malus';
  power?: number;
}

/** Le temps qu'on laisse voir une manche avant de lancer la suivante. */
const REPOS_MANCHE = 1500;

export function BatailleArene({
  bataille,
  catalog,
  poids,
  moiId,
  anime = true,
  onFini,
}: {
  bataille: BatailleVueClient;
  catalog: Record<string, CatalogueCarte>;
  /** Les taux d'affichage, sur 100 000 — les mêmes pour les deux camps. */
  poids: Record<string, number>;
  moiId: string | null;
  /**
   * Faux pour relire une bataille passée : les cartes apparaissent sans que les
   * rouleaux tournent. On ne fait pas patienter quelqu'un devant un résultat
   * qu'il connaît déjà.
   */
  anime?: boolean;
  onFini?: () => void;
}) {
  const [gauche, droite] = bataille.camps;

  /** Combien de cartes une manche donne, déduit du tirage lui-même. */
  const parManche = Math.max(1, Math.round(gauche.cartes.length / bataille.manches));

  /** Les cartes d'un camp, découpées en manches. */
  const decoupe = useCallback(
    (camp: CampVueClient) => {
      const lots: CarteBataille[][] = [];
      for (let i = 0; i < bataille.manches; i += 1) {
        lots.push(camp.cartes.slice(i * parManche, (i + 1) * parManche));
      }
      return lots;
    },
    [bataille.manches, parManche],
  );

  const lots = useMemo(
    () => [decoupe(gauche), decoupe(droite)],
    [decoupe, gauche, droite],
  );

  /** Tout ce que les rouleaux peuvent montrer en leurre. */
  const pool: CarteRail[] = useMemo(
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

  const [manche, setManche] = useState(anime ? 0 : bataille.manches);
  /**
   * Les panneaux qui se sont arrêtés, repérés par manche **et** par camp.
   *
   * Un simple compteur aurait suffi si chaque rouleau ne signalait sa fin
   * qu'une fois. Il n'en est rien : en développement, React monte deux fois, la
   * première animation est interrompue, et un `onFini` de trop ferait sauter une
   * manche entière. Un ensemble de clés est insensible aux doublons.
   */
  const vus = useRef<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    void prechargeSons();
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  /**
   * Une manche est finie quand les **deux** panneaux se sont arrêtés.
   *
   * Enchaîner sur le premier arrivé couperait la fin de l'autre : les deux
   * rouleaux partent ensemble mais leurs bandes sont décalées, et la dernière
   * colonne d'un camp peut s'arrêter une demi-seconde après celle de l'autre.
   */
  const panneauFini = useCallback(
    (camp: number, tour: number) => {
      const cle = `${tour}:${camp}`;
      if (vus.current.has(cle)) return;
      vus.current.add(cle);
      if (!vus.current.has(`${tour}:0`) || !vus.current.has(`${tour}:1`)) return;

      timers.current.push(
        setTimeout(() => {
          const suivante = tour + 1;
          setManche(suivante);
          if (suivante >= bataille.manches) onFini?.();
        }, REPOS_MANCHE),
      );
    },
    [bataille.manches, onFini],
  );

  const termine = manche >= bataille.manches;

  /** Le total d'un camp sur les manches déjà révélées. */
  const totalRevele = (i: number) =>
    lots[i]
      .slice(0, Math.min(manche, bataille.manches))
      .flat()
      .reduce((n, c) => n + valeurCarte(catalog[c.cardId]?.rarity ?? 'C'), 0);

  const jeSuisDedans = moiId === gauche.id || moiId === droite.id;

  return (
    <div className="space-y-4">
      {/* ---------------------------- L'entête ---------------------------- */}
      <div className="glass flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">
            {bataille.manches} manche{bataille.manches > 1 ? 's' : ''} de {parManche} cartes
          </p>
          <p className="text-[15px] text-ink-2">
            {flakes(bataille.mise)} ❄ misés de chaque côté — le vainqueur emporte{' '}
            {flakes(bataille.mise * 2)} ❄.
          </p>
        </div>
        {!termine && (
          <p className="font-display text-xs tracking-wider text-muted uppercase">
            Manche {Math.min(manche + 1, bataille.manches)} / {bataille.manches}
          </p>
        )}
      </div>

      {/* ---------------------------- Les camps ---------------------------

          Côte à côte, et c'est tout l'objet d'une bataille : deux rouleaux
          empilés se regardent l'un après l'autre, deux rouleaux face à face se
          regardent ensemble. On voit tomber la carte de l'adversaire au même
          instant que la sienne, ce qui est précisément le moment qu'on est venu
          chercher.

          Sous 1024 px on repasse en pile : deux panneaux de trois colonnes dans
          la largeur d'un téléphone donneraient des cartes illisibles, et une
          carte qu'on ne lit pas ne fait plus de suspense. */}
      <div className="grid gap-3 lg:grid-cols-2">
        {[gauche, droite].map((camp, i) => {
          const gagne = termine && bataille.vainqueurId === camp.id;
          const perd = termine && bataille.vainqueurId !== camp.id;
          return (
            <section
              key={camp.id + i}
              className={`glass overflow-hidden px-3 py-3 transition-opacity ${
                perd ? 'opacity-55' : ''
              }`}
              style={
                gagne
                  ? { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--aurora) 55%, transparent)' }
                  : undefined
              }
            >
              <header className="mb-2 flex items-center justify-between gap-3 px-1">
                <h3 className="flex min-w-0 items-center gap-2 truncate font-display text-base font-bold">
                  {camp.bot && <span aria-hidden="true">🤖</span>}
                  <span className="truncate">{camp.pseudo}</span>
                  {moiId === camp.id && (
                    <span className="text-xs font-normal text-muted">(toi)</span>
                  )}
                </h3>
                <p className="shrink-0 font-display text-sm tabular-nums">
                  {totalRevele(i)}
                  {gagne && <span className="ml-2 text-aurora">gagne</span>}
                </p>
              </header>

              {/* La manche en cours tourne ; les précédentes restent affichées. */}
              {!termine ? (
                <SpinReel
                  key={`${camp.id}-${manche}`}
                  pool={pool}
                  poids={poids}
                  gagnantes={lots[i][manche].map((c) => ({
                    cardId: c.cardId,
                    name: catalog[c.cardId]?.name ?? c.cardId,
                    rarity: catalog[c.cardId]?.rarity ?? 'C',
                    glyph: catalog[c.cardId]?.glyph ?? '❄',
                    description: catalog[c.cardId]?.description,
                    power: catalog[c.cardId]?.power,
                    nature: catalog[c.cardId]?.nature,
                  }))}
                  relances={lots[i][manche].map((c) => c.relance)}
                  duree={anime ? COURBE_MESUREE.duree : 0}
                  // Un seul des deux panneaux sonne : les mêmes échantillons aux
                  // mêmes instants, en double, épaississent le son au lieu de
                  // l'enrichir. Le panneau du haut a la parole.
                  sourdine={i === 1}
                  onFini={() => panneauFini(i, manche)}
                />
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3">
                  {camp.cartes.map((c, k) => {
                    const meta = catalog[c.cardId];
                    if (!meta) return null;
                    return (
                      <CardTile
                        key={`${c.cardId}-${k}`}
                        cardId={c.cardId}
                        name={meta.name}
                        subtitle={meta.subtitle}
                        description={meta.description}
                        rarity={meta.rarity}
                        glyph={meta.glyph}
                        power={meta.power}
                        nature={meta.nature}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* ---------------------------- Le verdict -------------------------- */}
      {termine && (
        <Notice kind={jeSuisDedans && bataille.vainqueurId === moiId ? 'success' : 'info'}>
          {bataille.vainqueurId === moiId ? (
            <>
              Tu remportes le pot : {flakes(bataille.mise * 2)} ❄, déjà sur ton solde.
            </>
          ) : (
            <>
              <strong>{bataille.camps.find((c) => c.id === bataille.vainqueurId)?.pseudo}</strong>{' '}
              l’emporte, {Math.max(gauche.score, droite.score)} contre{' '}
              {Math.min(gauche.score, droite.score)} en somme de raretés.
            </>
          )}
        </Notice>
      )}
    </div>
  );
}
