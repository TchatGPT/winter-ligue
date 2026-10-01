import { IconClaude, IconSnowflake } from './icons';
import { SnowCap } from './SnowCap';

/**
 * Le pied de page, sous chaque page du site — jamais sur un overlay du stream,
 * que la mise en page rend à part. Un bloc de verre comme les autres : la
 * marque et les droits de la saison, et la signature de ceux qui ont fait le
 * site, avec le symbole de Claude.
 *
 * Sur téléphone, sa marge basse dégage la barre de navigation flottante : c'est
 * lui, et non le contenu, qui porte la réserve du bas de page.
 */
export function PiedDePage() {
  return (
    <footer className="pied-de-page">
      <div className="pied-de-page-bloc glass">
        <SnowCap radius="var(--r-lg)" seed="pied-de-page" epaisseur={12} />
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
      </div>
    </footer>
  );
}
