'use client';

import { useMemo, useRef, useState } from 'react';
import { CardFrame } from '@/components/CardFrame';
import { ATTR_FENETRE, ATTR_RUBAN, useSpinAnimation } from '@/components/useSpinAnimation';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';
import { construitBande, JETON_ID } from '@/lib/spin/bande';
import { COURBE_MESUREE, type Courbe, RANG_GAGNANT, RANG_RELANCE } from '@/lib/spin/courbe';

/**
 * Le rail : N bandes horizontales, un repère en travers, et rien qui décide.
 *
 * Le résultat est arrivé du serveur avant que ce composant n'existe. Il ne fait
 * que le révéler — la bande de leurres, la durée, le son sont de l'affichage.
 * C'est l'invariant n°1 de `AGENTS.md`, et c'est ce qui rend l'interruption
 * inoffensive : recharger en plein spin ne change pas une carte.
 *
 * Tout ce qui bouge est dans `useSpinAnimation`, tout ce qui se calcule est dans
 * `lib/spin/`. Ce fichier pose des div, et c'est délibéré : on doit pouvoir
 * régler le ressenti sans jamais l'ouvrir.
 */

/**
 * Le jeton Winter Spin, tel qu'il apparaît dans une bande.
 *
 * Sa rareté est celle d'une légendaire, et ce n'est pas un abus : c'est le
 * **rang** qui commande le halo quand une tuile passe sous le repère, et le
 * jeton mérite ce signal-là. Il n'entre pour autant dans aucun tirage de rareté
 * — il n'existe que dans la bande, jamais dans une collection.
 */
export const JETON: CarteRail = {
  cardId: JETON_ID,
  name: 'Winter Spin',
  rarity: 'L',
  glyph: '👑',
};

/**
 * La couleur du jeton : celle de son logo, pas celle des légendaires.
 *
 * Il emprunte leur **rang** — c'est ce qui lui vaut le halo quand il passe sous
 * le repère, et c'est bien le signal qu'on veut — mais un halo doré autour d'un
 * blason de glace ne va nulle part. La teinte est donc reprise à la main, ici et
 * dans les métadonnées que lit le moteur.
 */
const COULEUR_JETON = '#7fd8ff';

export interface CarteRail {
  cardId: string;
  name: string;
  rarity: string;
  glyph: string;
  description?: string;
  power?: number;
  nature?: 'bonus' | 'malus';
}

