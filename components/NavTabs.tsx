'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
  { href: '/boosters', label: 'Boosters', short: 'Boosters', icon: 'rocket' },
  { href: '/duels', label: 'Duels', short: 'Duels', icon: 'swords' },
  { href: '/regles', label: 'Règles', short: 'Règles', icon: 'book' },
  { href: '/admin', label: 'Modération', short: 'Modo', icon: 'shield', admin: true },
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
    <nav aria-label="Navigation principale" className="menu-nav">
      <ul className="menu-liens">
        {visible.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = NAV_ICONS[tab.icon];
          /* L'administration se détache : un trait au-dessus, un cyan plus
             doux. Les états (survol, actif) vivent dans `.menu-lien`. */
          const reserve = tab.admin === true;
          return (
            <li key={tab.href} className={reserve ? 'menu-reserve' : undefined}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                data-reserve={reserve ? '' : undefined}
                className="menu-lien"
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Ce qui reste au pouce, et ce qui passe derrière.
 *
 * La barre portait **tout** — jusqu'à sept onglets sur un écran de téléphone.
 * Cinquante pixels par cible, des libellés coupés au milieu d'un mot, et
 * surtout aucune hiérarchie : « Règles », qu'on lit une fois dans la saison,
 * occupait exactement la même place que « Boosters », qu'on ouvre dix fois par
 * soir.
 *
 * Quatre destinations restent en bas : le classement, les boosters, les
 * duels et les règles. L'administration tient dans un tiroir.
 */
const PRINCIPAUX = ['/', '/boosters', '/duels', '/regles'];

export function BottomNav({ isAdmin, isPlayer }: { isAdmin: boolean; isPlayer: boolean }) {
  const pathname = usePathname();
  const visible = visibleTabs(isAdmin, isPlayer);
  const [tiroir, setTiroir] = useState(false);

  const bas = visible.filter((t) => PRINCIPAUX.includes(t.href));
  const reste = visible.filter((t) => !PRINCIPAUX.includes(t.href));
  // Le bouton du tiroir s'allume quand on est sur une des pages qu'il contient :
  // sans ça, la barre entière paraît éteinte et l'on se croit nulle part.
  const dansLeTiroir = reste.some((t) => isActive(pathname, t.href));

  const classeOnglet = (actif: boolean) =>
    `flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[18px] px-1 py-1.5 no-underline transition-colors ${
      actif ? 'nav-pilule !rounded-[18px] text-ice' : 'text-muted'
    }`;

  return (
    // Le positionnement et le verre vivent sur deux nœuds distincts : `.glass`
    // déclare `position: relative`, qui écraserait un `fixed` posé sur le même
    // élément.
    <div
      className="fixed right-3 bottom-3 left-3 z-40 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/*
        Le voile qui referme le tiroir.

        Un tiroir qu'on ne peut fermer qu'en rappuyant sur le bouton qui l'a
        ouvert se referme mal au pouce : la main est déjà partie ailleurs. Tout
        le reste de l'écran le referme donc, ce qui est le geste qu'on fait
        naturellement.
      */}
      {tiroir && (
        <button
          type="button"
          className="fixed inset-0 z-0 cursor-default"
          aria-label="Fermer le menu"
          onClick={() => setTiroir(false)}
        />
      )}

      {tiroir && reste.length > 0 && (
        <nav
          id="tiroir-navigation"
          className="glass glass-strong relative z-10 mb-2 !rounded-[22px] p-1.5"
          aria-label="Autres pages"
        >
          <ul className="space-y-1">
            {reste.map((tab) => {
              const actif = isActive(pathname, tab.href);
              const Icon = NAV_ICONS[tab.icon];
              const reserve = tab.admin === true;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={actif ? 'page' : undefined}
                    onClick={() => setTiroir(false)}
                    className={`flex min-h-[52px] items-center gap-3 rounded-full px-4 no-underline transition-colors ${
                      actif
                        ? reserve
                          ? 'nav-pilule nav-pilule-admin text-aurora'
                          : 'nav-pilule text-ice'
                        : reserve
                          ? 'text-danger/80'
                          : 'text-muted'
                    }`}
                  >
                    <Icon className="h-[22px] w-[22px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold tracking-wide">
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <nav
        className="glass glass-strong relative z-10 !rounded-[22px] px-1 py-1"
        aria-label="Navigation principale"
      >
        <ul className="flex items-stretch justify-around">
          {bas.map((tab) => {
            const actif = isActive(pathname, tab.href);
            const Icon = NAV_ICONS[tab.icon];
            return (
              <li key={tab.href} className="min-w-0 flex-1">
                <Link
                  href={tab.href}
                  aria-current={actif ? 'page' : undefined}
                  onClick={() => setTiroir(false)}
                  className={classeOnglet(actif)}
                >
                  <Icon className="h-[21px] w-[21px]" />
                  {/*
                    Sous 380 px, l'icône reste seule. `sr-only` et non `hidden` :
                    le nom reste lu par les lecteurs d'écran, qui n'ont que lui —
                    l'icône, elle, est décorative.
                  */}
                  <span className="w-full truncate text-center font-display text-[13px] leading-tight font-bold tracking-wide uppercase max-[359px]:sr-only">
                    {tab.short}
                  </span>
                </Link>
              </li>
            );
          })}

          {reste.length > 0 && (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={tiroir}
                aria-controls="tiroir-navigation"
                onClick={() => setTiroir((v) => !v)}
                className={`w-full ${classeOnglet(tiroir || dansLeTiroir)}`}
              >
                <NAV_ICONS.plus className="h-[21px] w-[21px]" />
                <span className="w-full truncate text-center font-display text-[13px] leading-tight font-bold tracking-wide uppercase max-[359px]:sr-only">
                  Plus
                </span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </div>
  );
}
