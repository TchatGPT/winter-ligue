'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Notice } from '@/components/ui';

/**
 * Connexion.
 *
 * Trois entrées possibles selon la configuration : Twitch (à venir), le mot de
 * passe de modération, et — uniquement hors production — une bascule de
 * développement pour incarner un joueur et tester cartes et enchères.
 */
export function LoginForms({
  twitchEnabled,
  devPlayers,
}: {
  twitchEnabled: boolean;
  devPlayers: { id: string; pseudo: string }[] | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitAdmin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        setError(payload.error?.message ?? 'Connexion refusée.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('Le serveur n’a pas répondu.');
    } finally {
      setBusy(false);
      setPassword('');
    }
  }

  async function devLogin(playerId: string) {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId }),
    });
    const payload = await response.json();
    setBusy(false);
    if (!payload.ok) {
      setError(payload.error?.message ?? 'Connexion refusée.');
      return;
    }
    router.push('/ma-collection');
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel panel-frost p-5">
        <h2 className="font-display text-lg font-black uppercase tracking-wide text-ink">
          Joueurs
        </h2>
        {twitchEnabled ? (
          <>
            <p className="mt-1 text-sm text-muted">
              Connecte-toi avec ton compte Twitch pour retrouver ta collection et enchérir.
            </p>
            <a
              href="/api/auth/twitch?returnTo=/ma-collection"
              className="btn mt-4 w-full no-underline"
              style={{ borderColor: '#9146FF', color: '#b98cff' }}
            >
              Se connecter avec Twitch
            </a>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              La connexion Twitch n’est pas encore activée. Elle le sera dès que les identifiants
              d’application seront renseignés — sans rien changer aux comptes déjà créés.
            </p>
            {devPlayers && devPlayers.length > 0 && (
              <div className="mt-4">
                <p className="label">Connexion de développement</p>
                <div className="flex flex-wrap gap-1.5">
                  {devPlayers.map((player) => (
                    <button
                      key={player.id}
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => devLogin(player.id)}
                    >
                      {player.pseudo}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-faint">
                  Disponible uniquement hors production, avec ALLOW_DEV_LOGIN=true.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel panel-frost p-5">
        <h2 className="font-display text-lg font-black uppercase tracking-wide text-ink">
          Modération
        </h2>
        <p className="mt-1 text-sm text-muted">
          Saisie des games, réglages de saison, sauvegarde.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submitAdmin}>
          <div>
            <label className="label" htmlFor="mot-de-passe">
              Mot de passe
            </label>
            <input
              id="mot-de-passe"
              type="password"
              className="field"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-ice w-full" disabled={busy || password.length === 0}>
            {busy ? 'Vérification…' : 'Se connecter'}
          </button>
        </form>
        {error && (
          <div className="mt-3">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </section>
    </div>
  );
}
