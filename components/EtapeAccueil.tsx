'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Une étape de la ligue, sur l'accueil : un bloc de glace, en relief — sa
 * face, son dessus, son côté. Le numéro et le thème en haut, l'icône gravée
 * dans une bille, un verbe en titre, puis la phrase, ses chiffres en gras.
 * La lumière prise dans la glace est à la couleur de l'étape (`teinte`).
 *
 * Le bloc est un bouton (13/11/2026) : il ouvre le détail de l'étape, tout ce
 * qu'il faut savoir, en quelques lignes numérotées.
 */
export function EtapeAccueil({
  numero,
  teinte,
  theme,
  icone,
  titre,
  children,
  detail,
}: {
  numero: number;
  /** Une couleur du thème : `var(--gold)`… */
  teinte: string;
  theme: string;
  icone: ReactNode;
  titre: string;
  /** La phrase du bloc. */
  children: ReactNode;
  /** Le détail, dans sa fenêtre : une liste, puis d'éventuelles précisions. */
  detail: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const style = { ['--teinte' as string]: teinte, ['--rang' as string]: numero - 1 } as CSSProperties;
  return (
    <li className="acc-etape" style={style}>
      <button type="button" className="acc-etape-bouton" onClick={() => setOuvert(true)}>
        <span className="acc-etape-tete">
          <span className="acc-etape-num" aria-hidden="true">
            {String(numero).padStart(2, '0')}
          </span>
          <span className="acc-etape-theme">{theme}</span>
          <span className="acc-etape-plus">
            <span className="acc-etape-plus-mot">Détail</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h13m-5-5 5 5-5 5" />
            </svg>
          </span>
          <span className="acc-etape-icone" aria-hidden="true">
            {icone}
          </span>
        </span>
        <span className="acc-etape-titre">{titre}</span>
        <span className="acc-etape-texte">{children}</span>
      </button>
      {ouvert && (
        <DetailEtape numero={numero} theme={theme} titre={titre} icone={icone} style={style} onClose={() => setOuvert(false)}>
          {detail}
        </DetailEtape>
      )}
    </li>
  );
}

function DetailEtape({
  numero,
  theme,
  titre,
  icone,
  style,
  onClose,
  children,
}: {
  numero: number;
  theme: string;
  titre: string;
  icone: ReactNode;
  style: CSSProperties;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', echap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', echap);
      document.body.style.overflow = avant;
    };
  }, [onClose]);
  const id = `etape-${numero}-titre`;
  return createPortal(
    <div className="fenetre-voile" role="dialog" aria-modal="true" aria-labelledby={id} onClick={onClose}>
      <div className="fenetre-carte etape-fenetre glass" style={style} onClick={(e) => e.stopPropagation()}>
        <header className="etape-fenetre-tete">
          <span className="acc-etape-icone etape-fenetre-icone" aria-hidden="true">
            {icone}
          </span>
          <span className="min-w-0 flex-1">
            <span className="etape-fenetre-sur">
              {String(numero).padStart(2, '0')} · {theme}
            </span>
            <h2 id={id}>{titre}</h2>
          </span>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Fermer" autoFocus>
            ✕
          </button>
        </header>
        <div className="etape-fenetre-corps">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
