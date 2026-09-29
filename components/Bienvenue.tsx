'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SnowCap } from '@/components/SnowCap';
import { TitreGlace } from '@/components/TitreGlace';
import { Notice } from '@/components/ui';

/**
 * Le formulaire de bienvenue : un seul champ, le pseudo Activision.
 *
 * On explique pourquoi on le demande — sans lui, les games ne sont pas
 * reconnues sur les captures — et l'on repart vers le classement dès qu'il
 * est enregistré. Le même écran sert à le corriger plus tard.
 */
export function Bienvenue({ pseudo, activisionId }: { pseudo: string; activisionId: string | null }) {
  const router = useRouter();
  const [valeur, setValeur] = useState(activisionId ?? '');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const premiere = activisionId === null;

  async function enregistre(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErreur(null);
    try {
      const reponse = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activisionId: valeur.trim() }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        const detail = charge.error?.issues?.[0]?.message;
        setErreur(detail ?? charge.error?.message ?? 'Enregistrement refusé.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <section className="glass glass-reflet relative overflow-hidden p-6 sm:p-8">
        <SnowCap radius="var(--r-lg)" seed="bienvenue" epaisseur={18} />
        <TitreGlace taille="page" eyebrow={premiere ? 'Bienvenue' : 'Ton compte'}>
          {premiere ? `Salut ${pseudo}` : 'Pseudo Activision'}
        </TitreGlace>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          {premiere
            ? 'Une dernière chose avant d’entrer : ton pseudo Activision, celui qui s’affiche en jeu. C’est lui que la modération reconnaît sur les captures de fin de game pour saisir tes games. Sans lui, elles ne seraient pas comptées.'
            : 'Le pseudo qui s’affiche en jeu, tel que la modération le lit sur les captures de fin de game.'}
        </p>

        <form className="mt-6 space-y-4" onSubmit={enregistre}>
          <div>
            <label className="label" htmlFor="activision">
              Pseudo Activision
            </label>
            <input
              id="activision"
              className="field"
              value={valeur}
              onChange={(e) => setValeur(e.target.value)}
              minLength={2}
              maxLength={40}
              placeholder="Pseudo#1234567"
              autoComplete="off"
              autoFocus
              required
            />
            <p className="mt-2 text-[13px] text-faint">
              Avec ou sans le numéro après le dièse. Tu le trouves dans le jeu : Compte, puis Identifiant
              Activision.
            </p>
          </div>
          {erreur && <Notice kind="error">{erreur}</Notice>}
          <button className="btn btn-ice w-full" disabled={busy || valeur.trim().length < 2}>
            {busy ? 'Enregistrement…' : premiere ? 'Entrer dans la ligue' : 'Enregistrer'}
          </button>
        </form>
      </section>
    </div>
  );
}
