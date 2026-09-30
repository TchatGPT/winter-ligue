'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Notice } from '@/components/ui';
import type { Message } from '@/components/admin/action';
import { NAV_ICONS, type NavIconName } from '@/components/icons';
import { SnowCap } from '@/components/SnowCap';

export interface Section {
  href: string;
  label: string;
  icone: NavIconName;
}

/**
 * Les sections de l'espace, dans l'ordre où on s'en sert.
 *
 * Il n'y a plus ici ni ouverture de booster, ni saisie de game, ni réglage des
 * taux : les boosters s'ouvrent sur leur page, à l'antenne ; les games se
 * saisissent depuis le classement ; les taux sont ceux du catalogue. L'espace
 * garde ce qui ne se fait nulle part ailleurs — les joueurs, les subs, les
 * overlays du stream, le journal.
 */
export const SECTIONS: Section[] = [
  { href: '/admin', label: 'Vue d’ensemble', icone: 'jauge' },
  { href: '/admin/joueurs', label: 'Joueurs', icone: 'user' },
  { href: '/admin/saison', label: 'Saison', icone: 'snowflake' },
  { href: '/admin/overlays', label: 'Overlays', icone: 'antenne' },
  { href: '/admin/journal', label: 'Journal', icone: 'book' },
];

/** La navigation de l'espace : des pastilles, l'active en glace pleine. */
export function AdminNav() {
  const chemin = usePathname();

  return (
    <nav className="admin-nav scroll-x-clean" aria-label="Sections de l’administration">
      {SECTIONS.map((s) => {
        const Icone = NAV_ICONS[s.icone];
        // Comparaison exacte pour la racine, sinon `/admin` resterait actif
        // sur toutes les sous-sections.
        const actif = s.href === '/admin' ? chemin === s.href : chemin.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            className="admin-onglet no-underline"
            data-actif={actif ? '' : undefined}
            aria-current={actif ? 'page' : undefined}
          >
            <Icone className="h-[18px] w-[18px]" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * L'entête d'un écran d'administration.
 *
 * Un titre, une phrase qui dit à quoi sert l'écran, et la place du message de
 * retour. Cette place est fixe d'un écran à l'autre : une confirmation qui
 * apparaît tantôt en haut tantôt au milieu se rate.
 */
export function Ecran({
  titre,
  lead,
  message,
  actions,
  children,
}: {
  titre: string;
  lead?: React.ReactNode;
  message?: Message | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="admin-ecran-tete">
        <div className="min-w-0">
          <h2 className="admin-ecran-titre">{titre}</h2>
          {lead && <p className="admin-ecran-lead">{lead}</p>}
        </div>
        {actions}
      </div>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {children}
    </div>
  );
}

/**
 * Un bloc de contenu : une plaque de verre, son médaillon, son titre, et la
 * phrase qui dit quand s'en servir. La neige ne coiffe que les blocs qu'on
 * lui désigne — partout, elle ne se remarquerait plus.
 */
export function Bloc({
  titre,
  aide,
  icone,
  neige,
  actions,
  className,
  children,
}: {
  titre: string;
  aide?: React.ReactNode;
  icone?: NavIconName;
  /** La graine de la neige posée sur le bloc ; sans elle, pas de neige. */
  neige?: string;
  /** Ce qui se range à droite du titre : un lien, un bouton. */
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const Icone = icone ? NAV_ICONS[icone] : null;
  return (
    <section className={`glass admin-bloc ${neige ? 'admin-bloc-neige' : ''} ${className ?? ''}`}>
      {neige && <SnowCap radius="var(--r-lg)" seed={neige} epaisseur={14} />}
      <header className="admin-bloc-tete">
        {Icone && (
          <span className="admin-medaillon" aria-hidden="true">
            <Icone className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="admin-bloc-titre">{titre}</h3>
          {aide && <p className="admin-bloc-aide">{aide}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="admin-bloc-corps">{children}</div>
    </section>
  );
}

/** Un chiffre de la vue d'ensemble : son nom, sa valeur, et ce qu'il veut dire. */
export function Chiffre({
  label,
  valeur,
  note,
  accent,
}: {
  label: string;
  valeur: React.ReactNode;
  note?: React.ReactNode;
  accent?: 'ice' | 'aurora' | 'gold';
}) {
  return (
    <div className="glass admin-chiffre" data-accent={accent}>
      <span>{label}</span>
      <strong>{valeur}</strong>
      {note && <em>{note}</em>}
    </div>
  );
}
