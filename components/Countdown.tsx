'use client';

import { useEffect, useState } from 'react';

/**
 * Compte à rebours d'une vente.
 *
 * Purement cosmétique : quand il atteint zéro, la vente n'est pas close pour
 * autant — c'est le serveur qui tranche, à la première lecture du marché ou au
 * passage du cron. Une horloge client avancée ne donne donc aucun avantage.
 */
export function Countdown({
  endsAt,
  onExpire,
}: {
  endsAt: string;
  onExpire?: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(endsAt).getTime() - Date.now()),
  );

  useEffect(() => {
    // Pas de mise à jour synchrone ici : la première replacerait le compteur
    // d'une seconde à peine, au prix d'un rendu en cascade. L'intervalle
    // rattrape tout seul, y compris quand l'anti-snipe repousse la clôture.
    const timer = setInterval(() => {
      const left = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(timer);
    // `onExpire` est volontairement hors dépendances : une nouvelle référence
    // à chaque rendu du parent relancerait l'intervalle sans arrêt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  if (remaining === 0) {
    return <span className="text-faint">Terminée</span>;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Sous une minute : on passe en rouge, c'est la fenêtre anti-sniping.
  const urgent = remaining < 60_000;
  const label =
    days > 0
      ? `${days} j ${hours} h`
      : hours > 0
        ? `${hours} h ${String(minutes).padStart(2, '0')} min`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <span className={`num ${urgent ? 'text-danger' : 'text-ink'}`} suppressHydrationWarning>
      {label}
    </span>
  );
}
