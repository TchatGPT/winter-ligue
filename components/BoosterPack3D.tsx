'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PackArtwork } from './PackArtwork';

/**
 * Dimensions du sachet, en pixels.
 *
 * Le ratio compte plus que les valeurs : un vrai sachet de cartes est élancé,
 * autour de 1:2,1 (63 × 130 mm pour un booster du commerce). Une première
 * version à 250 × 368 donnait 1:1,47 — ça se lisait comme un carré, pas comme
 * un sachet.
 */
const W = 188;
const H = 396;
/** Épaisseur du film, gonflé par les cartes. */
const D = 13;
/** Hauteur du sertissage, en haut comme en bas. */
const CRIMP = 15;

export interface Pack3DProps {
  name: string;
  cardCount: number;
  gradient: [string, string];
  /** Illustration peinte du sachet. Absente, on retombe sur le décor vectoriel. */
  art?: string | null;
  /** Coupe la rotation continue, pendant l'ouverture par exemple. */
  frozen?: boolean;
  className?: string;
}

/**
 * Sachet de booster en volume, orientable à 360°.
 *
 * Six faces réelles en CSS 3D, pas une déformation d'image : on peut faire le
 * tour du sachet, voir son dos et ses tranches. Un sachet de cartes est une
 * boîte très plate — la géométrie ne justifiait pas d'embarquer un moteur
 * WebGL et ses ~200 Ko, mais la rotation, elle, devait être vraie.
 *
 * Au repos le sachet tourne lentement sur lui-même. Dès qu'on l'attrape, la
 * rotation passe sous le doigt, avec de l'inertie au relâchement : c'est ce
 * ralentissement progressif qui fait qu'un objet manipulé semble avoir une
 * masse.
 */
