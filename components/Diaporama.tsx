'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface Diapositive {
  cle: string;
  /** Son nom, pour les points de navigation et les lecteurs d'écran. */
  titre: string;
  contenu: ReactNode;
}

/**
 * Un diaporama de plaques de verre, qu'on fait défiler du doigt.
 *
 * La piste défile pour de vrai, avec un aimant au centre (`scroll-snap`) :
 * un doigt, un pavé tactile ou les flèches du clavier la font glisser sans
 * rien de plus. Les boutons et les points ne font que la faire défiler à leur
 * tour. La diapositive au centre est en pleine lumière, ses voisines reculent
 * et s'effacent sur les côtés.
 *
 * Tant qu'on n'y a pas touché, elle avance seule : la jauge du point allumé
 * se remplit, et à la fin, la suivante vient au centre. Elle s'arrête sous la
 * souris ou le focus, hors de l'écran, et pour de bon dès qu'on prend la main
 * — flèche, point, glissé. Le bouton de pause l'arrête ou la relance.
 */
export function Diaporama({ id, label, diapositives }: { id?: string; label: string; diapositives: Diapositive[] }) {
  const piste = useRef<HTMLDivElement>(null);
  const n = diapositives.length;
  const [actif, setActif] = useState(0);
  // Le défilement automatique : tant qu'on n'a pas pris la main.
  const [auto, setAuto] = useState(true);
  // Suspendu le temps d'un survol ou d'un focus.
  const [suspendu, setSuspendu] = useState(false);
  const [enVue, setEnVue] = useState(false);

  /** L'écart entre deux diapositives centrées : la largeur d'une, plus l'espace. */
  const pas = useCallback(() => {
    const els = piste.current?.querySelectorAll<HTMLElement>('[data-index]');
    if (!els || els.length < 2) return 0;
    return els[1].offsetLeft - els[0].offsetLeft;
  }, []);

  // La diapositive au centre, d'après le défilement : la piste est rembourrée
  // pour que la première soit centrée à zéro, la suivante à un pas, etc.
  useEffect(() => {
    const p = piste.current;
    if (!p) return;
    let image = 0;
    const releve = () => {
      if (image) return;
      image = requestAnimationFrame(() => {
        image = 0;
        const l = pas();
        if (l > 0) setActif(Math.max(0, Math.min(n - 1, Math.round(p.scrollLeft / l))));
      });
    };
    p.addEventListener('scroll', releve, { passive: true });
    window.addEventListener('resize', releve);
    return () => {
      p.removeEventListener('scroll', releve);
      window.removeEventListener('resize', releve);
      cancelAnimationFrame(image);
    };
  }, [n, pas]);

  // Hors de l'écran, rien n'avance.
  useEffect(() => {
    const p = piste.current;
    if (!p) return;
    const io = new IntersectionObserver(([e]) => setEnVue(e.isIntersecting && e.intersectionRatio >= 0.5), {
      threshold: [0, 0.5, 1],
    });
    io.observe(p);
    return () => io.disconnect();
  }, []);

  const aller = useCallback(
    (i: number) => {
      const p = piste.current;
      if (!p) return;
      p.scrollTo({ left: (((i % n) + n) % n) * pas(), behavior: 'smooth' });
    },
    [n, pas],
  );

  const prendLaMain = () => setAuto(false);
  const defile = auto && !suspendu && enVue;

  return (
    <section
      id={id}
      className="diaporama"
      aria-roledescription="carrousel"
      aria-label={label}
      data-defile={defile ? '' : undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setSuspendu(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setSuspendu(false)}
      onFocus={() => setSuspendu(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setSuspendu(false);
      }}
    >
      <div
        ref={piste}
        className="diaporama-piste"
        // Le clavier fait défiler la piste : ←, →, début, fin.
        tabIndex={0}
        onPointerDown={prendLaMain}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) prendLaMain();
        }}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) prendLaMain();
        }}
      >
        {diapositives.map((d, i) => (
          <div
            key={d.cle}
            data-index={i}
            className="diaporama-diapo"
            role="group"
            aria-roledescription="diapositive"
            aria-label={`${i + 1} sur ${n} : ${d.titre}`}
            data-actif={i === actif ? '' : undefined}
          >
            {d.contenu}
          </div>
        ))}
      </div>

      <div className="diaporama-nav">
        <button
          type="button"
          className="diaporama-fleche"
          aria-label="Diapositive précédente"
          onClick={() => {
            prendLaMain();
            aller(actif - 1);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6.5 9 12l5.5 5.5" />
          </svg>
        </button>
        <div className="diaporama-points">
          {diapositives.map((d, i) => (
            <button
              key={d.cle}
              type="button"
              aria-label={`${i + 1} sur ${n} : ${d.titre}`}
              aria-current={i === actif ? 'true' : undefined}
              onClick={() => {
                prendLaMain();
                aller(i);
              }}
            >
              <span className="diaporama-point">
                {/* La jauge du défilement : quand elle est pleine, on passe à la suivante. */}
                {i === actif && auto && <span className="diaporama-jauge" onAnimationEnd={() => aller(actif + 1)} />}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="diaporama-fleche"
          aria-label="Diapositive suivante"
          onClick={() => {
            prendLaMain();
            aller(actif + 1);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 6.5 15 12l-5.5 5.5" />
          </svg>
        </button>
        <button
          type="button"
          className="diaporama-pause"
          aria-label={auto ? 'Arrêter le défilement' : 'Faire défiler'}
          onClick={() => setAuto((a) => !a)}
        >
          {auto ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 7v10M15 7v10" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6.5v11l8.5-5.5Z" />
            </svg>
          )}
        </button>
      </div>
    </section>
  );
}
