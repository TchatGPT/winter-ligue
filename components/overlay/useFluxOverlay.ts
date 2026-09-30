'use client';

import { useEffect, useRef, useState } from 'react';
import type { BoosterOverlay, DuelOverlay, SubsOverlay } from '@/lib/services/overlay';

export interface FluxRecu {
  maintenant: string;
  boosters: BoosterOverlay[];
  duels: DuelOverlay[];
  subs: SubsOverlay;
}

export type EtatLien = 'ok' | 'invalide' | 'hors-ligne';

/**
 * Lit le flux des overlays à intervalle régulier.
 *
 * Seuls les évènements postérieurs à l'ouverture de l'overlay remontent : une
 * source OBS qu'on recharge ne rejoue pas la soirée. Chaque évènement n'est
 * rendu qu'une fois, même si deux lectures se recouvrent. Le serveur injoignable,
 * on réessaie en espaçant, sans rien afficher d'alarmant à l'écran du stream.
 */
export function useFluxOverlay({
  cle,
  depart,
  intervalle,
  actif,
  surFlux,
}: {
  cle: string;
  /** Date ISO de rendu de la page : on ne remonte pas avant. */
  depart: string;
  intervalle: number;
  actif: boolean;
  surFlux: (flux: FluxRecu, nouveaux: { boosters: BoosterOverlay[]; duels: DuelOverlay[] }) => void;
}): EtatLien {
  const [etat, setEtat] = useState<EtatLien>('ok');
  const rappel = useRef(surFlux);
  useEffect(() => {
    rappel.current = surFlux;
  });

  useEffect(() => {
    if (!actif) return;
    let arrete = false;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    let depuis = depart;
    let echecs = 0;
    const vus = new Set<string>();

    async function tour() {
      try {
        const reponse = await fetch(
          `/api/overlay?cle=${encodeURIComponent(cle)}&depuis=${encodeURIComponent(depuis)}`,
          { cache: 'no-store' },
        );
        const charge = await reponse.json();
        if (!charge.ok) {
          if (reponse.status === 403) {
            setEtat('invalide');
            return; // Un lien révoqué ne reviendra pas : on cesse de lire.
          }
          throw new Error(charge.error?.message);
        }
        const flux = charge.data as FluxRecu;
        const boosters = flux.boosters.filter((b) => !vus.has(b.id));
        const duels = flux.duels.filter((d) => !vus.has(d.id));
        for (const e of [...boosters, ...duels]) {
          vus.add(e.id);
          if (e.at > depuis) depuis = e.at;
        }
        echecs = 0;
        setEtat('ok');
        rappel.current(flux, { boosters, duels });
      } catch {
        echecs += 1;
        setEtat('hors-ligne');
      }
      if (!arrete) minuterie = setTimeout(tour, intervalle * Math.min(8, 2 ** Math.min(echecs, 3)));
    }

    void tour();
    return () => {
      arrete = true;
      clearTimeout(minuterie);
    };
  }, [cle, depart, intervalle, actif]);

  return etat;
}
