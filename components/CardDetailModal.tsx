'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TradingCard } from '@/components/TradingCard';
import { rarityMeta, themeMeta } from '@/components/ui';
import { cardArt, cardNumber } from '@/lib/domain/catalog';

export interface CarteDetail {
  cardId: string;
  name: string;
  subtitle: string;
  description: string;
  rarity: string;
  theme: string;
  glyph: string;
  power: number;
  nature: 'bonus' | 'malus';
  isNew?: boolean;
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
 * La fiche d'une carte, ouverte depuis une vignette.
 *
 * Aucun aller-retour réseau : tout ce qu'elle affiche est déjà dans le
 * catalogue que la page a reçu. Une fiche qui charge est une fiche qui clignote,
 * et il n'y a rien à charger — la cote, elle, vit sur la page de marché, qui est
 * à un lien d'ici.
 *
 * Le grand format à gauche est volontairement `TradingCard` et non la vignette
 * agrandie : c'est le seul endroit avec l'ouverture de booster où la carte est
 * le sujet, donc le seul où l'inclinaison au pointeur et le vernis
 * holographique valent leur coût de rendu.
 */
export function CardDetailModal({
  carte,
  onClose,
}: {
  carte: CarteDetail;
  onClose: () => void;
}) {
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

  const meta = rarityMeta(carte.rarity);
  const famille = themeMeta(carte.theme);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={carte.name}
      onClick={onClose}
    >
      <div
        className="glass max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-b-none sm:rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid gap-5 p-4 sm:grid-cols-[minmax(0,272px)_1fr] sm:p-5">
          {/* ------------------------ Le grand format ------------------- */}
          <div className="mx-auto w-full max-w-[300px]">
            <TradingCard
              card={{
                cardId: carte.cardId,
                name: carte.name,
                subtitle: carte.subtitle,
                description: carte.description,
                rarity: carte.rarity,
                theme: carte.theme,
                glyph: carte.glyph,
                power: carte.power,
                nature: carte.nature,
                art: cardArt(carte.cardId),
              }}
            />
          </div>

          {/* ---------------------------- La fiche ---------------------- */}
          <div className="min-w-0">
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
              <button
                className="btn btn-sm btn-ghost shrink-0"
                onClick={onClose}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {carte.subtitle && (
              <p className="mt-3 text-[15px] leading-relaxed text-muted italic">
                « {carte.subtitle} »
              </p>
            )}

            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[15px] leading-relaxed text-ink">
              {carte.description}
            </div>

            <div className="mt-4">
              <Ligne label="Puissance">
                <span className="num" style={{ color: meta.color }}>
                  {carte.power}
                </span>{' '}
                <span className="text-faint">/ 100</span>
              </Ligne>
              <Ligne label="Famille">
                {famille ? (
                  <span style={{ color: famille.color }}>{famille.name}</span>
                ) : (
                  '—'
                )}
              </Ligne>
              <Ligne label="Nature">
                <span className={carte.nature === 'malus' ? 'text-danger' : 'text-ice'}>
                  {carte.nature === 'malus' ? 'Malus' : 'Bonus'}
                </span>
              </Ligne>
              <Ligne label="Numéro">
                <span className="num text-faint">{cardNumber(carte.cardId)}</span>
              </Ligne>
            </div>

            <Link
              href={`/marche/${carte.cardId}`}
              className="btn btn-ice mt-4 w-full justify-center no-underline"
            >
              Voir la cote sur le marché
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
