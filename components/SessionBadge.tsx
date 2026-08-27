'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Pastille de session : solde de flocons, pseudo, et déconnexion.
 *
 * La déconnexion passe par une requête POST — jamais un lien GET — pour qu'une
 * image ou un lien piégé sur un autre site ne puisse pas déconnecter le
 * visiteur à son insu.
 */
export function SessionBadge({
  role,
  pseudo,
  balance,
}: {
  role: 'admin' | 'joueur' | null;
  pseudo: string | null;
  balance: number | null;
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
      <a href="/connexion" className="btn btn-sm">
        Connexion
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {balance !== null && (
        <span
          className="badge border-ice/40 text-ice"
          title="Tes flocons — la monnaie de la saison"
        >
          ❄ <span className="num">{balance.toLocaleString('fr-FR')}</span>
        </span>
      )}
      <span className="hidden font-display text-xs font-bold uppercase tracking-wider text-muted sm:inline">
        {role === 'admin' ? 'Modération' : pseudo}
      </span>
      <button className="btn btn-sm" onClick={logout} disabled={busy || pending}>
        Quitter
      </button>
    </div>
  );
}
