'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ICONS, type NavIconName } from './icons';

interface Tab {
  href: string;
  label: string;
  /** Libellé raccourci pour la barre du bas, où la place manque. */
  short: string;
  icon: NavIconName;
  admin?: boolean;
  player?: boolean;
}

const TABS: Tab[] = [
  { href: '/', label: 'Classement', short: 'Classement', icon: 'trophy' },
  { href: '/boosters', label: 'Boosters', short: 'Boosters', icon: 'pack' },
  { href: '/marche', label: 'Hôtel des ventes', short: 'Marché', icon: 'gavel' },
  {
    href: '/ma-collection',
    label: 'Ma collection',
    short: 'Collection',
    icon: 'layers',
    player: true,
  },
  { href: '/regles', label: 'Règles', short: 'Règles', icon: 'book' },
  { href: '/admin', label: 'Modération', short: 'Modé', icon: 'gear', admin: true },
];

function visibleTabs(isAdmin: boolean, isPlayer: boolean) {
  return TABS.filter((tab) => {
    if (tab.admin && !isAdmin) return false;
    if (tab.player && !isPlayer) return false;
    return true;
  });
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Colonne de navigation, sur écran large.
 *
 * Masquer un onglet n'est qu'un confort d'affichage : `/admin` revérifie la
 * session côté serveur, et chaque route d'API la revérifie de son côté. Taper
 * l'URL directement ne donne aucun accès.
 */
export function SidebarNav({ isAdmin, isPlayer }: { isAdmin: boolean; isPlayer: boolean }) {
  const pathname = usePathname();
  const visible = visibleTabs(isAdmin, isPlayer);

  return (
    <nav aria-label="Navigation principale">
      <ul className="space-y-1">
        {visible.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = NAV_ICONS[tab.icon];
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex min-h-[46px] items-center gap-3 rounded-2xl px-3.5 py-2.5 no-underline transition-colors ${
                  active
                    ? 'bg-ice/12 text-ice'
                    : 'text-muted hover:bg-white/6 hover:text-ink'
                }`}
                style={
                  active
                    ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)' }
                    : undefined
                }
              >
                <Icon className="h-[22px] w-[22px] shrink-0" />
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-wide">
                  {tab.label}
                </span>
                {active && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-ice"
                    style={{ boxShadow: '0 0 10px var(--ice)' }}
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Barre de navigation du bas, sur mobile.
 *
 * Une colonne latérale mangerait la moitié d'un écran de téléphone. Une barre
 * fixe met tout à portée du pouce, avec des cibles de 56 px.
 */
export function BottomNav({ isAdmin, isPlayer }: { isAdmin: boolean; isPlayer: boolean }) {
  const pathname = usePathname();
  const visible = visibleTabs(isAdmin, isPlayer);

  return (
    // Le positionnement et le verre vivent sur deux nœuds distincts : `.glass`
    // déclare `position: relative`, qui écraserait un `fixed` posé sur le même
    // élément.
    <div
      className="fixed right-3 bottom-3 left-3 z-40 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <nav
        className="glass glass-strong !rounded-[22px] px-1 py-1"
        aria-label="Navigation principale"
      >
        <ul className="flex items-stretch justify-around">
          {visible.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = NAV_ICONS[tab.icon];
            return (
              <li key={tab.href} className="min-w-0 flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 no-underline transition-colors ${
                    active ? 'bg-ice/14 text-ice' : 'text-muted'
                  }`}
                >
                  <Icon className="h-[21px] w-[21px]" />
                  <span className="w-full truncate text-center font-display text-[11px] leading-tight font-bold tracking-wide uppercase">
                    {tab.short}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
