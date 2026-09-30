'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { IconCadeau } from '@/components/icons';
import { num } from '@/lib/format';

const rienAEcouter = () => () => {};

/**
 * L'icône cadeau, près du solde : on y tape un code donné par la modération —
 * lu sur le stream, dans le tchat — et ses flocons tombent aussitôt.
 *
 * Le navigateur n'envoie que le code. Le montant, les utilisations et le droit
 * de s'en servir se décident sur le serveur (`lib/services/codes.ts`).
 *
 * La saisie s'ouvre au centre de l'écran, par un portail vers <body> : les
 * plaques de verre du menu portent un backdrop-filter, qui couperait un
 * panneau accroché au bouton.
 */
export function CodeCadeau({ className }: { className?: string }) {
  const router = useRouter();
  const navigateur = useSyncExternalStore(
    rienAEcouter,
    () => true,
    () => false,
  );
  const [ouvert, setOuvert] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'erreur'; text: string } | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    champ.current?.focus();
    const echap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [ouvert]);

  async function valide(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({ kind: 'erreur', text: charge.error?.message ?? 'Code refusé.' });
        return;
      }
      const { recu, montant } = charge.data as { recu: number; montant: number };
      setCode('');
      setMessage({
        kind: 'ok',
        text:
          recu < montant
            ? `+${num(recu)} ❄ : ton solde touche le plafond, le reste est perdu.`
            : `+${num(recu)} ❄ sur ton solde. Bonne saison !`,
      });
      router.refresh();
    } catch {
      setMessage({ kind: 'erreur', text: 'Le serveur n’a pas répondu. Réessaie dans un instant.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`code-cadeau ${className ?? ''}`}
        onClick={() => {
          setMessage(null);
          setOuvert(true);
        }}
        aria-label="Utiliser un code cadeau"
        title="Un code cadeau ?"
      >
        <IconCadeau className="h-[17px] w-[17px]" />
      </button>

      {ouvert &&
        navigateur &&
        createPortal(
          <div
            className="fenetre-voile"
            role="dialog"
            aria-modal="true"
            aria-label="Code cadeau"
            onClick={() => setOuvert(false)}
          >
            <form
              className="fenetre-carte cadeau-carte glass glass-reflet relative px-6 pt-7 pb-6"
              onClick={(e) => e.stopPropagation()}
              onSubmit={valide}
            >
              <button
                type="button"
                className="btn btn-sm absolute top-4 right-4"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
              <span className="cadeau-medaillon" aria-hidden="true">
                <IconCadeau className="h-6 w-6" />
              </span>
              <h2 className="mt-3 font-display text-2xl leading-none font-black tracking-wide text-ink uppercase">
                Code cadeau
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                Un code donné sur le stream ? Tape-le ici : ses flocons tombent aussitôt sur ton solde.
              </p>
              <div className="mt-4 flex gap-2">
                <input
                  ref={champ}
                  className="field min-w-0 flex-1 tracking-[0.12em] uppercase"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Le code"
                  placeholder="NOEL26"
                />
                <button className="btn btn-ice shrink-0" disabled={busy || !code.trim()}>
                  Valider
                </button>
              </div>
              {message && (
                <p className="cadeau-message" data-kind={message.kind} role="status">
                  {message.text}
                </p>
              )}
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
