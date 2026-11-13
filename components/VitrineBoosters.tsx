'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';

/** Un booster de l'accueil : sa planche, son nom court et ce qui le fait tomber. */
export interface BoosterEnVitrine {
  id: string;
  /** « Booster Perso » : le nom complet, pour la planche. */
  nom: string;
  /** « Perso » : le nom sous la planche. */
  court: string;
  /** « tous les 35 subs du live » : ce qui le fait tomber. */
  quand: string;
  gradient: [string, string];
  art: string | null;
  rarete: string;
}

/**
 * Les quatre boosters de l'accueil, autour du titre (13/11/2026) : deux à
 * gauche, deux à droite, tournés vers le centre, chacun avec son nom et ce
 * qui le fait tomber. Sur un téléphone, ils se rangent en une ligne au-dessus
 * du titre.
 *
 * Ils suivent la souris de quelques pixels, chacun selon sa profondeur
 * (`--px`, `--py`, une fois par image au plus) ; celui qu'on survole se
 * redresse et monte, les autres s'effacent un peu.
 */
export function VitrineBoosters({ boosters }: { boosters: BoosterEnVitrine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [choix, setChoix] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let image = 0;
    let x = 0;
    let y = 0;
    const bouge = (e: PointerEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (image) return;
      image = requestAnimationFrame(() => {
        image = 0;
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    window.addEventListener('pointermove', bouge, { passive: true });
    return () => {
      window.removeEventListener('pointermove', bouge);
      cancelAnimationFrame(image);
    };
  }, []);

  const moitie = Math.ceil(boosters.length / 2);
  return (
    <div ref={ref} className="acc-boosters" data-choix={choix ?? undefined}>
      <ul aria-label="Les quatre boosters">
        {boosters.map((b, i) => {
          const gauche = i < moitie;
          // 0 pour le booster du bord, 1 pour celui près du titre.
          const pres = gauche ? i : boosters.length - 1 - i;
          return (
            <li
              key={b.id}
              className="acc-booster"
              data-cote={gauche ? 'g' : 'd'}
              data-choisi={choix === b.id ? '' : undefined}
              style={{ ['--i' as string]: i, ['--pres' as string]: pres } as CSSProperties}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setChoix(b.id)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setChoix((c) => (c === b.id ? null : c))}
            >
              <div className="acc-booster-leve" aria-hidden="true">
                <div className="acc-booster-parallaxe">
                  <BoosterPack3D
                    name={b.nom}
                    cardCount={1}
                    gradient={b.gradient}
                    art={b.art}
                    rarete={b.rarete}
                    vignette
                  />
                </div>
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
  );
}
