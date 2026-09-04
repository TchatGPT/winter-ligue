import type { ReactNode } from 'react';

/**
 * Un titre taillé dans la glace.
 *
 * Le même bloc de glace que le titre du hero, à toutes les tailles : une masse
 * translucide, une arête claire en haut, une arête sombre en bas, une
 * épaisseur qui tombe vers le bas à droite. Le tout est fait en CSS à partir
 * du texte, redessiné par des pseudo-éléments — d'où l'attribut `data-text`,
 * qui doit porter **exactement** le même texte que l'élément.
 *
 * Trois tailles :
 *
 *  - `page` — le titre d'une page, avec son surtitre et une phrase d'accroche ;
 *  - `bloc` — le titre d'un container, en tête de plaque ;
 *  - `petit` — un titre de sous-section, dans une plaque.
 *
 * Le texte doit être une chaîne : un titre en glace ne contient ni lien ni
 * icône, puisqu'il est redessiné trois fois.
 */
export function TitreGlace({
  children,
  taille = 'bloc',
  eyebrow,
  lead,
  niveau,
  className = '',
  align = 'left',
  givre,
}: {
  children: string;
  taille?: 'page' | 'bloc' | 'petit';
  /** Le surtitre, en petites capitales espacées, au-dessus. */
  eyebrow?: string;
  /** La phrase sous le titre. */
  lead?: ReactNode;
  /** h1 pour une page, h2 pour un bloc. Déduit de la taille si absent. */
  niveau?: 1 | 2 | 3;
  className?: string;
  align?: 'left' | 'center';
  /**
   * La matière glace — masse translucide, arêtes, stries.
   *
   * Réservée au titre d'une page et au nom du site : partout ailleurs, un
   * titre de bloc est un titre de bloc, en capitales nettes. Par défaut,
   * seule la taille `page` est en glace ; un titre de la taille d'une page qui
   * n'est pas le titre de la page (le nom d'un booster dans la scène, par
   * exemple) la refuse avec `givre={false}`.
   */
  givre?: boolean;
}) {
  const Balise = (`h${niveau ?? (taille === 'page' ? 1 : taille === 'bloc' ? 2 : 3)}`) as
    | 'h1'
    | 'h2'
    | 'h3';
  const centre = align === 'center';
  const enGlace = givre ?? taille === 'page';

  return (
    <div className={`${centre ? 'text-center' : ''} ${className}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Balise className={`titre-glace titre-glace-${taille} ${eyebrow ? 'mt-1' : ''}`}>
        {enGlace ? (
          <span className="glace" data-text={children}>
            {children}
          </span>
        ) : (
          children
        )}
      </Balise>
      {lead && (
        <p
          className={`mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2 ${
            centre ? 'mx-auto' : ''
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/**
 * L'en-tête d'un container : le titre en glace à gauche, et ce qu'on veut à
 * droite — un compteur, un filtre, un bouton. Une ligne, alignée sur la base.
 */
export function EnTeteBloc({
  titre,
  eyebrow,
  droite,
  taille = 'bloc',
  className = '',
}: {
  titre: string;
  eyebrow?: string;
  droite?: ReactNode;
  taille?: 'bloc' | 'petit';
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-2 ${className}`}>
      <TitreGlace taille={taille} eyebrow={eyebrow}>
        {titre}
      </TitreGlace>
      {droite && <div className="flex items-center gap-2">{droite}</div>}
    </div>
  );
}
