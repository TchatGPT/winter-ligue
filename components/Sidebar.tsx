import Link from 'next/link';
import { getSession, playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { BottomNav, SidebarNav } from './NavTabs';
import { SessionBadge } from './SessionBadge';
import { DeriveNeige } from './GivreCristaux';
import { IconSnowflake } from './icons';

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
  // Les deux échelons voient l'onglet ; la page décide ensuite quoi montrer.
  const isAdmin = session?.role === 'admin' || session?.role === 'moderateur';
  const isPlayer = playerIdOf(session) !== null;

  const { player } = await getStore().read((db) => {
    const found = isPlayer ? db.players.find((p) => p.id === session!.sub) : undefined;
    return {
      player: found ? { pseudo: found.pseudo, snowflakes: found.snowflakes } : null,
    };
  });

  const brand = (
    <Link href="/" className="menu-logo flex items-center gap-3 no-underline">
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
        className="fixed inset-y-0 left-0 z-30 hidden lg:block"
        style={{ width: SIDEBAR_WIDTH }}
      >
        {/* Collé au bord : pas de marge, pas de coin arrondi, une seule arête
            à droite. Un menu qui flotte dans une marge fait « widget » ; celui-ci
            est le bord de l'écran. */}
        {/* Le panneau lui-même est gelé : trois couches de matière sous le
            contenu — le fond, la texture de givre, le dépôt inégal — et une
            arête de glace sur le bord droit. Le texte reste net au-dessus. */}
        <div className="glass menu-colle givre-surface flex h-full flex-col gap-5 overflow-y-auto px-4 py-5">
          <span className="givre-surface-couches" aria-hidden="true" />
          {/* Les dégradés des icônes : un trait de verre teinté, clair en haut,
              bleu en bas ; le logo reçoit en plus un reflet oblique. */}
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <linearGradient id="icone-deg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24">
                <stop offset="0" stopColor="#e8f4ff" />
                <stop offset="1" stopColor="#7ba8cc" />
              </linearGradient>
              <linearGradient id="icone-deg-logo" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0" stopColor="#d6ecff" />
                <stop offset="0.42" stopColor="#ffffff" />
                <stop offset="0.5" stopColor="#c2e2ff" />
                <stop offset="1" stopColor="#6f9fc6" />
              </linearGradient>
            </defs>
          </svg>
          <DeriveNeige />
          {brand}

          <div className="pt-1">
            <SidebarNav isAdmin={isAdmin} isPlayer={isPlayer} />
          </div>

          <div className="mt-auto">
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
          {/* `min-w-0` sur le lien, et non `shrink-0` : c'est le titre qui doit
              céder quand la place manque, jamais la pastille de session — le
              solde et la sortie sont les deux seules commandes de cette barre. */}
          <Link href="/" className="flex min-w-0 items-center gap-2.5 no-underline">
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
            {/* Sous 380 px, le blason suffit : il est déjà l'accès à l'accueil,
                et le nom du site poussait la pastille de session hors du cadre. */}
            <span className="truncate font-display text-xl font-black tracking-tight text-ink max-[379px]:sr-only">
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
