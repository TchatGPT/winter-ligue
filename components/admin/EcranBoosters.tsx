'use client';

import { useState } from 'react';
import { useAction } from '@/components/admin/action';
import { Ecran } from '@/components/admin/Cadre';
import { RarityChip, flakes, rarityMeta } from '@/components/ui';
import { WEIGHT_TOTAL } from '@/lib/domain/rules';
import { RARITIES, type Rarity } from '@/lib/domain/types';

export interface ReglageBooster {
  id: string;
  name: string;
  price: number;
  weights: Record<Rarity, number>;
  slots: { effet: number; collection: number };
  /** Vrai si un réglage recouvre le catalogue pour ce booster. */
  modifie: boolean;
}

/**
 * L'économie des boosters : prix débité et table qui sert au tirage.
 *
 * Réservé aux administrateurs, et séparé du reste de l'espace : ce qui se règle
 * ici change les **règles** de la saison, quand le reste ne fait que la faire
 * vivre. Un modérateur peut ouvrir la boutique, il ne peut pas rendre les
 * légendaires dix fois plus fréquentes.
 *
 * Le catalogue reste la référence. Chaque booster peut revenir à ses valeurs
 * d'origine d'un bouton, et un booster jamais réglé n'a aucune ligne en base.
 *
 * ## Ce que l'écran doit rendre évident
 *
 * Les six champs de taux étaient distingués par une pastille de couleur de deux
 * millimètres, et rien d'autre : on ne pouvait pas savoir ce qu'on modifiait
 * sans compter les colonnes.
 *
 * Deux corrections : chaque rareté porte son **nom**, et le pourcentage est écrit
 * lisiblement **sous** le champ plutôt qu'en exposant. Un écran de réglage doit
 * pouvoir se lire avant d'être utilisé.
 */
export function EcranBoosters({ boosters }: { boosters: ReglageBooster[] }) {
  const { busy, message, envoie } = useAction();

  return (
    <Ecran
      titre="Boosters"
      lead={
        <>
          Le prix débité et la table qui sert au tirage — les deux sont appliqués par le serveur,
          pas seulement affichés. La table s’exprime{' '}
          <strong className="text-ink">sur {flakes(WEIGHT_TOTAL)}</strong> et doit totaliser
          exactement ce nombre : c’est la plage dans laquelle le tirage pioche, et une somme fausse
          rendrait les taux annoncés mensongers.
        </>
      }
      message={message}
    >
      {boosters.map((b) => (
        <EditeurBooster
          key={b.id}
          booster={b}
          busy={busy === b.id}
          onEnvoi={(corps) =>
            envoie('/api/admin/boosters', { boosterId: b.id, ...corps }, { cle: b.id })
          }
        />
      ))}
    </Ecran>
  );
}

/**
 * Une table de six raretés, avec son nom, son pourcentage et sa somme.
 *
 * Extrait en composant pour que la table ait une seule définition : nom de la
 * rareté, champ, pourcentage, et la somme sous le tout.
 */
function TableRaretes({
  titre,
  aide,
  poids,
  onChange,
}: {
  titre: string;
  aide: string;
  poids: Record<string, number>;
  onChange: (poids: Record<string, number>) => void;
}) {
  const somme = RARITIES.reduce((total, r) => total + (poids[r] ?? 0), 0);
  const ecart = somme - WEIGHT_TOTAL;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="label">{titre}</span>
        <span className="text-[13px] text-faint">{aide}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {RARITIES.map((r) => (
          <label key={r} className="block">
            {/* Le nom en toutes lettres, et pas seulement la pastille : c'est
                lui qui dit quel champ on est en train de modifier. */}
            <span className="mb-1 flex items-center gap-1.5">
              <RarityChip rarity={r} />
              <span className="text-[12px] text-muted">{rarityMeta(r).short}</span>
            </span>
            <input
              type="number"
              className="field num"
              min={0}
              value={poids[r] ?? 0}
              onChange={(e) => onChange({ ...poids, [r]: Number(e.target.value) })}
            />
            <span className="num mt-0.5 block text-[13px]" style={{ color: rarityMeta(r).color }}>
              {(((poids[r] ?? 0) / WEIGHT_TOTAL) * 100).toFixed(2)} %
            </span>
          </label>
        ))}
      </div>

      <p className={`num mt-2 text-[13px] ${ecart === 0 ? 'text-aurora' : 'text-danger'}`}>
        {ecart === 0
          ? `Somme : ${flakes(somme)} — juste.`
          : `Somme : ${flakes(somme)} — il y a ${flakes(Math.abs(ecart))} ${ecart > 0 ? 'de trop' : 'de moins'}.`}
      </p>
    </div>
  );
}

/**
 * L'éditeur d'un booster.
 *
 * La somme des poids est affichée en permanence, et l'enregistrement est refusé
 * tant qu'elle ne tombe pas juste. Le serveur revérifie de toute façon ; l'écart
 * affiché sert à ce qu'on n'ait pas à le calculer de tête à chaque frappe.
 */
function EditeurBooster({
  booster,
  busy,
  onEnvoi,
}: {
  booster: ReglageBooster;
  busy: boolean;
  onEnvoi: (corps: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
}) {
  const [prix, setPrix] = useState(booster.price);
  const [poids, setPoids] = useState<Record<string, number>>({ ...booster.weights });

  const juste = (t: Record<string, number>) =>
    RARITIES.reduce((total, r) => total + (t[r] ?? 0), 0) === WEIGHT_TOTAL;

  const enregistrable = juste(poids);

  return (
    <div className="glass p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-black tracking-wide text-ink">
          {booster.name}
          {booster.modifie && <span className="ml-2 badge text-[11px]">réglé</span>}
        </h3>
        <span className="text-[13px] text-faint">
          {booster.slots.effet} carte{booster.slots.effet > 1 ? 's' : ''} d’effet +{' '}
          {booster.slots.collection} de collection
        </span>
      </div>

      <label className="mb-4 block max-w-[200px]">
        <span className="label">Prix en flocons</span>
        <input
          type="number"
          className="field num"
          min={1}
          value={prix}
          onChange={(e) => setPrix(Number(e.target.value))}
        />
      </label>

      <TableRaretes
        titre="Taux de rareté"
        aide="Ce que tire chaque emplacement d’effet."
        poids={poids}
        onChange={setPoids}
      />

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3">
        {booster.modifie && (
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() => onEnvoi({ price: null, weights: null })}
            title="Revenir aux valeurs du catalogue"
          >
            Réinitialiser
          </button>
        )}
        <button
          className="btn btn-sm btn-ice"
          disabled={busy || !enregistrable}
          onClick={() => onEnvoi({ price: prix, weights: poids })}
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
