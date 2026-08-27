'use client';

import { useCallback, useRef, useState } from 'react';
import { cardNumber, FOIL, RARITY_META, THEMES } from '@/lib/domain/catalog';
import type { Rarity, ThemeId } from '@/lib/domain/types';

export interface TradingCardData {
  cardId: string;
  name: string;
  subtitle: string;
  description: string;
  rarity: string;
  theme: string;
  glyph: string;
  power: number;
  nature: 'bonus' | 'malus';
  /** Illustration facultative. Absente, la carte retombe sur son glyphe. */
  art?: string | null;
}

/** Amplitude d'inclinaison, en degrés. Au-delà, la carte se déforme et fait toc. */
const TILT = 11;

/**
 * Carte de collection « premium » : inclinaison au pointeur, reflet et foil.
 *
 * Le foil n'est pas une texture arc-en-ciel posée par-dessus. Un vrai
 * holographique est une figure d'interférence dont la couleur dépend de l'angle
 * de vue : ce qui doit bouger, c'est la *position* de la trame, pas sa teinte.
 * C'est ce que fait `--px` / `--py`, et c'est ce qui sépare un effet crédible
 * d'un autocollant.
 *
 * Composant volontairement réservé aux moments où la carte est le sujet —
 * ouverture de booster, fiche de carte, vitrine de collection. Sur une grille
 * de cinquante vignettes, cinquante calques en `mix-blend-mode` mettraient le
 * rendu à genoux : la grille garde `CardTile`, plus sobre.
 */
export function TradingCard({
  card,
  className,
  interactive = true,
}: {
  card: TradingCardData;
  className?: string;
  /** Désactive l'inclinaison, par exemple sur une carte purement décorative. */
  interactive?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  // Les 24 illustrations arrivent au fil de l'eau : tant qu'un fichier manque,
  // l'image échoue silencieusement et la carte retombe sur son glyphe. Sans ce
  // repli, le navigateur afficherait une icône d'image cassée.
  const [artBroken, setArtBroken] = useState(false);
  const showArt = Boolean(card.art) && !artBroken;

  const meta = RARITY_META[card.rarity as Rarity] ?? RARITY_META.C;
  const theme = THEMES[card.theme as ThemeId];
  const foil = FOIL[card.rarity as Rarity] ?? 'none';

  const track = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive) return;
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // Position du pointeur, ramenée entre 0 et 1 dans la carte.
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      // L'inclinaison est inversée sur X : pointer vers le haut doit basculer
      // le haut de la carte vers l'arrière, comme un objet réel qu'on penche.
      el.style.setProperty('--ry', `${((x - 0.5) * 2 * TILT).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${((0.5 - y) * 2 * TILT).toFixed(2)}deg`);
      // Les trames de foil se déplacent plus vite que le pointeur : c'est ce
      // décalage qui donne l'impression de profondeur sous le vernis.
      el.style.setProperty('--px', ((x * 100 - 50) * 1.8 + 50).toFixed(1));
      el.style.setProperty('--py', ((y * 100 - 50) * 1.8 + 50).toFixed(1));
    },
    [interactive],
  );

  const reset = useCallback(() => {
    setActive(false);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
    el.style.setProperty('--px', '50');
    el.style.setProperty('--py', '50');
  }, []);

  return (
    <div className={`tc-scene ${className ?? ''}`}>
      <div
        ref={ref}
        className={`tc tc-foil-${foil}`}
        data-active={active ? 'true' : 'false'}
        style={{ ['--r' as string]: meta.color }}
        onPointerEnter={() => interactive && setActive(true)}
        onPointerMove={track}
        onPointerLeave={reset}
        onPointerCancel={reset}
      >
        <div className="tc-frame">
          {/* --------------------------- Cartouche --------------------- */}
          <div className="tc-plate">
            <span
              className="shrink-0 rounded-[1.6cqw] px-[1.8cqw] py-[0.6cqw] font-display text-[3.2cqw] font-black"
              style={{
                background: `linear-gradient(155deg, ${meta.color}, color-mix(in srgb, ${meta.color} 60%, #000))`,
                color: '#04101c',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
              }}
            >
              {meta.code}
            </span>
            <h3 className="tc-name">{card.name}</h3>
            <span
              className="num shrink-0 font-display text-[3.6cqw] font-black"
              style={{ color: card.nature === 'malus' ? 'var(--danger)' : meta.color }}
              title={`Puissance ${card.power} sur 100`}
            >
              {card.power}
            </span>
          </div>

          {/* ------------------------ Illustration --------------------- */}
          <div className="tc-art" data-has-art={showArt ? 'true' : 'false'}>
            {showArt ? (
              // Balise native plutôt que next/image : l'illustration est déjà
              // au bon format et au bon poids, et le composant sert autant à
              // l'écran qu'aux captures pour le stream.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.art!}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setArtBroken(true)}
              />
            ) : (
              <span className="tc-art-glyph" aria-hidden="true">
                {card.glyph}
              </span>
            )}
          </div>

          {/* -------------------------- Type --------------------------- */}
          <div className="tc-type">
            {theme && (
              <>
                <span aria-hidden="true">{theme.glyph}</span>
                <span style={{ color: theme.color }}>{theme.name}</span>
              </>
            )}
            <span className="text-white/25">·</span>
            <span className={card.nature === 'malus' ? 'text-danger' : 'text-white/60'}>
              {card.nature === 'malus' ? 'Malus' : 'Bonus'}
            </span>
          </div>

          {/* --------------------- Encadré d'effet --------------------- */}
          <div className="tc-text">
            {card.description}
            {card.subtitle && <p className="tc-flavor">« {card.subtitle} »</p>}
          </div>

          {/* ------------------------- Pied ---------------------------- */}
          <div className="tc-foot">
            <span>WL · S1</span>
            <span className="num">{cardNumber(card.cardId)}</span>
          </div>
        </div>

        <div className="tc-holo" aria-hidden="true" />
        <div className="tc-glare" aria-hidden="true" />
        <div className="tc-grain" aria-hidden="true" />
      </div>
    </div>
  );
}
