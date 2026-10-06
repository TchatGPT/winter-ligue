'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { NAV_ICONS, type NavIconName } from '@/components/icons';

/**
 * Le kit de la modération : la barre de navigation, l'écran, le panneau, la
 * pastille, le message flottant et le tableau triable.
 *
 * Un écran de modération tient dans la fenêtre sur un ordinateur, pied de page
 * compris : les panneaux se partagent la hauteur, et ce qui est long défile
 * dans son panneau. Sur un téléphone, tout s'empile et la page défile.
 */

/* ------------------------------ La navigation ------------------------------ */

interface Section {
  href: string;
  label: string;
  icone: NavIconName;
}

export const SECTIONS: Section[] = [
  { href: '/admin', label: 'Tableau de bord', icone: 'jauge' },
  { href: '/admin/joueurs', label: 'Joueurs', icone: 'user' },
  { href: '/admin/codes', label: 'Codes cadeaux', icone: 'cadeau' },
  { href: '/admin/saison', label: 'Subs & saison', icone: 'snowflake' },
  { href: '/admin/overlays', label: 'Overlays', icone: 'antenne' },
  { href: '/admin/journal', label: 'Journal', icone: 'book' },
];

/** La barre de la modération : son nom et ses sections. */
export function BarreAdmin() {
  const chemin = usePathname();
  return (
    <header className="glass adm-barre">
      <p className="adm-barre-nom">
        <span className="adm-barre-icone" aria-hidden="true">
          {(() => {
            const Bouclier = NAV_ICONS.shield;
            return <Bouclier className="h-5 w-5" />;
          })()}
        </span>
        Modération
      </p>
      <nav className="adm-nav" aria-label="Sections de la modération">
        {SECTIONS.map((s) => {
          const Icone = NAV_ICONS[s.icone];
          const actif = s.href === '/admin' ? chemin === s.href : chemin.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className="adm-nav-lien no-underline"
              aria-current={actif ? 'page' : undefined}
            >
              <Icone className="h-[18px] w-[18px]" />
              <span>{s.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/* ------------------------------- L'écran ------------------------------- */

/**
 * Un écran : une phrase qui dit à quoi il sert, puis ses panneaux. `grille`
 * nomme la disposition des panneaux (voir `.adm-ecran[data-grille]`).
 */
export function EcranAdmin({
  intro,
  grille,
  message,
  onFermeMessage,
  children,
}: {
  intro: ReactNode;
  grille: string;
  message?: { kind: 'success' | 'error' | 'info'; text: string } | null;
  onFermeMessage?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="adm-ecran">
      <p className="adm-intro">{intro}</p>
      <div className="adm-grille" data-grille={grille}>
        {children}
      </div>
      {message && <Toast message={message} onFerme={onFermeMessage} />}
    </div>
  );
}

/** Le message d'une action, dans un coin de l'écran : il ne pousse rien. */
function Toast({
  message,
  onFerme,
}: {
  message: { kind: 'success' | 'error' | 'info'; text: string };
  onFerme?: () => void;
}) {
  useEffect(() => {
    if (!onFerme) return;
    const t = setTimeout(onFerme, message.kind === 'error' ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [message, onFerme]);
  return (
    <div className="adm-toast" data-kind={message.kind} role="status">
      <p>{message.text}</p>
      {onFerme && (
        <button type="button" onClick={onFerme} aria-label="Fermer le message">
          ✕
        </button>
      )}
    </div>
  );
}

/* ------------------------------- Le panneau ------------------------------- */

/**
 * Un panneau : son médaillon, son titre et une phrase, ce qui se range à
 * droite, puis son corps. `defile` : le corps défile dans le panneau.
 */
export function Panneau({
  titre,
  sousTitre,
  icone,
  ton,
  actions,
  defile = false,
  zone,
  children,
}: {
  titre: string;
  sousTitre?: ReactNode;
  icone?: NavIconName;
  /** La couleur du médaillon et de l'arête : or pour ce qui attend un geste. */
  ton?: 'or' | 'glace' | 'aurore' | 'danger';
  actions?: ReactNode;
  defile?: boolean;
  /** Le nom de sa zone dans la grille de l'écran. */
  zone?: string;
  children: ReactNode;
}) {
  const Icone = icone ? NAV_ICONS[icone] : null;
  return (
    <section className="glass adm-panneau" data-ton={ton} style={zone ? { gridArea: zone } : undefined}>
      <header className="adm-panneau-tete">
        {Icone && (
          <span className="adm-panneau-icone" aria-hidden="true">
            <Icone className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2>{titre}</h2>
          {sousTitre && <p>{sousTitre}</p>}
        </div>
        {actions && <div className="adm-panneau-actions">{actions}</div>}
      </header>
      <div className="adm-panneau-corps" data-defile={defile ? '' : undefined}>
        {children}
      </div>
    </section>
  );
}

/** Une pastille : un statut, un compte. */
export function Pastille({
  ton = 'gris',
  children,
}: {
  ton?: 'or' | 'glace' | 'gris' | 'aurore' | 'violet' | 'danger';
  children: ReactNode;
}) {
  return (
    <span className="adm-pastille" data-ton={ton}>
      {children}
    </span>
  );
}

/** Un chiffre et ce qu'il compte. */
export function Mesure({
  valeur,
  libelle,
  ton,
}: {
  valeur: ReactNode;
  libelle: ReactNode;
  ton?: 'or' | 'aurore' | 'glace';
}) {
  return (
    <div className="adm-mesure" data-ton={ton}>
      <strong>{valeur}</strong>
      <span>{libelle}</span>
    </div>
  );
}

/** Ce qu'on dit quand une liste est vide. */
export function Vide({ children }: { children: ReactNode }) {
  return <p className="adm-vide">{children}</p>;
}

/* ------------------------------- Le tableau ------------------------------- */

/** Sans accents ni majuscules, pour chercher un pseudo. */
export const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface Colonne<T> {
  cle: string;
  titre: string;
  rendu: (x: T) => ReactNode;
  /** Trier par cette colonne : l'ordre croissant. */
  tri?: (a: T, b: T) => number;
  align?: 'droite';
  /** Sa largeur, en grille : `minmax(0, 2fr)`, `7rem`. */
  largeur?: string;
  /** La colonne qui fait le titre d'une ligne, sur un téléphone. */
  principale?: boolean;
}

export const parTexte =
  <T,>(f: (x: T) => string) =>
  (a: T, b: T) =>
    f(a).localeCompare(f(b), 'fr');
export const parNombre =
  <T,>(f: (x: T) => number) =>
  (a: T, b: T) =>
    f(a) - f(b);

/**
 * Un tableau qui trie : un clic sur un en-tête trie (décroissant d'abord), un
 * second inverse. L'en-tête reste en haut quand le corps défile. Sur un
 * téléphone, chaque ligne devient une carte.
 */
export function Tableau<T>({
  lignes,
  colonnes,
  cleDe,
  triDefaut,
  vide,
}: {
  lignes: T[];
  colonnes: Colonne<T>[];
  cleDe: (x: T) => string;
  triDefaut: { cle: string; desc: boolean };
  vide: ReactNode;
}) {
  const [tri, setTri] = useState(triDefaut);
  const triees = useMemo(() => {
    const ordre = colonnes.find((c) => c.cle === tri.cle)?.tri;
    return ordre ? [...lignes].sort((a, b) => (tri.desc ? -1 : 1) * ordre(a, b)) : lignes;
  }, [lignes, colonnes, tri]);
  const gabarit = colonnes.map((c) => c.largeur ?? 'minmax(0, 1fr)').join(' ');

  if (lignes.length === 0) return <Vide>{vide}</Vide>;
  return (
    <div className="adm-table" role="table" style={{ ['--gabarit' as string]: gabarit }}>
      <div className="adm-table-tete" role="row">
        {colonnes.map((c) => (
          <span
            key={c.cle}
            role="columnheader"
            data-droite={c.align === 'droite' ? '' : undefined}
            aria-sort={tri.cle === c.cle ? (tri.desc ? 'descending' : 'ascending') : undefined}
          >
            {c.tri ? (
              <button
                type="button"
                data-actif={tri.cle === c.cle ? '' : undefined}
                onClick={() =>
                  setTri((t) => (t.cle === c.cle ? { cle: c.cle, desc: !t.desc } : { cle: c.cle, desc: true }))
                }
              >
                {c.titre}
                <i aria-hidden="true">{tri.cle === c.cle ? (tri.desc ? '▼' : '▲') : '↕'}</i>
              </button>
            ) : (
              c.titre
            )}
          </span>
        ))}
      </div>
      {triees.map((x) => (
        <div key={cleDe(x)} className="adm-table-ligne" role="row">
          {colonnes.map((c) => (
            <span
              key={c.cle}
              role="cell"
              data-titre={c.titre}
              data-droite={c.align === 'droite' ? '' : undefined}
              data-principale={c.principale ? '' : undefined}
            >
              {c.rendu(x)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** La recherche d'une liste. */
export function Recherche({
  valeur,
  onChange,
  placeholder = 'Chercher un pseudo…',
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      className="field adm-recherche"
      placeholder={placeholder}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    />
  );
}

/** Des filtres en segment, chacun avec son compte. */
export function Filtres<K extends string>({
  options,
  valeur,
  onChange,
}: {
  options: { cle: K; nom: string; compte?: number }[];
  valeur: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="segment adm-filtres" role="group" aria-label="Filtrer">
      {options.map((o) => (
        <button key={o.cle} type="button" aria-pressed={valeur === o.cle} onClick={() => onChange(o.cle)}>
          {o.nom}
          {o.compte !== undefined && <span className="adm-filtre-compte">{o.compte}</span>}
        </button>
      ))}
    </div>
  );
}
