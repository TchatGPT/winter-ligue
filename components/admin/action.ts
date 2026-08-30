'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface Message {
  kind: 'error' | 'success';
  text: string;
}

/**
 * Le geste d'administration : appeler une route, dire ce qui s'est passé,
 * rafraîchir la page.
 *
 * Chaque écran d'administration faisait sa propre copie de ces vingt lignes.
 * Elles ont divergé — l'une rafraîchissait, l'autre non ; l'une affichait le
 * message du serveur, l'autre un texte générique — si bien qu'une action
 * échouait parfois en silence selon l'endroit d'où on la lançait.
 *
 * Le rafraîchissement est ici et pas dans l'appelant, et c'est le point : ces
 * écrans sont rendus par le serveur, donc rien ne change à l'écran tant qu'on ne
 * le redemande pas. Un panneau qui accepte une action sans montrer son effet
 * pousse à la refaire.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function envoie(
    path: string,
    body: unknown,
    options: { cle?: string; methode?: string; succes?: string } = {},
  ): Promise<Record<string, unknown> | null> {
    setBusy(options.cle ?? path);
    setMessage(null);
    try {
      const reponse = await fetch(path, {
        method: options.methode ?? 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({ kind: 'error', text: charge.error?.message ?? 'Action refusée.' });
        return null;
      }
      setMessage({ kind: 'success', text: options.succes ?? 'Enregistré.' });
      router.refresh();
      return (charge.data ?? {}) as Record<string, unknown>;
    } catch {
      setMessage({ kind: 'error', text: 'Le serveur n’a pas répondu.' });
      return null;
    } finally {
      setBusy(null);
    }
  }

  return { busy, message, setMessage, envoie };
}
