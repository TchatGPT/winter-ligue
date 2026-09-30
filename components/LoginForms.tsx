'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';
import { IconTwitch } from '@/components/icons';
import { Notice } from '@/components/ui';

/**
 * Connexion : Twitch, et un mot de passe pour l'administration.
 *
 * Le rôle vient de Twitch à chaque connexion : la streameuse est
 * administratrice, les modérateurs de sa chaîne sont modérateurs ici, tous les
 * autres sont joueurs. Tant que l'application Twitch n'est pas déclarée, la
 * connexion Twitch est fermée — il n'y a plus de passage simulé.
 *
 * Le mot de passe d'administration n'apparaît que si son empreinte est posée
 * (`ADMIN_PASSWORD_HASH`) : c'est la porte de la streameuse tant que Twitch
 * n'est pas branché, et son filet ensuite. Hors production, la connexion de
 * développement permet d'incarner un joueur pour tester.
 */
export function LoginForms({
  twitchEnabled,
  motDePasse,
  devPlayers,
}: {
  twitchEnabled: boolean;
  motDePasse: boolean;
  devPlayers: { id: string; pseudo: string }[] | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function envoie(url: string, corps: Record<string, unknown>, apres: (data: { secours?: boolean }) => string) {
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
      setSecret('');
      router.push(apres(payload.data ?? {}));
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(false);
    }
  }

  const formulaire = motDePasse && (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (secret) void envoie('/api/admin/login', { password: secret }, (d) => (d.secours ? '/admin' : '/'));
      }}
    >
      <label className="label" htmlFor="mot-de-passe">
        Mot de passe d’administration
      </label>
      <input
        id="mot-de-passe"
        type="password"
        className="field"
        autoComplete="current-password"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        maxLength={256}
        required
      />
      <button type="submit" className="btn btn-ice w-full" disabled={busy || !secret}>
        Entrer
      </button>
    </form>
  );

  return (
    <section className="glass glass-reflet relative mx-auto max-w-xl overflow-hidden p-6 sm:p-8">
      <SnowCap radius="var(--r-lg)" seed="connexion" epaisseur={16} />
      <TitreGlace taille="petit">Entrer dans la ligue</TitreGlace>

      {twitchEnabled ? (
        <>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            Connecte-toi avec ton compte Twitch. Ton pseudo devient ton nom dans la ligue, et si tu modères la
            chaîne, tes accès de modération sont reconnus automatiquement.
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

      {formulaire &&
        (twitchEnabled ? (
          <details className="mt-7 border-t border-white/15 pt-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">Accès administration</summary>
            <div className="mt-4">{formulaire}</div>
          </details>
        ) : (
          <div className="mt-7 border-t border-white/15 pt-5">{formulaire}</div>
        ))}

      {devPlayers && devPlayers.length > 0 && (
        <div className="mt-7 border-t border-white/15 pt-5">
          <p className="label">Connexion de développement</p>
          <div className="flex flex-wrap gap-1.5">
            {devPlayers.map((player) => (
              <button
                key={player.id}
                className="btn btn-sm"
                disabled={busy}
                onClick={() => void envoie('/api/auth/dev-login', { playerId: player.id }, () => '/')}
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
