'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
  /** Disposition verticale, pour le pied de la colonne latérale. */
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

  if (!role) {
    return (
      <a href="/connexion" className={`btn btn-sm no-underline ${stacked ? 'w-full' : ''}`}>
        Connexion
      </a>
    );
  }

  const flakesPill = balance !== null && (
    <span
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-sm font-bold ${
        stacked ? 'justify-center' : ''
      }`}
      style={{
        background: 'linear-gradient(155deg, rgba(143,220,255,0.22), rgba(28,138,194,0.08))',
        border: '1px solid rgba(190,230,255,0.3)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
        color: 'var(--frost)',
      }}
      title="Tes flocons — la monnaie de la saison"
    >
      <span aria-hidden="true">❄</span>
      <span className="num">{num(balance)}</span>
    </span>
  );

  if (stacked) {
    return (
      <div className="space-y-2">
        {flakesPill}
        <div className="truncate text-center font-display text-sm font-bold tracking-wide text-muted uppercase">
          {role === 'admin' ? 'Modération' : pseudo}
        </div>
        <button className="btn btn-sm btn-ghost w-full" onClick={logout} disabled={busy || pending}>
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {flakesPill}
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
