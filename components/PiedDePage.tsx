import { IconClaude } from './icons';

/**
 * Le pied de page, sous chaque page du site — jamais sur un overlay du stream,
 * que la mise en page rend à part : les droits de la saison, et qui a fait le
 * site, signé du symbole de Claude.
 *
 * Sur téléphone, sa marge basse dégage la barre de navigation flottante : c'est
 * lui, et non plus le contenu, qui porte la réserve du bas de page.
 */
export function PiedDePage() {
  return (
    <footer className="pied-de-page">
      <div className="pied-de-page-ligne">
        <p>© 2026-2027 · Tous droits réservés — Winter Ligue</p>
        <p className="pied-de-page-credit">
          <span>
            Développé par <strong>Jeex3</strong> &amp; <strong>Claude</strong>
          </span>
          <IconClaude className="pied-de-page-claude" />
        </p>
      </div>
    </footer>
  );
}
