'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PackArtwork } from './PackArtwork';

/**
 * Dimensions d'affichage, en pixels.
 *
 * Elles suivent exactement le ratio de la planche détourée — 1117 × 1981, soit
 * **1:1,774**, qui est aussi celui d'un booster du commerce (67 × 117 mm).
 * Toute autre valeur étirerait l'illustration : c'est ce qui déformait le
 * visage du soldat quand le sachet était à 1:2,1.
 */
const W = 200;
const H = 355;

/**
 * Écartement des deux films, en pixels.
 *
 * Un sachet, c'est deux feuilles de mylar soudées sur leurs quatre bords. Vu
 * par la tranche il ne fait presque rien — d'où cette valeur minuscule, qui
 * suffit à séparer le recto du verso sans jamais donner l'épaisseur d'une
 * boîte.
 */
const FILM = 1.5;

export interface Pack3DProps {
  name: string;
  cardCount: number;
  gradient: [string, string];
  /** Planche peinte du sachet. Absente, on retombe sur le sachet dessiné. */
  art?: string | null;
  /** Coupe la rotation continue, pendant l'ouverture par exemple. */
  frozen?: boolean;
  className?: string;
}

/**
 * Le sachet de booster, orientable à 360°.
 *
 * **La planche EST le sachet.** Elle est affichée telle quelle, sans rien
 * par-dessus et sans rien en dessous.
 *
 * Une version précédente montait six faces en CSS 3D — avant, arrière, deux
 * tranches, un opercule, un fond — et plaquait l'illustration sur la face
 * avant. Le résultat se lisait exactement pour ce qu'il était : un bloc à
 * épaisseur constante, avec une arête vive au sommet et une image collée
 * dessus. Or un vrai sachet n'a pas d'arête en haut, il y est soudé à plat.
 *
 * Il ne reste donc que deux plans sans épaisseur, ce qu'est physiquement un
 * sachet : le recto imprimé, le verso en mylar nu. Le sertissage, le
 * bombement et les plis ne sont plus simulés — ils sont dans la planche, où
 * ils ont toujours mieux rendu que des dégradés CSS.
 *
 * Au repos le sachet tourne lentement. Dès qu'on l'attrape, la rotation passe
 * sous le doigt avec de l'inertie au relâchement : c'est ce ralentissement
 * progressif qui fait qu'un objet manipulé semble avoir une masse.
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

  return (
    <div className={`sachet-scene ${className ?? ''}`} style={{ width: W, height: H }}>
      <div
        ref={packRef}
        className={`sachet ${grabbed || frozen ? '' : 'sachet-tourne'}`}
        style={{
          width: W,
          height: H,
          ['--p1' as string]: gradient[0],
          ['--p2' as string]: gradient[1],
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={`Sachet ${name}, ${cardCount} cartes — faites-le tourner`}
      >
        {/* Le recto : la planche, seule. */}
        <div className="sachet-face sachet-avant" style={{ transform: `translateZ(${FILM}px)` }}>
          {art ? (
            <Image
              src={art}
              alt=""
              aria-hidden="true"
              draggable={false}
              fill
              sizes="260px"
              className="sachet-planche"
              priority
            />
          ) : (
            <PackArtwork name={name} cardCount={cardCount} tint={gradient} />
          )}
          <span className="sachet-reflet" aria-hidden="true" />
        </div>

        {/* Le verso : mylar nu. Sur un vrai sachet, seul le recto est imprimé —
            le dos ne porte qu'un film brossé et la mention de série. */}
        <div
          className="sachet-face sachet-arriere"
          style={{ transform: `rotateY(180deg) translateZ(${FILM}px)` }}
        >
          <span className="sachet-dos" aria-hidden="true" />
          <span className="sachet-dos-titre" aria-hidden="true">
            {name.toUpperCase()}
          </span>
          <span className="sachet-reflet" aria-hidden="true" />
        </div>

        <span className="sachet-ombre" aria-hidden="true" />
      </div>
    </div>
  );
}
