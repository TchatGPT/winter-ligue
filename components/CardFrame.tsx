import { aUneIllustration, CardArt } from '@/components/CardArt';
import { IconImpact, IconSnowflake } from '@/components/icons';
import { getCard, RARITY_META } from '@/lib/domain/catalog';
import { compact } from '@/lib/format';
import type { Rarity } from '@/lib/domain/types';

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
  glyph: string;
  power?: number;
  quote?: number | null;
  nature?: 'bonus' | 'malus';
  /**
   * Exemplaires détenus. Au-delà de 1, la carte porte un compteur.
   *
   * La collection affichait autrefois une vignette par exemplaire : trois
   * Congères occupaient trois cases identiques, et on ne voyait plus le
   * catalogue derrière les doublons. Une seule carte, avec son compte.
   */
  copies?: number;
  dimmed?: boolean;
  /** Marque libre, posée en haut à droite de la fenêtre. */
  corner?: React.ReactNode;
}

export function CardFrame({
  cardId,
  name,
  description,
  rarity,
  glyph,
  power,
  quote,
  nature,
  copies,
  dimmed,
  corner,
}: CardFrameProps) {
  const meta = RARITY_META[rarity as Rarity] ?? RARITY_META.C;
  // L'intitulé de l'action — « Multiplicateur game », « Joker » — se lit dans
  // le catalogue : la carte le porte partout où elle s'affiche, sans que
  // chaque écran ait à le passer.
  const action = getCard(cardId)?.subtitle;

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

        {/*
          La rareté, en toutes lettres, au bas de l'illustration.
          Elle était en sigle dans un coin — « L », « PC » — et il fallait
          connaître le code pour le lire. Voir `.cadre-sceau`.
        */}
        <span className="cadre-sceau">{meta.label}</span>
      </div>

      {/* Balise native et non `next/image` : l'image est déjà au bon format et
          au bon poids, et elle est la même pour toutes les cartes de la page —
          le navigateur ne la charge qu'une fois. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cadre-planche" src="/cadres/glace.webp" alt="" aria-hidden="true" />

      {copies !== undefined && copies > 1 && (
        <span className="cadre-copies" title={`${copies} exemplaires en réserve`}>
          ×{copies}
        </span>
      )}
      {nature === 'malus' && <span className="cadre-malus">Malus</span>}
      {corner && <span className="cadre-coin">{corner}</span>}

      {/* Le panneau ne fait qu'un sixième de la carte : deux lignes, lisibles,
          plutôt que quatre qu'on devine. Le nom ; puis l'action et la puissance
          côte à côte. La description ne vient que sur une grande carte (voir
          `.cadre-desc`) : partout ailleurs, elle est écrite à côté de la carte,
          en grand. La rareté est au bas de l'illustration. */}
      <div className="cadre-texte">
        <h3 className="cadre-nom">{name}</h3>
        <div className="cadre-ligne">
          {action && <p className="cadre-action">{action}</p>}
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
        {description && <p className="cadre-desc">{description}</p>}
      </div>
    </div>
  );
}
