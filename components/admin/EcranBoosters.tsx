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
 */
export function EcranBoosters({ boosters }: { boosters: ReglageBooster[] }) {
  const { busy, message, envoie } = useAction();

  return (
    <Ecran
      titre="Boosters"
      lead={
        <>
          Le prix débité et la table qui sert au tirage — les deux sont appliqués par le serveur, pas
          seulement affichés. La table doit totaliser exactement{' '}
          <span className="num">{flakes(WEIGHT_TOTAL)}</span> : c’est la plage dans laquelle le
          tirage pioche, et une somme fausse rendrait les taux annoncés mensongers.
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

  const somme = RARITIES.reduce((total, r) => total + (poids[r] ?? 0), 0);
  const ecart = somme - WEIGHT_TOTAL;
  const juste = ecart === 0;

  return (
    <div className="glass p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-black tracking-wide text-ink">
          {booster.name}
          {booster.modifie && <span className="ml-2 badge text-[11px]">réglé</span>}
        </h3>
        <span className="text-[13px] text-faint">
          {booster.slots.effet} effets + {booster.slots.collection} collection
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="block">
          <span className="label">Prix</span>
          <input
            type="number"
            className="field num"
            min={1}
            value={prix}
            onChange={(e) => setPrix(Number(e.target.value))}
          />
        </label>

        <div>
          <span className="label">Taux de rareté</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {RARITIES.map((r) => (
              <label key={r} className="block">
                <span className="mb-1 flex items-center gap-1">
                  <RarityChip rarity={r} />
                  <span className="num text-[11px]" style={{ color: rarityMeta(r).color }}>
                    {(((poids[r] ?? 0) / WEIGHT_TOTAL) * 100).toFixed(2)} %
                  </span>
                </span>
                <input
                  type="number"
                  className="field num"
                  min={0}
                  value={poids[r] ?? 0}
                  onChange={(e) => setPoids({ ...poids, [r]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className={`num text-[13px] ${juste ? 'text-aurora' : 'text-danger'}`}>
          Somme : {flakes(somme)}
          {!juste && ` — ${ecart > 0 ? '+' : ''}${flakes(ecart)} par rapport à ${flakes(WEIGHT_TOTAL)}`}
        </span>

        <div className="flex gap-2">
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
            disabled={busy || !juste}
            onClick={() => onEnvoi({ price: prix, weights: poids })}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
