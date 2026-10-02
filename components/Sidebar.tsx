import Link from 'next/link';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { BottomNav, SidebarNav } from './NavTabs';
import { SessionBadge } from './SessionBadge';
import { etatCadeau } from '@/lib/services/cadeauDuJour';
import { IconSnowflake } from './icons';

/** Largeur de la plaque, et la marge qui la décolle des bords de l'écran. */
export const SIDEBAR_WIDTH = 270;

/**
 * La colonne de navigation : une plaque de verre dépoli, la même que les
 * cartes de la page.
 *
 * Elle flotte à seize pixels des bords, avec sa crête de neige en haut, et
 * le fond du site se voit au travers. Dedans, de haut en bas : l'entête, la
 * navigation, puis le compte, calé en bas. Rien d'illustré : la matière, la
 * crête et le titre givré sont ceux du reste du site, par les mêmes classes
 * et le même composant `SnowCap`.
 *
 * Composant serveur : la session est lue depuis le cookie, sans requête d'API
 * côté client, donc pas de clignotement « déconnecté puis connecté ».
 */
export async function Sidebar() {
  const session = await getSession();
  const isAdmin = session?.role === 'admin';
  const isPlayer = playerIdOf(session) !== null;

  const { player, cadeau } = await getStore().read((db) => {
    const found = isPlayer ? db.players.find((p) => p.id === session!.sub) : undefined;
    return {
      player: found ? { pseudo: found.pseudo, snowflakes: found.snowflakes } : null,
      cadeau: found ? etatCadeau(db, found.id) : null,
    };
  });

  return (
    <>
      {/* ---------------- La plaque, à partir de lg ---------------- */}
      <aside
        className="menu-verre glass fixed z-30 hidden lg:flex"
        style={{ width: SIDEBAR_WIDTH, left: 0, top: 0, bottom: 0 }}
        aria-label="Navigation principale"
      >
        <div className="menu-colonne">
          {/* ---- L'entête ---- */}
          <Link href="/" className="menu-entete no-underline">
            <span className="menu-logo grid h-11 w-11 shrink-0 place-items-center">
              <IconSnowflake className="h-6 w-6" />
            </span>
            <span className="min-w-0 leading-none">
              <span className="block font-display text-[22px] font-black tracking-tight">
                <span className="givre-texte">WINTER</span> <em className="menu-titre-ligue">LIGUE</em>
              </span>
              <span className="mt-1.5 block text-[13px] tracking-[0.1em] whitespace-nowrap text-white/90 uppercase">
                Call of Duty Warzone
              </span>
            </span>
          </Link>
          <span className="menu-separateur" aria-hidden="true" />

          {/* ---- La navigation ---- */}
          <SidebarNav isAdmin={isAdmin} isPlayer={isPlayer} />

          {/* ---- Le compte, calé en bas ---- */}
          <div className="menu-compte mt-auto">
            <SessionBadge
              role={session?.role ?? null}
              pseudo={player?.pseudo ?? null}
              balance={player?.snowflakes ?? null}
              cadeau={cadeau}
              stacked
            />
          </div>
        </div>
      </aside>

      {/* ---------------- Entête, sous lg ----------------
          Sous 520 px, le logo seul : le solde, ses deux pastilles et la
          déconnexion ne laissaient au nom que « WINTE… ». */}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4 lg:hidden">
        <div className="glass flex items-center gap-3 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 no-underline">
            <span className="menu-logo grid h-10 w-10 place-items-center">
              <IconSnowflake className="h-5 w-5" />
            </span>
            <span className="truncate font-display text-xl font-black tracking-tight max-[519px]:sr-only">
              <span className="givre-texte">WINTER</span> <em className="menu-titre-ligue">LIGUE</em>
            </span>
          </Link>

          <div className="ml-auto shrink-0">
            <SessionBadge
              role={session?.role ?? null}
              pseudo={player?.pseudo ?? null}
              balance={player?.snowflakes ?? null}
              cadeau={cadeau}
            />
          </div>
        </div>
      </header>

      <BottomNav isAdmin={isAdmin} isPlayer={isPlayer} />
    </>
  );
}
