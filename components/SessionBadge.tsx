'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CodeCadeau } from '@/components/CodeCadeau';
import { IconQuitter } from '@/components/icons';
import { num } from '@/lib/format';

/**
 * Pastille de session : solde de flocons, pseudo, déconnexion.
 *
 * La déconnexion passe par une requête POST — jamais un lien GET — pour qu'une
 * image ou un lien piégé sur un autre site ne puisse pas déconnecter le
 * visiteur à son insu.
 */
export function SessionBadge({
  role,
  pseudo,
  balance,
  stacked = false,
}: {
  role: 'admin' | 'joueur' | null;
  pseudo: string | null;
  balance: number | null;
  /** Disposition verticale, dans le bloc compte de la colonne. */
  stacked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    setBusy(false);
    startTransition(() => router.refresh());
  }

  /** L'avatar : une silhouette dans un cercle de verre. */
  const avatar = (
    <span className="menu-avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    </span>
  );

  if (!role) {
    return stacked ? (
      <a href="/connexion" className="btn menu-bouton no-underline">
        {avatar}
        <span>Connexion</span>
      </a>
    ) : (
      <a href="/connexion" className="btn btn-sm no-underline">
        Connexion
      </a>
    );
  }

  if (stacked) {
    return (
      <div className="space-y-3">
        {/* La capsule du solde, la même que les pastilles de stats du hero. */}
        {balance !== null && (
          <div
            className="glass glass-soft flex flex-col items-center px-2 py-3 text-center"
            title="Tes flocons — la monnaie de la saison"
          >
            <span className="num block font-display text-[20px] leading-none font-black text-ink">
              <span className="mr-1 text-[15px] text-ice" aria-hidden="true">
                ❄
              </span>
              {num(balance)}
            </span>
            <span className="mt-1.5 block text-[13px] tracking-[0.12em] text-faint uppercase">
              Flocons
            </span>
          </div>
        )}
        {balance !== null && <CodeCadeau variante="tuile" />}
        {/* Le compte : qui est connecté, et de quoi se déconnecter. Il disait
            « Modération » pour un modérateur, qu'on prenait pour un lien. */}
        <div className="menu-compte-ligne">
          {avatar}
          <span className="menu-compte-pseudo" title={pseudo ?? undefined}>
            {pseudo ?? 'Mon compte'}
          </span>
          <button
            type="button"
            className="menu-quitter"
            onClick={logout}
            disabled={busy || pending}
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <IconQuitter className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {balance !== null && (
        <span
          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 py-1 pr-1 pl-3 font-display text-sm font-bold text-ice"
          title="Tes flocons — la monnaie de la saison"
        >
          <span aria-hidden="true">❄</span>
          <span className="num">{num(balance)}</span>
          <CodeCadeau variante="pastille" />
        </span>
      )}
      <button
        className="btn btn-sm btn-ghost"
        onClick={logout}
        disabled={busy || pending}
        aria-label="Se déconnecter"
      >
        <span className="hidden sm:inline">Quitter</span>
        <span className="sm:hidden" aria-hidden="true">
          ⏻
        </span>
      </button>
    </div>
  );
}
