'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';
import { IconTwitch } from '@/components/icons';
import { Notice } from '@/components/ui';

/**
 * Connexion : Twitch, et rien d'autre.
 *
 * Il n'y a plus de connexion « modération ». Le rôle vient de Twitch à chaque
 * connexion : la streameuse est administratrice, les modérateurs de sa chaîne
 * sont modérateurs ici, tous les autres sont joueurs.
 *
 * Le bouton suit déjà le circuit Twitch : départ, puis adresse de retour.
 * Tant que l'application Twitch n'est pas déclarée, le passage chez Twitch
 * est simulé et l'on entre sur le compte de la streameuse — voir
 * `lib/auth/simulation.ts`. Hors production, la connexion de développement
 * permet d'incarner un joueur pour tester.
 */
export function LoginForms({
  twitchEnabled,
  devPlayers,
}: {
  twitchEnabled: boolean;
  devPlayers: { id: string; pseudo: string }[] | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function devLogin(playerId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setMessage({ kind: 'error', text: payload.error?.message ?? 'Connexion refusée.' });
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass glass-reflet relative mx-auto max-w-xl overflow-hidden p-6 sm:p-8">
      <SnowCap radius="var(--r-lg)" seed="connexion" epaisseur={16} />
      <TitreGlace taille="petit">Entrer dans la ligue</TitreGlace>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        Connecte-toi avec ton compte Twitch. Ton pseudo devient ton nom dans la ligue, et si tu modères la
        chaîne, tes accès de modération sont reconnus automatiquement.
      </p>

      <a href="/api/auth/twitch?returnTo=/" className="btn btn-twitch btn-lg mt-6 w-full no-underline">
        <IconTwitch className="h-5 w-5" />
        Se connecter avec Twitch
      </a>
      {!twitchEnabled && (
        <p className="mt-3 text-center text-[13px] text-faint">
          Connexion Twitch simulée pour l’instant : un clic, et tu entres en administratrice.
        </p>
      )}

      {message && (
        <div className="mt-4">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}

      {devPlayers && devPlayers.length > 0 && (
        <div className="mt-7 border-t border-white/15 pt-5">
          <p className="label">Connexion de développement</p>
          <div className="flex flex-wrap gap-1.5">
            {devPlayers.map((player) => (
              <button key={player.id} className="btn btn-sm" disabled={busy} onClick={() => devLogin(player.id)}>
                {player.pseudo}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">Uniquement hors production, avec ALLOW_DEV_LOGIN=true.</p>
        </div>
      )}
    </section>
  );
}
