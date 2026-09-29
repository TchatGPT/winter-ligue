'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { CardFrame } from '@/components/CardFrame';
import { SnowCap } from '@/components/SnowCap';
import { RarityChip, rarityMeta } from '@/components/ui';

export interface CarteFiche {
  cardId: string;
  nom: string;
  /** L'intitulé de l'action : « Multiplicateur game », « Joker »… */
  action?: string;
  rarity: string;
  glyph: string;
  description: string;
  /** L'effet en trois mots. */
  resume?: string;
  nature?: 'bonus' | 'malus';
  power?: number;
}

const rienAEcouter = () => () => {};

/**
 * La fiche d'une carte, en grand, par-dessus la page.
 *
 * Rien d'autre que la carte et ce qu'elle fait : pas de marché, pas de
 * défausse, pas d'action. On l'ouvre depuis une vignette — le classement, un
 * profil — pour lire la carte à sa taille, et on la referme d'un clic à côté
 * ou d'Échap.
 *
 * Elle est rendue dans un portail vers `<body>` : le classement porte un
 * `backdrop-filter`, qui fait de lui le bloc de référence d'un élément fixe.
 * Sans le portail, le voile ne couvrait que le classement, et la fiche se
 * centrait dans son cadre au lieu de l'écran.
 */
export function FicheCarte({
  carte,
  legende,
  onClose,
}: {
  carte: CarteFiche;
  /** Une ligne sous la description : « Carte active de Cristal », par exemple. */
  legende?: React.ReactNode;
  onClose: () => void;
}) {
  // `document.body` n'existe pas au rendu serveur.
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );

  // Échap pour fermer, et la page dessous ne défile plus.
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

  const meta = rarityMeta(carte.rarity);
  if (!navigateur) return null;

  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-label={carte.nom} onClick={onClose}>
      <div
        className="fenetre-carte fiche-carte glass glass-reflet relative"
        onClick={(e) => e.stopPropagation()}
      >
        <SnowCap radius="var(--r-lg)" seed={`fiche-${carte.cardId}`} epaisseur={14} />
        <button
          type="button"
          className="btn btn-sm absolute top-4 right-4 z-10"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>

        <div className="min-h-0 overflow-y-auto px-5 pt-9 pb-6 sm:px-8">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <div className="reveal relative w-[240px] max-w-[70vw] shrink-0">
              {meta.holo && (
                <span
                  className="reveal-halo"
                  style={{ ['--r' as string]: meta.color }}
                  aria-hidden="true"
                />
              )}
              <CardFrame
                cardId={carte.cardId}
                name={carte.nom}
                description={carte.description}
                rarity={carte.rarity}
                glyph={carte.glyph}
                power={carte.power}
                nature={carte.nature}
              />
            </div>

            <div className="min-w-0 flex-1 text-center sm:pt-2 sm:pr-10 sm:text-left">
              <p className="flex items-center justify-center gap-2 text-[13px] font-semibold text-muted sm:justify-start">
                <RarityChip rarity={carte.rarity} />
                {meta.label}
                {carte.nature === 'malus' && <span className="text-danger">· Malus</span>}
              </p>
              <h2
                className="mt-2 font-display text-[30px] leading-none font-black"
                style={{ color: meta.color }}
              >
                {carte.nom}
              </h2>
              {carte.action && (
                <p className="mt-2 font-display text-[18px] leading-tight font-black tracking-wide text-ink uppercase">
                  {carte.action}
                </p>
              )}
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{carte.description}</p>
              {carte.resume && (
                <p className="num mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-ink">
                  {carte.resume}
                </p>
              )}
              {legende && <p className="mt-4 text-[13px] text-muted">{legende}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
