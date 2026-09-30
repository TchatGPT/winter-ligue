'use client';

import { useEffect, useRef } from 'react';
import type { Camp } from '@/lib/domain/bataille';
import type { Donnees3D, Moteur3D } from './moteur';
import type { EtatCoureur } from './pereNoel';

/** Ce que l'arène pilote : l'avancée de chaque camp, et son état. */
export interface ControleCourse3D {
  pose(camp: Camp, p: number, saut: number, tombe: boolean): void;
  etat(camp: Camp, etat: EtatCoureur): void;
}

/** WebGL est-il là ? Sans lui, l'arène garde ses couloirs dessinés. */
function webglDisponible(): boolean {
  try {
    const toile = document.createElement('canvas');
    return Boolean(toile.getContext('webgl2') ?? toile.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * La course des duels, en trois dimensions.
 *
 * Le moteur (`./moteur`, avec three.js) n'est chargé qu'ici, à la demande : il
 * ne pèse que sur la page des duels, et seulement quand une course s'ouvre.
 * En attendant qu'il soit prêt, le relais garde la dernière avancée et le
 * dernier état de chaque camp, et les lui donne dès qu'il arrive — une course
 * lancée avant la fin du chargement ne perd rien.
 *
 * Le nom de chaque joueur flotte au-dessus de son bonnet : le moteur dit où,
 * image par image, et on déplace l'étiquette sans passer par React.
 */
export function Course3D({
  donnees,
  noms,
  surControle,
  onIndisponible,
}: {
  donnees: Donnees3D;
  noms: Record<Camp, { pseudo: string; moi: boolean }>;
  /** Reçoit le relais qui pilote la scène, puis null quand elle disparaît. */
  surControle: (controle: ControleCourse3D | null) => void;
  /** Appelé si la scène ne peut pas se construire : l'arène repasse en 2D. */
  onIndisponible: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const etiquettes = useRef<Record<Camp, HTMLDivElement | null>>({ hote: null, adversaire: null });
  const repli = useRef(onIndisponible);
  const relaie = useRef(surControle);
  useEffect(() => {
    repli.current = onIndisponible;
    relaie.current = surControle;
  });

  useEffect(() => {
    const cadre = boite.current;
    const el = toile.current;
    if (!cadre || !el) return;

    const derniers: {
      pose: Partial<Record<Camp, [number, number, boolean]>>;
      etat: Partial<Record<Camp, EtatCoureur>>;
    } = { pose: {}, etat: {} };
    const vie: { moteur: Moteur3D | null; annule: boolean } = { moteur: null, annule: false };

    relaie.current({
      pose(camp, p, saut, tombe) {
        derniers.pose[camp] = [p, saut, tombe];
        vie.moteur?.pose(camp, p, saut, tombe);
      },
      etat(camp, etat) {
        derniers.etat[camp] = etat;
        vie.moteur?.etat(camp, etat);
      },
    });

    if (!webglDisponible()) {
      repli.current();
      return;
    }

    const police = getComputedStyle(cadre).fontFamily;
    void Promise.all([import('./moteur'), document.fonts?.ready])
      .then(([{ creeMoteur }]) => {
        if (vie.annule) return;
        const m = creeMoteur(el, donnees, {
          police,
          etiquette: (camp, x, y, visible) => {
            const t = etiquettes.current[camp];
            if (!t) return;
            t.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
            t.style.opacity = visible ? '1' : '0';
          },
        });
        m.redimensionne(cadre.clientWidth, cadre.clientHeight);
        for (const camp of ['hote', 'adversaire'] as Camp[]) {
          const e = derniers.etat[camp];
          if (e) m.etat(camp, e);
          const p = derniers.pose[camp];
          if (p) m.pose(camp, ...p);
        }
        vie.moteur = m;
      })
      .catch(() => {
        if (!vie.annule) repli.current();
      });

    const obs = new ResizeObserver(() => vie.moteur?.redimensionne(cadre.clientWidth, cadre.clientHeight));
    obs.observe(cadre);

    return () => {
      vie.annule = true;
      obs.disconnect();
      relaie.current(null);
      vie.moteur?.detruit();
    };
  }, [donnees]);

  return (
    <div ref={boite} className="course3d">
      <canvas ref={toile} aria-hidden="true" />
      {(['hote', 'adversaire'] as Camp[]).map((camp) => (
        <div
          key={camp}
          ref={(el) => {
            etiquettes.current[camp] = el;
          }}
          className="course3d-nom"
          data-moi={noms[camp].moi ? '' : undefined}
        >
          {noms[camp].pseudo}
          {noms[camp].moi && <span>toi</span>}
        </div>
      ))}
    </div>
  );
}
