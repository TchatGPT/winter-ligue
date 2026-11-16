'use client';

import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface TuileRegle {
  cle: string;
  theme: string;
  icone: ReactNode;
  titre: string;
  texte: ReactNode;
}

/**
 * Les règles de l'accueil en carrousel (16/11/2026) : une tuile au milieu, en
 * grand ; ses voisines, une de chaque côté, plus petites, tournées sur un arc
 * de cercle, qui s'effacent dans le fond. On passe de l'une à l'autre en
 * glissant (souris ou doigt), à la molette, aux flèches du clavier, en
 * cliquant une voisine, ou par les points au-dessus. Il tourne
 * en boucle.
 *
 * Chaque tuile reçoit sa distance à celle du milieu (`--d`, de -3 à 3, et sa
 * valeur absolue `--ad`) : le CSS en tire sa place, son angle, sa profondeur
 * et sa lumière (`.acc-carrousel`).
 */
export function CarrouselTuiles({ tuiles, label }: { tuiles: TuileRegle[]; label: string }) {
  const n = tuiles.length;
  const [actif, setActif] = useState(0);
  const scene = useRef<HTMLDivElement>(null);
  const va = useCallback((k: number) => setActif((a) => (((a + k) % n) + n) % n), [n]);

  // Glisser (souris ou doigt) : au-delà de 40 px, on passe à la voisine.
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    let depart: number | null = null;
    let fait = false;
    const bas = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      depart = e.clientX;
      fait = false;
    };
    const bouge = (e: PointerEvent) => {
      if (depart === null || fait) return;
      const dx = e.clientX - depart;
      if (Math.abs(dx) > 40) {
        fait = true;
        va(dx < 0 ? 1 : -1);
      }
    };
    const haut = () => {
      depart = null;
    };
    // Un glissé n'est pas un clic.
    const clic = (e: MouseEvent) => {
      if (fait) {
        e.preventDefault();
        e.stopPropagation();
        fait = false;
      }
    };
    // La molette : un cran, une tuile (pas plus d'une toutes les 450 ms).
    let dernier = 0;
    const molette = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 8) return;
      e.preventDefault();
      const t = performance.now();
      if (t - dernier < 450) return;
      dernier = t;
      va(delta > 0 ? 1 : -1);
    };
    el.addEventListener('pointerdown', bas);
    el.addEventListener('pointermove', bouge);
    el.addEventListener('pointerup', haut);
    el.addEventListener('pointercancel', haut);
    el.addEventListener('click', clic, true);
    el.addEventListener('wheel', molette, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', bas);
      el.removeEventListener('pointermove', bouge);
      el.removeEventListener('pointerup', haut);
      el.removeEventListener('pointercancel', haut);
      el.removeEventListener('click', clic, true);
      el.removeEventListener('wheel', molette);
    };
  }, [va]);

  return (
    <section
      className="acc-tuiles acc-carrousel"
      aria-label={label}
      aria-roledescription="carrousel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') va(1);
        else if (e.key === 'ArrowLeft') va(-1);
      }}
    >
      <div ref={scene} className="acc-carrousel-scene">
        {tuiles.map((t, i) => {
          // La distance à la tuile du milieu, la plus courte dans la boucle.
          let d = i - actif;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          return (
            <article
              key={t.cle}
              className="acc-tuile"
              data-centre={d === 0 ? '' : undefined}
              aria-hidden={d === 0 ? undefined : true}
              style={{ ['--d' as string]: d, ['--ad' as string]: Math.abs(d), ['--i' as string]: i } as CSSProperties}
              onClick={() => d !== 0 && Math.abs(d) <= 1 && va(d)}
            >
              <header>
                <span className="acc-tuile-icone" aria-hidden="true">
                  {t.icone}
                </span>
                <span className="acc-tuile-theme">{t.theme}</span>
              </header>
              <h2>{t.titre}</h2>
              <p>{t.texte}</p>
            </article>
          );
        })}
      </div>
      <nav className="acc-carrousel-nav" aria-label="Changer de règle">
        <ol>
          {tuiles.map((t, i) => (
            <li key={t.cle}>
              <button
                type="button"
                aria-label={t.titre}
                aria-current={i === actif ? 'true' : undefined}
                onClick={() => setActif(i)}
              />
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}