export function BoosterPack3D({
  name,
  cardCount,
  gradient,
  art,
  frozen = false,
  className,
}: Pack3DProps) {
  const packRef = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  // L'état de rotation vit dans des refs, pas dans le state : le faire passer
  // par React déclencherait un rendu par image d'animation.
  const rot = useRef({ x: -8, y: 0 });
  const velocity = useRef(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0, at: 0 });
  const frame = useRef<number | null>(null);

  const apply = useCallback(() => {
    const el = packRef.current;
    if (!el) return;
    el.style.setProperty('--rx3', `${rot.current.x.toFixed(2)}deg`);
    el.style.setProperty('--ry3', `${rot.current.y.toFixed(2)}deg`);
  }, []);

  /**
   * Inertie : la vitesse décroît jusqu'à devenir imperceptible.
   *
   * La boucle est une fonction locale nommée plutôt qu'un `useCallback` qui
   * s'appellerait lui-même : une fonction déclarée par `useCallback` ne peut
   * pas se référencer dans sa propre closure sans figer une version périmée
   * d'elle-même.
   */
  const startGlide = useCallback(() => {
    const step = () => {
      if (dragging.current) return;
      velocity.current *= 0.94;
      if (Math.abs(velocity.current) < 0.02) {
        velocity.current = 0;
        frame.current = null;
        return;
      }
      rot.current.y += velocity.current;
      apply();
      frame.current = requestAnimationFrame(step);
    };

    if (frame.current === null) frame.current = requestAnimationFrame(step);
  }, [apply]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    setGrabbed(true);
    velocity.current = 0;
    last.current = { x: event.clientX, y: event.clientY, at: performance.now() };

    // On repart de l'angle réellement affiché par l'animation CSS, sinon le
    // sachet saute à zéro au moment où on le saisit.
    const el = packRef.current;
    if (el) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const yaw = Math.atan2(-matrix.m31, matrix.m11) * (180 / Math.PI);
      if (Number.isFinite(yaw)) rot.current.y = yaw;
      apply();
    }
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const now = performance.now();
    const dx = event.clientX - last.current.x;
    const dy = event.clientY - last.current.y;
    const dt = Math.max(1, now - last.current.at);

    rot.current.y += dx * 0.45;
    // L'axe vertical est bridé : au-delà, on regarde le sachet par la tranche
    // et l'objet devient illisible.
    rot.current.x = Math.max(-32, Math.min(32, rot.current.x - dy * 0.28));

    velocity.current = (dx * 0.45 * 16) / dt;
    last.current = { x: event.clientX, y: event.clientY, at: now };
    apply();
  };

  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // Vitesse bornée : un geste très rapide ne doit pas transformer le sachet
    // en toupie.
    velocity.current = Math.max(-9, Math.min(9, velocity.current));
    startGlide();
  };

  const faceVars = {
    ['--p1' as string]: gradient[0],
    ['--p2' as string]: gradient[1],
  };

  /**
   * L'impression du sachet.
   *
   * L'illustration occupe toute la face, entre les deux sertissages — comme
   * sur un vrai sachet, où le décor va bord à bord et où seul le film écrasé
   * reste nu.
   */
  const artwork = (variant = 0) => (
    <div
      className="pack3d-print"
      style={{ top: CRIMP, bottom: CRIMP }}
    >
      <PackArtwork
        name={name}
        cardCount={cardCount}
        tint={gradient}
        variant={variant}
        art={art}
      />
    </div>
  );

  return (
    <div className={`pack3d-scene ${className ?? ''}`} style={{ width: W, height: H }}>
      {/* Turbulence : elle déforme les stries droites des dégradés en plis
          irréguliers. Un dégradé CSS ne trace que des lignes droites, et du
          mylar froissé n'a aucune ligne droite. Le filtre est posé sur un
          calque interne, pas sur la face elle-même : un `filter` appliqué à un
          élément transformé casse la chaîne 3D et annule backface-visibility. */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
        <defs>
          <filter id="froisse-mylar" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.014 0.05"
              numOctaves="3"
              seed="7"
              result="bruit"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="bruit"
              scale="22"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        ref={packRef}
        className={`pack3d ${grabbed || frozen ? '' : 'pack3d-spin'}`}
        style={{ width: W, height: H, ...faceVars }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={`Sachet ${name}, ${cardCount} cartes — faites-le tourner`}
      >
        {/* Face avant */}
        <div
          className="pack3d-face pack3d-front"
          style={{ width: W, height: H, transform: `translateZ(${D / 2}px)` }}
        >
          {artwork(0)}
          <span className="pack3d-froisse" aria-hidden="true" />
          <span className="pack3d-crimp pack3d-crimp-top" aria-hidden="true" />
          <span className="pack3d-crimp pack3d-crimp-bottom" aria-hidden="true" />
          <span className="pack3d-notch" aria-hidden="true" />
        </div>

        {/* Face arrière, retournée pour que l'impression reste lisible */}
        <div
          className="pack3d-face pack3d-back"
          style={{ width: W, height: H, transform: `rotateY(180deg) translateZ(${D / 2}px)` }}
        >
          {artwork(1)}
          <span className="pack3d-froisse" aria-hidden="true" />
          <span className="pack3d-crimp pack3d-crimp-top" aria-hidden="true" />
          <span className="pack3d-crimp pack3d-crimp-bottom" aria-hidden="true" />
        </div>

        {/* Tranche gauche */}
        <div
          className="pack3d-face pack3d-edge"
          style={{
            width: D,
            height: H,
            left: W / 2 - D / 2,
            transform: `rotateY(-90deg) translateZ(${W / 2}px)`,
          }}
        />

        {/* Tranche droite */}
        <div
          className="pack3d-face pack3d-edge"
          style={{
            width: D,
            height: H,
            left: W / 2 - D / 2,
            transform: `rotateY(90deg) translateZ(${W / 2}px)`,
          }}
        />

        {/* Opercule du haut */}
        <div
          className="pack3d-face pack3d-edge"
          style={{
            width: W,
            height: D,
            top: H / 2 - D / 2,
            transform: `rotateX(90deg) translateZ(${H / 2}px)`,
          }}
        />

        {/* Fond du sachet */}
        <div
          className="pack3d-face pack3d-edge"
          style={{
            width: W,
            height: D,
            top: H / 2 - D / 2,
            transform: `rotateX(-90deg) translateZ(${H / 2}px)`,
          }}
        />

        <span className="pack3d-shadow" aria-hidden="true" />
      </div>
    </div>
  );
}
