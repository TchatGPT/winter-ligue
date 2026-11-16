'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  IMAGE_REVELATION,
  IMAGES_PAR_SECONDE,
  PLACES_BOOSTERS,
  VIDEO_DISPLAY,
  placeEnPourcents,
} from '@/components/accueil/placesDisplay';
import { detoureur } from '@/components/accueil/videoDetouree';

/** Un booster de l'accueil : son image, son nom court et ce qui le fait tomber. */
export interface BoosterDeLaScene {
  id: string;
  /** « Perso ». */
  court: string;
  /** « tous les 35 subs » : ce qui le fait tomber. */
  quand: string;
  art: string | null;
}

/**
 * - `charge` : la vidéo se prépare, rien ne se voit encore ;
 * - `video` : la display arrive, s'ouvre, les boosters en sortent ;
 * - `fini` : il ne reste que les boosters, les vrais, posés là où la vidéo
 *   les a laissés.
 */
type Phase = 'charge' | 'video' | 'fini';

/** Sans image au bout de ce délai, on n'attend plus la vidéo. */
const ATTENTE_MAX_MS = 6000;
/** Une vidéo qui s'enlise : au-delà, la page s'affiche quand même. */
const DUREE_MAX_MS = 12_000;

/**
 * La scène de l'accueil (16/11/2026) : la display de boosters rendue dans
 * Blender s'ouvre, les quatre boosters en sortent et se placent, la display
 * s'efface. Les vraies images des boosters prennent alors le relais, à la
 * même place, et le centre de la page (`children` : le nom, l'entrée, les
 * tuiles) apparaît. La vidéo se rejoue à chaque visite.
 *
 * Sans vidéo — WebGL absent, lecture refusée, réseau trop lent —, les
 * boosters et le centre arrivent tout de suite.
 *
 * La vidéo se joue même quand le système demande moins d'animations
 * (`prefers-reduced-motion`, décidé le 16/11/2026) : Windows le dit dès que
 * ses effets d'animation sont coupés, ce que beaucoup font pour la
 * performance, et l'accueil perdait alors sa display.
 */
export function SceneDisplay({ boosters, children }: { boosters: BoosterDeLaScene[]; children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('charge');
  const [revele, setRevele] = useState(false);
  const [arrivee, setArrivee] = useState<'video' | 'directe'>('video');

  useEffect(() => {
    const c = canvas.current;
    const v = video.current;
    const sansVideo = () => {
      setArrivee('directe');
      setPhase('fini');
      setRevele(true);
    };
    if (!c || !v) {
      sansVideo();
      return;
    }
    const d = detoureur(c, v);
    if (!d) {
      sansVideo();
      return;
    }

    let fini = false;
    let lancee = false;
    let image = 0;
    const termine = (parLaVideo: boolean) => {
      if (fini) return;
      fini = true;
      if (parLaVideo) {
        d.dessine();
        setPhase('fini');
        setRevele(true);
      } else {
        sansVideo();
      }
    };
    const dessine = () => {
      d.dessine();
      if (v.currentTime >= IMAGE_REVELATION / IMAGES_PAR_SECONDE) setRevele(true);
    };
    const boucle = () => {
      if (fini) return;
      dessine();
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(boucle);
      else image = requestAnimationFrame(boucle);
    };
    const enLecture = () => {
      if (lancee) return;
      lancee = true;
      setPhase('video');
      boucle();
    };

    const petite = window.innerWidth < 900 || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    v.src = petite ? VIDEO_DISPLAY.petite : VIDEO_DISPLAY.grande;
    v.addEventListener('playing', enLecture);
    v.addEventListener('ended', () => termine(true));
    v.addEventListener('error', () => termine(false));
    v.play().catch(() => termine(false));
    const attente = window.setTimeout(() => !lancee && termine(false), ATTENTE_MAX_MS);
    const garde = window.setTimeout(() => termine(lancee), DUREE_MAX_MS);

    return () => {
      fini = true;
      cancelAnimationFrame(image);
      window.clearTimeout(attente);
      window.clearTimeout(garde);
      v.removeEventListener('playing', enLecture);
      v.pause();
      d.libere();
    };
  }, []);

  return (
    <div className="acc-scene" data-phase={phase} data-revele={revele ? '' : undefined} data-arrivee={arrivee}>
      <div className="acc-plateau">
        <video ref={video} className="acc-video" muted playsInline preload="auto" aria-hidden="true" />
        <canvas ref={canvas} className="acc-canvas" aria-hidden="true" />
        <ul className="acc-boosters" aria-label="Les quatre boosters">
          {boosters.map((b, i) => {
            const place = PLACES_BOOSTERS[b.id];
            if (!place) return null;
            return (
              <li
                key={b.id}
                className="acc-booster"
                style={
                  {
                    ...placeEnPourcents(place),
                    ['--i' as string]: i,
                    ['--incl' as string]: `${place.inclinaison}deg`,
                  } as CSSProperties
                }
              >
                <div className="acc-booster-flotte">
                  {b.art && (
                    // L'image entière, à la taille de la vidéo : c'est elle qui prend le relais.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.art} alt="" draggable={false} decoding="async" />
                  )}
                </div>
                <p className="acc-booster-nom">
                  <b>
                    <span className="sr-only">Booster </span>
                    {b.court}
                  </b>
                  <span>{b.quand}</span>
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      {children}
      <noscript>
        <style>{'.acc-scene .acc-centre, .acc-scene .acc-tuiles, .acc-scene .acc-booster { opacity: 1 !important; }'}</style>
      </noscript>
    </div>
  );
}
