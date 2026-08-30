import { aUneIllustration, CardArt } from '@/components/CardArt';
import { IconImpact, IconSnowflake } from '@/components/icons';
import { RARITY_META, THEMES } from '@/lib/domain/catalog';
import { compact } from '@/lib/format';
import type { Rarity, ThemeId } from '@/lib/domain/types';

/**
 * La carte montée dans un cadre peint.
 *
 * Le cadre est une seule image — `public/cadres/glace.webp` — fabriquée à partir
 * d'une carte finie : le blanc autour a été retiré par remplissage depuis les
 * coins, et la fenêtre d'illustration évidée, en conservant le fleuron et les
 * deux volutes d'angle qui débordent dessus. Le script est dans le dépôt sous
 * `scripts/decoupe-cadre.mjs`.
 *
 * L'image est posée **au-dessus** de l'illustration, pas en dessous. C'est ce
 * qui permet aux ornements de passer par-dessus le dessin, comme sur la carte
 * d'origine ; un cadre posé derrière laisserait l'illustration recouvrir ses
 * propres bords.
 *
 * ## Une seule image pour six raretés
 *
 * Le cadre est violet glacé. Les six raretés s'en déduisent par une rotation de
 * teinte appliquée à la seule couche du cadre — l'illustration et le texte n'y
 * passent pas. Six images distinctes pèseraient six fois plus pour un résultat
 * que l'œil ne distinguerait pas d'une rotation, la géométrie étant la même.
 *
 * ## Les emplacements sont mesurés, pas estimés
 *
 * Les pourcentages de `.cadre-fenetre` et `.cadre-texte` viennent d'une mesure
 * de l'image : bornes de la carte, bornes de la fenêtre sombre, bornes du
 * panneau clair. Les modifier à vue décale le dessin sous le cadre.
 */

export interface CardFrameProps {
  cardId: string;
  name: string;
  description?: string;
  rarity: string;
  theme: string;
  glyph: string;
  power?: number;
  quote?: number | null;
  nature?: 'bonus' | 'malus';
  dimmed?: boolean;
  /** Marque libre, posée en haut à droite de la fenêtre. */
  corner?: React.ReactNode;
}

export function CardFrame({
  cardId,
  name,
  description,
  rarity,
  theme,
  glyph,
  power,
  quote,
  nature,
  dimmed,
  corner,
}: CardFrameProps) {
  const meta = RARITY_META[rarity as Rarity] ?? RARITY_META.C;
  const famille = THEMES[theme as ThemeId];

  return (
    <div
      className={`cadre ${dimmed ? 'cadre-eteint' : ''}`}
      data-r={meta.code}
      style={{ ['--r' as string]: meta.color }}
    >
      <div className="cadre-fenetre">
        {aUneIllustration(cardId) ? (
          <CardArt cardId={cardId} className="cadre-vecteur" />
        ) : (
          <span className="cadre-glyphe" aria-hidden="true">
            {glyph}
          </span>
        )}
      </div>

      {/* Balise native et non `next/image` : l'image est déjà au bon format et
          au bon poids, et elle est la même pour toutes les cartes de la page —
          le navigateur ne la charge qu'une fois. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cadre-planche" src="/cadres/glace.webp" alt="" aria-hidden="true" />

      <span className="cadre-rarete">{meta.code}</span>
      {nature === 'malus' && <span className="cadre-malus">Malus</span>}
      {corner && <span className="cadre-coin">{corner}</span>}

      <div className="cadre-texte">
        <h3 className="cadre-nom">{name}</h3>
        {description && <p className="cadre-desc">{description}</p>}

        <div className="cadre-pied">
          {famille && <span className="cadre-famille">{famille.name}</span>}
          <span className="cadre-chiffres">
            {power !== undefined && (
              <span className="cadre-stat cadre-stat-pui" title={`Puissance ${power} sur 100`}>
                <IconImpact className="h-[1em] w-[1em]" />
                <span className="num">{power}</span>
              </span>
            )}
            {quote !== undefined && (
              <span className="cadre-stat cadre-stat-cote" title="Cote : dernier prix constaté">
                <IconSnowflake className="h-[1em] w-[1em]" />
                <span className="num">{quote === null ? '—' : compact(quote)}</span>
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
