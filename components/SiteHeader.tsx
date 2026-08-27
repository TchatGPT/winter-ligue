import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { SEASON } from '@/lib/domain/rules';
import { NavTabs } from './NavTabs';
import { SessionBadge } from './SessionBadge';

/**
 * Entête et navigation. Composant serveur : la session est lue directement
 * depuis le cookie, sans passer par une requête d'API côté client, ce qui évite
 * le clignotement « déconnecté puis connecté » au chargement.
 */
export async function SiteHeader() {
  const session = await getSession();

  const balance =
    session?.role === 'joueur'
      ? await getStore().read(
          (db) => db.players.find((p) => p.id === session.sub)?.snowflakes ?? null,
        )
      : null;

  const pseudo =
    session?.role === 'joueur'
      ? await getStore().read((db) => db.players.find((p) => p.id === session.sub)?.pseudo ?? null)
      : null;

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-[rgb(5_8_15/0.88)] backdrop-blur-md">
      <header className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2 no-underline">
          <span className="font-display text-2xl font-black leading-none tracking-wide text-ink sm:text-3xl">
            WINTER
            <span className="text-ice [text-shadow:var(--glow-ice)]"> LIGUE</span>
          </span>
        </Link>
        <span className="hidden text-[10px] uppercase tracking-[0.28em] text-faint sm:block">
          Call of Duty Warzone
        </span>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight md:block">
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint">Saison</div>
            <div className="font-display text-xs font-bold text-ice">{SEASON.edition}</div>
          </div>
          <SessionBadge
            role={session?.role ?? null}
            pseudo={pseudo}
            balance={balance}
          />
        </div>
      </header>

      <NavTabs isAdmin={session?.role === 'admin'} isPlayer={session?.role === 'joueur'} />
    </div>
  );
}
