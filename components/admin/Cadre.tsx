'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Notice } from '@/components/ui';
import type { Message } from '@/components/admin/action';
import { TitreGlace } from '@/components/TitreGlace';

export interface Section {
  href: string;
  label: string;
  /** Réservée aux administrateurs : elle touche aux règles, pas au quotidien. */
  admin?: boolean;
}

/**
 * Les sections de l'espace, dans l'ordre où on s'en sert.
 *
 * Le quotidien d'abord — saisir une game est le geste de chaque soir de live —
 * puis ce qui se règle une fois par saison, puis le journal. Les deux entrées
 * réservées sont marquées : ce qui touche à l'économie et aux droits ne se
 * confond pas avec ce qui fait tourner la ligue.
 */
export const SECTIONS: Section[] = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/joueurs', label: 'Joueurs' },
  { href: '/admin/cartes', label: 'Cartes' },
  { href: '/admin/saison', label: 'Saison' },
  { href: '/admin/boosters', label: 'Boosters', admin: true },
  { href: '/admin/journal', label: 'Journal' },
];

/** La navigation de l'espace, en onglets. */
export function AdminNav({ estAdmin }: { estAdmin: boolean }) {
  const chemin = usePathname();
  const visibles = SECTIONS.filter((s) => !s.admin || estAdmin);

  return (
    <nav className="scroll-x-clean border-b border-white/10">
      <div className="flex min-w-max gap-5">
        {visibles.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="tab no-underline"
            // Comparaison exacte pour la racine, sinon `/admin` resterait actif
            // sur toutes les sous-sections.
            data-active={s.href === '/admin' ? chemin === s.href : chemin.startsWith(s.href)}
          >
            {s.label}
            {s.admin && <span className="tab-count">admin</span>}
          </Link>
        ))}
      </div>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <TitreGlace taille="bloc">{titre}</TitreGlace>
          {lead && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-faint">{lead}</p>}
        </div>
        {actions}
      </div>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      {children}
    </div>
  );
}

/** Un bloc de contenu dans un écran. */
export function Bloc({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-4 sm:p-5">
      <h3 className="font-display text-base font-black tracking-wide text-ice uppercase">
        {titre}
      </h3>
      {aide && <p className="mt-1 text-[13px] leading-relaxed text-faint">{aide}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
