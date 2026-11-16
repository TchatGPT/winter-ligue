'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { ecranBrume } from '@/components/accueil/ecranBrume';
import {
  DUREE_BRUME_MS,
  PAYSAGE,
  PORTRAIT,
  REQUETE_PORTRAIT,
  REVELATION_BRUME,
  placeEnVariables,
} from '@/components/accueil/placesDisplay';

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
 * - `video` : la display tombe dans la neige, les boosters en sortent ;
 * - `brume` : les vraies images des boosters sont posées, la scène se dissipe
 *   dans un brouillard (`ecranBrume`) ;
 * - `fini` : il ne reste que les boosters et la page.
 */
type Phase = 'charge' | 'video' | 'brume' | 'fini';

/** Sans image au bout de ce délai, on n'attend plus la vidéo. */
const ATTENTE_MAX_MS = 6000;
/** Une vidéo qui s'enlise : au-delà, la page s'affiche quand même. */
const DUREE_MAX_MS = 16_000;

/**
 * La scène de l'accueil (16/11/2026) : la display de boosters, rendue dans
 * Blender, couvre tout l'écran — elle tombe dans la neige, s'y renverse, des
 * boosters en jaillissent et les quatre de la ligue vont se placer. Les vraies
 * images des boosters prennent alors le relais, à la même place, et la scène se
 * dissipe dans un brouillard qui laisse apparaître la page : le nom, l'entrée,
 * les tuiles (`children`). La vidéo se rejoue à chaque visite, même si le
 * système demande moins d'animations (Windows le dit dès que ses effets sont
 * coupés).
 *
 * Sans vidéo — WebGL absent, lecture refusée, réseau trop lent —, les boosters
 * et le centre arrivent tout de suite.
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
    const ecran = ecranBrume(c, v);
    if (!ecran) {
      sansVideo();
      return;
    }

    let arret = false;
    let lancee = false;
    let image = 0;
    const t0 = performance.now();
    const temps = () => (performance.now() - t0) / 1000;

    const boucleVideo = () => {
      if (arret) return;
      ecran.dessine(0, temps());
      if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(boucleVideo);
      else image = requestAnimationFrame(boucleVideo);
    };
    // La vidéo finie : les vraies images sont posées, le brouillard dissipe la scène.
    const brume = () => {
      if (arret) return;
      arret = true;
      cancelAnimationFrame(image);
      setPhase('brume');
      const debut = performance.now();
      const pas = () => {
        const b = Math.min(1, (performance.now() - debut) / DUREE_BRUME_MS);
        ecran.dessine(b, temps());
        if (b >= REVELATION_BRUME) setRevele(true);
        if (b < 1) image = requestAnimationFrame(pas);
        else setPhase('fini');
      };
      image = requestAnimationFrame(pas);
    };
    const enLecture = () => {
      if (lancee) return;
      lancee = true;
      setPhase('video');
      boucleVideo();
    };
    const echec = () => {
      if (arret) return;
      arret = true;
      sansVideo();
    };

    // Le cadrage suit l'écran ; la vidéo la plus fine que l'écran mérite, la plus
    // légère si l'on économise les données.
    const format = window.matchMedia(REQUETE_PORTRAIT).matches ? PORTRAIT : PAYSAGE;
    const leger = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    const pixels = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
    const choix = leger ? format.videos.at(-1) : format.videos.find((x) => pixels >= x.pourLargeur);
    v.src = (choix ?? format.videos[0]).src;
    v.addEventListener('playing', enLecture);
    v.addEventListener('ended', brume);
    v.addEventListener('error', echec);
    v.play().catch(echec);
    const attente = window.setTimeout(() => !lancee && echec(), ATTENTE_MAX_MS);
    const garde = window.setTimeout(() => (lancee ? brume() : echec()), DUREE_MAX_MS);

    return () => {
      arret = true;
      cancelAnimationFrame(image);
      window.clearTimeout(attente);
      window.clearTimeout(garde);
      v.removeEventListener('playing', enLecture);
      v.removeEventListener('ended', brume);
      v.pause();
      ecran.libere();
    };
  }, []);

  return (
    <div className="acc-scene" data-phase={phase} data-revele={revele ? '' : undefined} data-arrivee={arrivee}>
      <div className="acc-calque">
        <div className="acc-plateau">
          <video ref={video} className="acc-video" muted playsInline preload="auto" aria-hidden="true" />
          <canvas ref={canvas} className="acc-canvas" aria-hidden="true" />
          <ul className="acc-boosters" aria-label="Les quatre boosters">
            {boosters.map((b, i) => {
              const paysage = PAYSAGE.places[b.id];
              const portrait = PORTRAIT.places[b.id];
              if (!paysage || !portrait) return null;
              return (
                <li
                  key={b.id}
                  className="acc-booster"
                  style={
                    {
                      ...placeEnVariables('pa', PAYSAGE, paysage),
                      ...placeEnVariables('po', PORTRAIT, portrait),
                      ['--i' as string]: i,
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
      </div>
      {children}
      <noscript>
        <style>{'.acc-scene .acc-centre > *, .acc-scene .acc-tuile, .acc-scene .acc-booster { opacity: 1 !important; }'}</style>
      </noscript>
    </div>
  );
}
