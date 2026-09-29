'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SnowCap } from '@/components/SnowCap';
import { IconTwitch } from '@/components/icons';
import { Notice } from '@/components/ui';

type Role = 'joueur' | 'moderateur' | 'admin';

const ROLES: { id: Role; titre: string; texte: string }[] = [
  { id: 'joueur', titre: 'Viewer', texte: 'Tu joues dans la ligue.' },
  { id: 'moderateur', titre: 'Modérateur', texte: 'Tu saisis les games et ouvres les boosters.' },
  { id: 'admin', titre: 'Streameuse', texte: 'Tout, plus les réglages de la saison.' },
];

/**
 * La fausse autorisation Twitch.
 *
 * Elle reprend ce que montre Twitch — l'application qui demande l'accès, le
 * compte, le bouton « Autoriser » — et demande les deux choses que le vrai
 * flux lira chez Twitch : le pseudo, et le rôle sur la chaîne. Le compte est
 * ensuite créé comme au retour du vrai Twitch.
 */
export function TwitchDemo() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [role, setRole] = useState<Role>('joueur');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function autorise(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/auth/twitch/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), role }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setErreur(charge.error?.issues?.[0]?.message ?? charge.error?.message ?? 'Connexion refusée.');
        return;
      }
      router.push(charge.data.destination);
      router.refresh();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-10">
      <section className="glass glass-reflet relative overflow-hidden p-6 sm:p-8">
        <SnowCap radius="var(--r-lg)" seed="twitch-demo" epaisseur={16} />

        <div className="relative flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--twitch)' }}>
            <IconTwitch className="h-8 w-8 text-white" />
          </span>
          <span className="badge mt-4" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            Simulation
          </span>
          <h1 className="mt-3 font-display text-2xl font-black tracking-wide text-ink uppercase">
            Winter Ligue
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">souhaite accéder à ton compte Twitch</p>
        </div>

        <form className="relative mt-6 space-y-5" onSubmit={autorise}>
          <div>
            <label className="label" htmlFor="twitch-login">
              Pseudo Twitch
            </label>
            <input
              id="twitch-login"
              className="field"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="ton_pseudo"
              autoComplete="off"
              autoFocus
              required
              minLength={3}
              maxLength={25}
            />
          </div>

          <div>
            <p className="label">Ton rôle sur la chaîne</p>
            <div className="grid gap-2">
              {ROLES.map((r) => {
                const actif = r.id === role;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    aria-pressed={actif}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      actif
                        ? 'border-white/90 bg-white/90 text-[#06284a]'
                        : 'glass glass-soft border-white/20 text-ink hover:border-white/50'
                    }`}
                  >
                    <span className="block font-display text-[15px] font-black tracking-wide uppercase">{r.titre}</span>
                    <span className={`block text-[13px] ${actif ? 'text-[#06284a]/80' : 'text-muted'}`}>{r.texte}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-faint">
              Avec la vraie connexion, ce rôle sera lu directement sur Twitch.
            </p>
          </div>

          {erreur && <Notice kind="error">{erreur}</Notice>}

          <button className="btn btn-twitch btn-lg w-full" disabled={busy || login.trim().length < 3}>
            <IconTwitch className="h-5 w-5" />
            {busy ? 'Connexion…' : 'Autoriser'}
          </button>
          <Link href="/" className="block text-center text-[14px] text-muted no-underline hover:text-ink">
            Annuler
          </Link>
        </form>
      </section>
    </div>
  );
}
