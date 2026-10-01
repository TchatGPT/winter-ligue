'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { IconSnowflake } from '@/components/icons';
import { num } from '@/lib/format';
import type { EtatCadeau } from '@/lib/services/cadeauDuJour';

/**
 * Le cadeau du jour, près du solde : une tuile dans le menu, sous la capsule
 * des flocons, et une pastille dans le solde de l'en-tête mobile tant qu'il
 * attend. Un clic le prend.
 *
 * La tuile montre la semaine en cours — sept crans, le septième doré, celui
 * qui vaut plus — et ce que vaut le cadeau du jour. Le navigateur ne fait que
 * demander : le jour, la série et le montant se décident sur le serveur
 * (`lib/services/cadeauDuJour.ts`).
 */
export function CadeauDuJour({ etat, variante }: { etat: EtatCadeau; variante: 'tuile' | 'pastille' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'erreur'; text: string } | null>(null);

  const dispo = etat.eligible && !etat.dejaPris;
  if (variante === 'pastille' && !dispo) return null;

  async function prends() {
    if (!dispo || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const reponse = await fetch('/api/cadeau-du-jour', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const charge = await reponse.json();
      if (!charge.ok) {
        setMessage({ kind: 'erreur', text: charge.error?.message ?? 'Cadeau indisponible.' });
        return;
      }
      const { recu, montant } = charge.data as { recu: number; montant: number };
      setMessage({
        kind: 'ok',
        text: recu < montant ? `+${num(recu)} ❄ : ton solde touche le plafond.` : `+${num(recu)} ❄ sur ton solde !`,
      });
      router.refresh();
    } catch {
      setMessage({ kind: 'erreur', text: 'Le serveur n’a pas répondu.' });
    } finally {
      setBusy(false);
    }
  }

  if (variante === 'pastille') {
    return (
      <button
        type="button"
        className="cadeau-jour-pastille"
        onClick={prends}
        disabled={busy}
        aria-label={`Prendre le cadeau du jour : ${etat.montant} flocons`}
        title={`Cadeau du jour : +${etat.montant} ❄`}
      >
        <IconSnowflake className="h-[15px] w-[15px]" />
      </button>
    );
  }

  const aide = message
    ? message.text
    : !etat.eligible
      ? 'Après ta première game'
      : etat.dejaPris
        ? `Pris · série de ${etat.serie} jour${etat.serie > 1 ? 's' : ''} — reviens demain`
        : `+${num(etat.montant)} ❄ · jour ${etat.jour} sur 7`;

  return (
    <button
      type="button"
      className="cadeau-jour-tuile"
      data-dispo={dispo ? '' : undefined}
      data-message={message?.kind}
      onClick={prends}
      disabled={!dispo || busy}
    >
      <span className="code-cadeau-medaillon cadeau-jour-medaillon" aria-hidden="true">
        <IconSnowflake className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="code-cadeau-titre">Cadeau du jour</span>
        <span className="code-cadeau-aide">{aide}</span>
        {etat.eligible && (
          <span className="cadeau-jour-semaine" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <i
                key={i}
                data-fait={i + 1 < etat.jour || (etat.dejaPris && i + 1 === etat.jour) ? '' : undefined}
                data-septieme={i === 6 ? '' : undefined}
              />
            ))}
          </span>
        )}
      </span>
      {dispo && (
        <span className="code-cadeau-fleche cadeau-jour-fleche" aria-hidden="true">
          ›
        </span>
      )}
    </button>
  );
}
