import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { SEASON, nextMilestone } from '@/lib/domain/rules';
import { BottomNav, SidebarNav } from './NavTabs';
import { SessionBadge } from './SessionBadge';
import { IconSnowflake } from './icons';
import { Meter, flakes } from './ui';

/** Largeur de la colonne. Reprise dans le décalage du contenu, dans `layout.tsx`. */
export const SIDEBAR_WIDTH = 272;

/**
 * Colonne de navigation et entête mobile.
 *
 * Composant serveur : la session est lue directement depuis le cookie, sans
 * requête d'API côté client — pas de clignotement « déconnecté puis connecté »
 * au chargement.
 */
export async function Sidebar() {
  const session = await getSession();
  const isAdmin = session?.role === 'admin';
  const isPlayer = session?.role === 'joueur';

  const { player, totalSubs } = await getStore().read((db) => {
    const found = isPlayer ? db.players.find((p) => p.id === session!.sub) : undefined;
    return {
      player: found ? { pseudo: found.pseudo, snowflakes: found.snowflakes } : null,
      totalSubs: db.config.totalSubs,
    };
  });

  const next = nextMilestone(totalSubs);

  const brand = (
    <Link href="/" className="flex items-center gap-3 no-underline">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-ice"
        style={{
          background: 'linear-gradient(155deg, rgba(143,220,255,0.26), rgba(28,138,194,0.10))',
          border: '1px solid rgba(190,230,255,0.34)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <IconSnowflake className="h-6 w-6" />
      </span>
      <span className="min-w-0 leading-none">
        <span className="block font-display text-[22px] font-black tracking-tight text-ink">
          WINTER<span className="text-ice"> LIGUE</span>
        </span>
        <span className="mt-1 block text-[10.5px] tracking-[0.14em] text-faint uppercase">
          Call of Duty Warzone
        </span>
      </span>
    </Link>
  );

  return (
    <>
      {/* ---------------- Colonne, à partir de lg ---------------- */}
      <div
        className="fixed inset-y-0 left-0 z-30 hidden p-4 lg:block"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="glass flex h-full flex-col gap-5 overflow-y-auto px-4 py-5">
          {brand}

          <div className="border-t border-white/8 pt-4">
            <SidebarNav isAdmin={isAdmin} isPlayer={isPlayer} />
          </div>

          {/* Le compteur de subs vit ici : c'est l'information qu'on regarde
              le plus souvent pendant un live, elle doit rester à l'écran. */}
          {next && (
            <div className="mt-auto rounded-2xl border border-white/10 bg-white/4 px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-[12px] font-bold tracking-[0.16em] text-violet uppercase">
                  Subs
                </span>
                <span className="num font-display text-lg leading-none font-black text-ink">
                  {flakes(totalSubs)}
                </span>
              </div>
              <div className="mt-2">
                <Meter ratio={next.progress} color="#a98cff" />
              </div>
              <p className="mt-2 text-[12px] leading-snug text-faint">
                {next.milestone.label} dans{' '}
                <strong className="text-ink-2">{next.remaining}</strong>
              </p>
            </div>
          )}

          <div className="space-y-3 border-t border-white/8 pt-4">
            <div className="text-[11px] tracking-[0.18em] text-faint uppercase">
              {SEASON.edition}
            </div>
            <SessionBadge
              role={session?.role ?? null}
              pseudo={player?.pseudo ?? null}
              balance={player?.snowflakes ?? null}
              stacked
            />
          </div>
        </div>
      </div>

      {/* ---------------- Entête, sous lg ---------------- */}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4 lg:hidden">
        <div className="glass flex items-center gap-3 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
            <span
              className="grid h-10 w-10 place-items-center rounded-2xl text-ice"
              style={{
                background:
                  'linear-gradient(155deg, rgba(143,220,255,0.26), rgba(28,138,194,0.10))',
                border: '1px solid rgba(190,230,255,0.34)',
              }}
            >
              <IconSnowflake className="h-5 w-5" />
            </span>
            <span className="font-display text-xl font-black tracking-tight text-ink">
              WINTER<span className="text-ice"> LIGUE</span>
            </span>
          </Link>

          <div className="ml-auto shrink-0">
            <SessionBadge
              role={session?.role ?? null}
              pseudo={player?.pseudo ?? null}
              balance={player?.snowflakes ?? null}
            />
          </div>
        </div>
      </header>

      <BottomNav isAdmin={isAdmin} isPlayer={isPlayer} />
    </>
  );
}
