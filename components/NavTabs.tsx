'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
  /** Onglet réservé à la modération. */
  admin?: boolean;
  /** Onglet visible seulement une fois connecté en joueur. */
  player?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Classement' },
  { href: '/cartes', label: 'Cartes' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/marche', label: 'Hôtel des ventes' },
  { href: '/ma-collection', label: 'Ma collection', player: true },
  { href: '/regles', label: 'Règles' },
  { href: '/admin', label: 'Modération', admin: true },
];

/**
 * Onglets de navigation.
 *
 * Masquer un onglet n'est qu'un confort d'affichage : la page `/admin`
 * revérifie la session côté serveur. Naviguer à l'URL directement ne donne
 * donc aucun accès.
 */
export function NavTabs({ isAdmin, isPlayer }: { isAdmin: boolean; isPlayer: boolean }) {
  const pathname = usePathname();

  const visible = TABS.filter((tab) => {
    if (tab.admin && !isAdmin) return false;
    if (tab.player && !isPlayer) return false;
    return true;
  });

  return (
    <nav className="scroll-x mx-auto w-full max-w-[1180px] px-4 sm:px-6">
      <ul className="flex min-w-max items-stretch gap-1">
        {visible.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`block border-b-2 px-3 py-2.5 font-display text-xs font-bold uppercase tracking-[0.1em] no-underline transition-colors ${
                  active
                    ? 'border-ice text-ice'
                    : 'border-transparent text-muted hover:border-line-bright hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