export function SpinReel({
  pool,
  poids,
  gagnantes,
  relances = [],
  duree,
  courbe = COURBE_MESUREE,
  sourdine = false,
  onFini,
}: {
  /** Tout ce qu'on peut montrer en leurre — le pool complet du booster. */
  pool: CarteRail[];
  /** Les taux d'affichage du booster, sur 100 000. */
  poids: Record<string, number>;
  /** Les cartes tirées par le serveur, une par bande. */
  gagnantes: CarteRail[];
  /**
   * Quelles colonnes le jeton Winter Spin a fait rejouer, décidé par le serveur.
   *
   * Le rail met en scène une relance **déjà survenue** : il ne la provoque pas,
   * et un client qui mentirait ici ne changerait pas une carte.
   */
  relances?: boolean[];
  /** La durée nominale d'une course, en ms. Zéro pour une révélation directe. */
  duree: number;
  /** La loi de mouvement. Le banc `/dev/rail` sert à comparer les deux. */
  courbe?: Courbe;
  /**
   * Ce rail tourne sans un bruit.
   *
   * Pour les batailles, où deux rails tournent côte à côte : les faire sonner
   * tous les deux épaissirait le même son au lieu de l'enrichir, et le ménage
   * audio de l'un couperait les évènements de l'autre. Un seul parle.
   */
  sourdine?: boolean;
  onFini: () => void;
}) {
  /*
   * Les bandes sont construites une fois, au montage, et plus jamais.
   *
   * Un `useMemo` ne suffirait pas : React se réserve le droit de le rejouer, et
   * la bande changerait sous les pieds de l'animation en cours. L'initialiseur
   * d'un état, lui, ne tourne qu'une fois.
   */
  const [bandes] = useState(() =>
    gagnantes.map((gagnante, i) =>
      construitBande(pool, gagnante, poids, Math.random, {
        jeton: JETON,
        /*
         * `duree > 0` compte autant que le drapeau du serveur.
         *
         * Une révélation immédiate ne joue pas la relance : elle parcourt la
         * course simple. Bâtir malgré tout une bande relancée y plaçait la
         * gagnante au rang 51 alors que le rail s'arrête au rang 27 — soit pile
         * sur le jeton. La colonne affichait « Winter Spin » comme carte gagnée.
         */
        relance: relances[i] === true && duree > 0,
      }),
    ),
  );

  /**
   * La meilleure carte du lot, et la bande qui la porte.
   *
   * Une seule fête par ouverture, à l'arrêt de cette bande-là. Cinq fanfares de
   * plusieurs secondes à cent millisecondes d'intervalle s'empileraient en
   * bouillie, et la meilleure carte se noierait au milieu des autres au lieu
   * d'être ce qu'on retient.
   */
  const meilleure = useMemo(() => {
    let index = 0;
    let rang = -1;
    gagnantes.forEach((carte, i) => {
      const r = RARITY_ORDER[carte.rarity as Rarity] ?? 0;
      if (r > rang) {
        rang = r;
        index = i;
      }
    });
    return { index, rang: Math.max(0, rang) };
  }, [gagnantes]);

  const cadre = useRef<HTMLDivElement>(null);

  /*
   * Ce que le moteur a besoin de savoir du contenu : un rang et une couleur par
   * tuile. Rien de plus — il allume un halo quand une carte convoitée passe sous
   * le repère, il ne connaît pas les cartes.
   */
  const metaTuiles = useMemo(
    () =>
      bandes.map((tuiles) =>
        tuiles.map((carte) => {
          const m = RARITY_META[carte.rarity as Rarity] ?? RARITY_META.C;
          const estJeton = carte.cardId === JETON_ID;
          return {
            rang: RARITY_ORDER[carte.rarity as Rarity] ?? 0,
            couleur: estJeton ? COULEUR_JETON : m.color,
          };
        }),
      ),
    [bandes],
  );

  useSpinAnimation({
    cadre,
    bandes: gagnantes.length,
    tuiles: metaTuiles,
    relances,
    duree,
    courbe,
    rang: meilleure.rang,
    bandeMeilleure: meilleure.index,
    sourdine,
    onFini,
  });

  return (
    <div className="rail-scene">
      {/*
        Le masque du jeton, défini une fois pour toutes les tuiles.

        Le logo déposé est un WebP **sans canal alpha** — vérifié en lisant son
        en-tête VP8L : 896 × 1200, fond noir opaque. Il a d'abord été posé sur un
        fond sombre avec `mix-blend-mode: screen`, ce qui effaçait bien le noir
        mais obligeait à peindre ce fond, et le rectangle se voyait.

        Un masque SVG lit l'image **en luminance** : le noir devient transparent,
        le clair reste opaque, les gris laissent passer la fumée. Plus aucun fond
        n'est nécessaire, donc plus aucune boîte.

        SVG plutôt que `mask-mode: luminance`, qui ferait la même chose en une
        ligne : cette propriété demande Chrome 120, et `browserslist` descend à
        111. Un masque SVG est en luminance par défaut, partout.
      */}
      <svg className="rail-masques" aria-hidden="true" focusable="false">
        <mask id="winter-spin-masque" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
          <image href="/winter-spin.webp" width="1" height="1" preserveAspectRatio="none" />
        </mask>
      </svg>

      <div
        className="rail"
        ref={cadre}
        style={{ ['--bandes' as string]: gagnantes.length }}
        role="img"
        aria-label={`Tirage de ${gagnantes.length} carte${gagnantes.length > 1 ? 's' : ''} en cours`}
      >
        {bandes.map((tuiles, i) => {
          const gagnante = gagnantes[i];
          const meta = RARITY_META[gagnante.rarity as Rarity] ?? RARITY_META.C;
          return (
            <div
              key={i}
              className="rail-fenetre"
              {...{ [ATTR_FENETRE]: '' }}
              data-arrete="false"
              data-rang={RARITY_ORDER[gagnante.rarity as Rarity] ?? 0}
              style={{ ['--gagne' as string]: meta.color }}
            >
              {/* Le rouleau est la seule chose qui bouge, et il bouge d'un bloc :
                  une animation WAAPI sur `transform`, donc sur le compositeur.
                  Les jetons, eux, sont posés une fois pour toutes par la mise en
                  page — `--k` est leur rang, et la feuille de style en tire un
                  `top`. Deux cent trente translations en 3D
                  demanderaient au navigateur deux cent trente couches. */}
              <div className="rail-ruban" {...{ [ATTR_RUBAN]: '' }}>
                {tuiles.map((carte, k) => {
                  const m = RARITY_META[carte.rarity as Rarity] ?? RARITY_META.C;
                  const gagne = k === (relances[i] && duree > 0 ? RANG_RELANCE : RANG_GAGNANT);
                  const jeton = carte.cardId === JETON_ID;
                  return (
                    /*
                     * Une vraie carte, illustration comprise.
                     *
                     * Les rouleaux portaient des jetons ronds avec un anneau de
                     * rareté et un glyphe — l'objet d'EmpireDrop, qui vend des
                     * baskets et des téléphones. Ici on vend des cartes, et un
                     * pictogramme qui défile ne dit pas qu'on ouvre un booster.
                     *
                     * Ce que je croyais interdit ne l'était pas : une scène de
                     * `CardArt` compte environ huit balises SVG, pas la centaine
                     * que j'avais annoncée. Trente et une cartes par rouleau,
                     * cinq rouleaux, font quelque deux mille cinq cents balises —
                     * ce qu'une page porte couramment.
                     */
                    <div
                      key={k}
                      className={`rail-carte${gagne ? ' rail-carte-gagnante' : ''}`}
                      data-rang={RARITY_ORDER[carte.rarity as Rarity] ?? 0}
                      style={{
                        ['--r' as string]: jeton ? COULEUR_JETON : m.color,
                        ['--k' as string]: String(k),
                      }}
                      aria-hidden="true"
                    >
                      {/* Le cadre peint, celui de la collection et de la fiche.
                          Une carte simplifiée ne ressemblait à rien de ce que le
                          joueur connaît — le fleuron, les volutes et le bandeau
                          de texte **sont** la carte.

                          Le cadre est une seule image WebP partagée par les
                          cent cinquante-cinq tuiles : un décodage, puis autant
                          de rendus de la même source, colorés par rareté d'une
                          rotation de teinte. Ce qui coûtait vraiment — l'ombre
                          portée que `.cadre` pose par carte — est neutralisé
                          dans le rouleau par la feuille de style. */}
                      {jeton ? (
                        /*
                         * Le jeton Winter Spin : le logo seul, sans cadre.
                         *
                         * Il en a porté un, essai fait et défait. Le cadre le
                         * rangeait parmi les cartes — même silhouette, même
                         * bandeau de texte, même insigne — alors que tout son
                         * intérêt est de **ne pas en être une** : on ne le gagne
                         * pas, on ne le garde pas, il rejoue l'emplacement et
                         * disparaît.
                         *
                         * Sans cadre ni bordure, il flotte sur le fond du
                         * bandeau au milieu de cartes encadrées, et c'est cette
                         * rupture qui le fait reconnaître d'un coup d'œil.
                         */
                        <span className="rail-jeton" aria-hidden="true">
                          <span className="rail-jeton-logo" />
                        </span>
                      ) : (
                        <CardFrame
                          cardId={carte.cardId}
                          name={carte.name}
                          description={carte.description}
                          rarity={carte.rarity}
                          glyph={carte.glyph}
                          nature={carte.nature}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Le repère, en travers de tout le bandeau. C'est lui qui fait de
            l'arrêt un évènement : sans trait, une carte immobile au milieu
            d'autres cartes immobiles n'est pas une carte gagnée. */}
        <span className="rail-repere" aria-hidden="true" />

        {/* Les fondus latéraux. Les jetons doivent avoir l'air de continuer
            au-delà du bandeau, pas d'y être coupés net. C'est un dégradé posé
            une fois, et non un flou animé — voir docs/SPEC.md §5. */}
        <span className="rail-voile rail-voile-avant" aria-hidden="true" />
        <span className="rail-voile rail-voile-apres" aria-hidden="true" />
      </div>
    </div>
  );
}
