'use client';

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { ecranBrume } from '@/components/accueil/ecranBrume';
import {
  PAYSAGE,
  PORTRAIT,
  REQUETE_PORTRAIT,
  REVELATION_BRUME,
  avanceeBrume,
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
 * - `video` : la display tombe dans la neige, les boosters en sortent ; quand
 *   les quatre de la ligue se relèvent, le brouillard monte sous eux ;
 * - `brume` : ils ont pris leur pose ; les vraies images sont posées à leur
 *   place, et le brouillard se dissipe sur la page ;
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
  /** `passee` : le visiteur a passé l'animation — les boosters arrivent d'eux-mêmes. */
  const [arrivee, setArrivee] = useState<'video' | 'directe' | 'passee'>('video');
  /** Arrête la vidéo en cours et ce qui la suit : posé par l'effet, appelé pour la passer. */
  const arreteVideo = useRef<() => void>(() => {});
  // Revoir l'animation : chaque essai relance la vidéo depuis le début.
  const [essai, setEssai] = useState(0);

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
    // Le cadrage suit l'écran : portrait sur un téléphone debout, paysage ailleurs.
    const format = window.matchMedia(REQUETE_PORTRAIT).matches ? PORTRAIT : PAYSAGE;
    const ecran = ecranBrume(c, v, format.pile);
    if (!ecran) {
      sansVideo();
      return;
    }

    let arret = false;
    let lancee = false;
    let image = 0;
    const t0 = performance.now();
    const temps = () => (performance.now() - t0) / 1000;

    // Pendant la vidéo, à chaque image : le brouillard suit le temps de la vidéo.
    const boucleVideo = () => {
      if (arret) return;
      const b = avanceeBrume(v.currentTime);
      ecran.dessine(b, temps());
      if (b >= REVELATION_BRUME) setRevele(true);
      image = requestAnimationFrame(boucleVideo);
    };
    // La vidéo finie : les vraies images sont posées, le brouillard finit de se dissiper.
    const brume = () => {
      if (arret) return;
      arret = true;
      cancelAnimationFrame(image);
      setPhase('brume');
      const fin = Number.isFinite(v.duration) ? v.duration : v.currentTime;
      const debut = performance.now();
      const pas = () => {
        const b = avanceeBrume(fin + (performance.now() - debut) / 1000);
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

    v.src = format.video;
    v.currentTime = 0;
    v.addEventListener('playing', enLecture);
    v.addEventListener('ended', brume);
    v.addEventListener('error', echec);
    v.play().catch(echec);
    const attente = window.setTimeout(() => !lancee && echec(), ATTENTE_MAX_MS);
    const garde = window.setTimeout(() => (lancee ? brume() : echec()), DUREE_MAX_MS);
    arreteVideo.current = () => {
      arret = true;
      cancelAnimationFrame(image);
      window.clearTimeout(attente);
      window.clearTimeout(garde);
      v.pause();
    };

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
  }, [essai]);

  // Passer l'animation : la vidéo s'arrête, les boosters et la page arrivent tout de suite.
  const passer = () => {
    arreteVideo.current();
    setArrivee('passee');
    setPhase('fini');
    setRevele(true);
  };

  const revoir = () => {
    setPhase('charge');
    setRevele(false);
    setArrivee('video');
    setEssai((e) => e + 1);
  };

  return (
    <div className="acc-scene" data-phase={phase} data-revele={revele ? '' : undefined} data-arrivee={arrivee}>
      <div className="acc-calque">
        <div className="acc-plateau">
          <video ref={video} className="acc-video" muted playsInline preload="auto" aria-hidden="true" />
          {/* Un canvas neuf à chaque essai : l'ancien a rendu son contexte WebGL. */}
          <canvas key={essai} ref={canvas} className="acc-canvas" aria-hidden="true" />
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
      {/* Le temps de la vidéo seulement : dès que la page commence à apparaître, il s'en va. */}
      {(phase === 'charge' || (phase === 'video' && !revele)) && (
        <button type="button" className="acc-passer" onClick={passer}>
          Passer l’animation <span aria-hidden="true">»</span>
        </button>
      )}
      {phase === 'fini' && arrivee !== 'directe' && (
        <button type="button" className="acc-revoir" onClick={revoir}>
          <span aria-hidden="true">↻</span> Revoir<span className="acc-revoir-suite"> l’animation</span>
        </button>
      )}
      <noscript>
        <style>{'.acc-scene .acc-centre > *, .acc-scene .acc-tuile, .acc-scene .acc-booster { opacity: 1 !important; }'}</style>
      </noscript>
    </div>
  );
}
