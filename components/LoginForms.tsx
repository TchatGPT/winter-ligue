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
 * Le rôle vient de Twitch à chaque connexion : la streameuse et les
 * modérateurs de sa chaîne administrent la ligue, tous les autres y jouent.
 * Tant que l'application Twitch n'est pas déclarée, la connexion est fermée —
 * il n'y a ni passage simulé, ni mot de passe. Hors production, la connexion
 * de développement permet d'incarner un joueur pour tester.
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

  async function envoie(url: string, corps: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
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

      {twitchEnabled ? (
        <>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Connecte-toi avec ton compte Twitch. Ton pseudo devient ton nom dans la ligue, et si tu modères la
            chaîne, la modération t’est ouverte automatiquement.
          </p>
          <a href="/api/auth/twitch?returnTo=/" className="btn btn-twitch btn-lg mt-6 w-full no-underline">
            <IconTwitch className="h-5 w-5" />
            Se connecter avec Twitch
          </a>
        </>
      ) : (
        <div className="mt-4">
          <Notice>
            La connexion Twitch ouvre bientôt : elle attend le branchement de l’application Twitch de la ligue.
          </Notice>
        </div>
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
              <button
                key={player.id}
                className="btn btn-sm"
                disabled={busy}
                onClick={() => void envoie('/api/auth/dev-login', { playerId: player.id })}
              >
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
