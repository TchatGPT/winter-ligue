'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconSwords } from '@/components/icons';
import { Scene } from '@/components/overlay/Scene';
import { duelDemo } from '@/components/overlay/demo';
import { useFluxOverlay } from '@/components/overlay/useFluxOverlay';
import { SnowCap } from '@/components/SnowCap';
import { flakes } from '@/components/ui';
import type { DuelOverlay } from '@/lib/services/overlay';

/**
 * L'alerte des duels : un joueur vient de lancer un duel, et il attend un
 * adversaire.
 *
 * La plaque tombe, les épées se croisent, le nom se révèle, puis la mise ; en
 * dessous, l'invitation à relever le défi dans le tchat. Elle reste le temps
 * qu'on la lise, et repart. Un duel monté et joué d'un coup contre le bot
 * n'attend personne : il n'est pas annoncé.
 */

const DUREE_ALERTE = 9000;
const DUREE_SORTIE = 800;

export function OverlayDuel({ cle, depart, demo = false }: { cle: string; depart: string; demo?: boolean }) {
  const [file, setFile] = useState<DuelOverlay[]>(() => (demo ? [duelDemo(0)] : []));

  const surFlux = useCallback((_: unknown, nouveaux: { duels: DuelOverlay[] }) => {
    if (nouveaux.duels.length) setFile((f) => [...f, ...nouveaux.duels]);
  }, []);
  useFluxOverlay({ cle, depart, intervalle: 2000, actif: !demo, surFlux });

  useEffect(() => {
    if (!demo) return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      setFile((f) => (f.length ? f : [duelDemo(n)]));
    }, 3000);
    return () => clearInterval(t);
  }, [demo]);

  const actuel = file[0] ?? null;
  const suivante = useCallback(() => setFile((f) => f.slice(1)), []);

  return (
    <Scene largeur={1200} hauteur={420}>
      {actuel && <Alerte key={actuel.id} duel={actuel} onFini={suivante} />}
    </Scene>
  );
}

/** Une alerte, de sa chute à son départ. */
function Alerte({ duel, onFini }: { duel: DuelOverlay; onFini: () => void }) {
  const [sort, setSort] = useState(false);

  useEffect(() => {
    const depart = setTimeout(() => setSort(true), DUREE_ALERTE);
    const fin = setTimeout(onFini, DUREE_ALERTE + DUREE_SORTIE);
    return () => {
      clearTimeout(depart);
      clearTimeout(fin);
    };
  }, [onFini]);

  return (
    <div className="ov-duel" data-sort={sort ? '' : undefined}>
      <div className="ov-duel-plaque glass">
        <SnowCap radius="var(--r-lg)" seed={`ov-duel-${duel.id}`} epaisseur={18} />
        <span className="ov-duel-medaillon" aria-hidden="true">
          <IconSwords className="h-12 w-12" />
        </span>
        <div className="ov-duel-texte">
          <span className="ov-duel-surtitre">Duel en attente</span>
          <span className="ov-duel-titre">
            <span className="glace" data-text={duel.hote}>
              {duel.hote}
            </span>
          </span>
          <span className="ov-duel-lance">
            a lancé un duel · <strong>❄ {flakes(duel.mise)}</strong> en jeu
          </span>
        </div>
      </div>
      <p className="ov-duel-appel">
        Tape <kbd>!duel</kbd> dans le tchat
      </p>
    </div>
  );
}
