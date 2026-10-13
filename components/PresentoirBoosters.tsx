'use client';

import { type CSSProperties, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CardFrame } from '@/components/CardFrame';
import { CarteInclinable } from '@/components/CarteInclinable';
import { RARITY_META } from '@/lib/domain/catalog';
import type { Rarity } from '@/lib/domain/types';

export interface CartePresentee {
  cardId: string;
  name: string;
  subtitle: string;
  description: string;
  rarity: Rarity;
  glyph: string;
  nature: 'bonus' | 'malus';
  /** L'illustration peinte, si elle existe : la scène 3D la pose sur la carte. */
  art?: string | null;
}

export interface BoosterPresente {
  id: string;
  nom: string;
  accroche: string;
  declencheur: string;
  gradient: [string, string];
  art: string | null;
  gemme: Rarity | null;
  cartes: CartePresentee[];
}

/**
 * La vitrine des boosters de l'accueil.
 *
 * À gauche, les quatre boosters en onglets. À droite, une scène : le booster
 * choisi en grand, et ses cartes qui en sortent en éventail, le sachet devant.
 * On les survole — chacune se soulève et penche en relief (`CarteInclinable`)
 * —, on ne clique pas dessus ; la légende sous la scène dit celle qu'on
 * regarde. Le premier booster est ouvert d'office : la scène n'est jamais vide.
 */
export function PresentoirBoosters({ boosters }: { boosters: BoosterPresente[] }) {
  const [choisi, setChoisi] = useState(boosters[0]?.id ?? '');
  const [survol, setSurvol] = useState<string | null>(null);
  const booster = boosters.find((b) => b.id === choisi) ?? boosters[0];
  if (!booster) return null;
  const n = booster.cartes.length;
  const carte = booster.cartes.find((c) => c.cardId === survol) ?? null;

  return (
    <div className="vit">
      <div className="vit-onglets" role="tablist" aria-label="Les boosters">
        {boosters.map((b) => {
          const actif = b.id === booster.id;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={actif}
              aria-controls="vit-scene"
              className="vit-onglet"
              style={{ ['--t' as string]: RARITY_META[b.gemme ?? 'C'].color } as CSSProperties}
              onClick={() => {
                setChoisi(b.id);
                setSurvol(null);
              }}
            >
              <span className="vit-onglet-sachet" aria-hidden="true">
                <BoosterPack3D name={b.nom} cardCount={b.cartes.length} gradient={b.gradient} art={b.art} rarete={b.gemme} vignette />
              </span>
              <span className="vit-onglet-texte">
                <b>{b.nom}</b>
                <small>{b.accroche}</small>
              </span>
              <span className="vit-onglet-n num" aria-label={`${b.cartes.length} cartes`}>
                {b.cartes.length}
              </span>
            </button>
          );
        })}
      </div>

      <div id="vit-scene" className="vit-scene" role="tabpanel" aria-label={`Les cartes du ${booster.nom}`}>
        <div className="vit-zone">
          {/* La clé relance la sortie des cartes à chaque booster choisi. */}
          <div key={booster.id} className="vit-eventail" style={{ ['--n' as string]: n } as CSSProperties}>
            {booster.cartes.map((c, k) => (
              <div
                key={c.cardId}
                className="vit-carte"
                data-survol={c.cardId === survol || undefined}
                style={{ ['--k' as string]: k, ['--d' as string]: k - (n - 1) / 2 } as CSSProperties}
                onPointerEnter={() => setSurvol(c.cardId)}
                onPointerLeave={() => setSurvol((s) => (s === c.cardId ? null : s))}
              >
                <CarteInclinable>
                  <CardFrame cardId={c.cardId} name={c.name} rarity={c.rarity} glyph={c.glyph} nature={c.nature} />
                </CarteInclinable>
              </div>
            ))}
          </div>
          <div className="vit-sachet" aria-hidden="true">
            <BoosterPack3D
              name={booster.nom}
              cardCount={n}
              gradient={booster.gradient}
              art={booster.art}
              rarete={booster.gemme}
              vignette
            />
          </div>
        </div>

        {/* La légende : la carte survolée, sinon le booster. Hauteur fixe : rien ne saute. */}
        <div className="vit-legende" aria-live="polite">
          {carte ? (
            <>
              <p className="vit-legende-sur" style={{ color: RARITY_META[carte.rarity].color }}>
                {RARITY_META[carte.rarity].label}
              </p>
              <p className="vit-legende-titre">
                {carte.name} <span>· {carte.subtitle}</span>
              </p>
              <p className="vit-legende-texte">{carte.description}</p>
            </>
          ) : (
            <>
              <p className="vit-legende-sur">
                {n} carte{n > 1 ? 's' : ''}
              </p>
              <p className="vit-legende-titre">{booster.nom}</p>
              <p className="vit-legende-texte">
                {booster.declencheur} <span>Survole une carte pour la lire.</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
