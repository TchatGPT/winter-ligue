import type { CSSProperties, ReactNode } from 'react';

/**
 * Une étape de la ligue, sur l'accueil : un bloc de glace, en relief — sa
 * face, son dessus, son côté. Le numéro et le thème en haut, l'icône gravée
 * dans une bille, un verbe en titre, puis la phrase, ses chiffres en gras.
 * La lumière prise dans la glace est à la couleur de l'étape (`teinte`).
 *
 * L'essentiel seulement (13/11/2026) : le détail est dans les règles, une
 * fois connecté.
 */
export function EtapeAccueil({
  numero,
  teinte,
  theme,
  icone,
  titre,
  children,
}: {
  numero: number;
  /** Une couleur du thème : `var(--gold)`… */
  teinte: string;
  theme: string;
  icone: ReactNode;
  titre: string;
  /** La phrase du bloc. */
  children: ReactNode;
}) {
  return (
    <li
      className="acc-etape"
      style={{ ['--teinte' as string]: teinte, ['--rang' as string]: numero - 1 } as CSSProperties}
    >
      <div className="acc-etape-corps">
        <header className="acc-etape-tete">
          <span className="acc-etape-num" aria-hidden="true">
            {String(numero).padStart(2, '0')}
          </span>
          <span className="acc-etape-theme">{theme}</span>
          <span className="acc-etape-icone" aria-hidden="true">
            {icone}
          </span>
        </header>
        <h3 className="acc-etape-titre">{titre}</h3>
        <p className="acc-etape-texte">{children}</p>
      </div>
    </li>
  );
}
