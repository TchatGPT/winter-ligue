import { IconClaude, IconSnowflake } from './icons';

/**
 * Le pied de page, sous chaque page du site — jamais sur un overlay du stream,
 * que la mise en page rend à part. Une bande sur toute la largeur, collée au
 * bas de la page comme le menu l'est au bord gauche : c'est le cadre du site,
 * pas un bloc de plus. La marque et les droits de la saison, et la signature
 * de ceux qui ont fait le site, avec le symbole de Claude.
 *
 * `barreMobile` : connecté, une barre de navigation flotte en bas de l'écran
 * des téléphones. La bande se prolonge dessous, et son contenu reste au-dessus.
 */
export function PiedDePage({ barreMobile = false }: { barreMobile?: boolean }) {
  return (
    <footer className="pied-de-page" data-barre={barreMobile ? '' : undefined}>
      <div className="pied-de-page-marque">
        <span className="menu-logo grid h-10 w-10 shrink-0 place-items-center" aria-hidden="true">
          <IconSnowflake className="h-5 w-5" />
        </span>
        <span>
          <span className="pied-de-page-nom">
            <span className="givre-texte">Winter</span> <em className="menu-titre-ligue">Ligue</em>
          </span>
          <span className="pied-de-page-droits">© 2026-2027 · Tous droits réservés</span>
        </span>
      </div>
      <p className="pied-de-page-credit">
        <span>
          Développé par <strong>Jeex3</strong> &amp; <strong>Claude</strong>
        </span>
        <span className="pied-de-page-claude" aria-hidden="true">
          <IconClaude />
        </span>
      </p>
    </footer>
  );
}
