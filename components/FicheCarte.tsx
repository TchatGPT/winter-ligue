'use client';

import { useEffect } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { RarityChip, rarityMeta } from '@/components/ui';

export interface CarteFiche {
  cardId: string;
  nom: string;
  rarity: string;
  glyph: string;
  description: string;
  /** L'effet en trois mots. */
  resume?: string;
  nature?: 'bonus' | 'malus';
  power?: number;
}

/**
 * La fiche d'une carte, en grand, par-dessus la page.
 *
 * Rien d'autre que la carte et ce qu'elle fait : pas de marché, pas de
 * défausse, pas d'action. On l'ouvre depuis une vignette — le classement, un
 * profil — pour lire la carte à sa taille, et on la referme d'un clic à côté
 * ou d'Échap.
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={carte.nom}
      onClick={onClose}
    >
      <div
        className="glass glass-strong relative w-full max-w-2xl overflow-hidden !rounded-b-none px-5 py-6 sm:!rounded-b-[var(--r-lg)] sm:px-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn btn-sm absolute top-3 right-3"
          onClick={onClose}
          aria-label="Fermer"
        >
          ✕
        </button>

        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="reveal relative w-[240px] shrink-0">
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

          <div className="min-w-0 flex-1 text-center sm:pt-2 sm:text-left">
            <RarityChip rarity={carte.rarity} />
            <h2
              className="mt-2 font-display text-[30px] leading-none font-black"
              style={{ color: meta.color }}
            >
              {carte.nom}
            </h2>
            {carte.resume && (
              <p className="mt-2 font-display text-[16px] font-bold tracking-wide text-ink uppercase">
                {carte.resume}
              </p>
            )}
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{carte.description}</p>
            {legende && <p className="mt-4 text-[13px] text-faint">{legende}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
