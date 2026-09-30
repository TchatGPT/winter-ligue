import type { ReactNode } from 'react';
import { NAV_ICONS, type NavIconName } from '@/components/icons';

/**
 * L'en-tête d'une page : une plaque de verre, et tout ce qui dit où l'on est.
 *
 * Le titre et sa phrase étaient posés à même la photo. Clairs sur un ciel
 * clair, sans appui, ils flottaient et se lisaient mal. Ils ont maintenant leur
 * plaque, la même matière que les containers, sur toute la largeur : l'icône
 * de la page dans son médaillon, le surtitre, le titre, et la phrase à côté,
 * séparée par un filet.
 *
 * Le titre est dans la glace pleine du site (`.glace`), une chaîne seulement :
 * la matière redessine le texte à partir de `data-text`.
 */
export function EnTetePage({
  titre,
  eyebrow,
  lead,
  icone,
  droite,
}: {
  titre: string;
  eyebrow?: string;
  /** La phrase qui dit à quoi sert la page. */
  lead?: ReactNode;
  /** L'icône de la page, la même que dans le menu. */
  icone?: NavIconName;
  /** Ce qui se range à droite : un lien, un bouton, un chiffre. */
  droite?: ReactNode;
}) {
  const Icone = icone ? NAV_ICONS[icone] : null;
  return (
    <header className="glass entete-page">
      <div className="entete-page-titre">
        {Icone && (
          <span className="entete-page-icone" aria-hidden="true">
            <Icone className="h-7 w-7" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={`titre-glace titre-glace-page ${eyebrow ? 'mt-1.5' : ''}`}>
            <span className="glace" data-text={titre}>
              {titre}
            </span>
          </h1>
        </div>
      </div>
      {lead && <p className="entete-page-lead">{lead}</p>}
      {droite && <div className="entete-page-droite">{droite}</div>}
    </header>
  );
}
