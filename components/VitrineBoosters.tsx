'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';

/** Un booster de la vitrine : sa planche, son nom court et ce qui le fait tomber. */
export interface BoosterEnVitrine {
  id: string;
  /** « Booster Perso » : le nom complet, pour la planche. */
  nom: string;
  /** « Perso » : le nom gravé sur son cartel. */
  court: string;
  /** « tous les 35 subs » : ce qui le fait tomber. */
  quand: string;
  gradient: [string, string];
  art: string | null;
  rarete: string;
}

/**
 * La vitrine de l'accueil : les quatre boosters en éventail, en lévitation
 * au-dessus d'une banquise.
 *
 * Ce qui la pose : la glace sous eux — une arête claire, puis le sol qui
 * s'assombrit vers nous —, leur reflet dedans, une ombre de contact sous
 * chacun, et devant, un cartel par booster : son nom, et ce qui le fait
 * tomber. Rien ne brille : c'est le reflet et l'ombre qui disent qu'ils sont
 * là.
 *
 * Deux gestes, sans rien cacher derrière :
 *  - la souris déplace l'éventail de quelques pixels, chaque booster selon sa
 *    profondeur (`--px`, `--py`, une fois par image au plus) ;
 *  - un booster survolé — ou son cartel, ou touché du doigt — se redresse et
 *    monte, son reflet et son ombre avec lui, pendant que les autres
 *    s'effacent un peu.
 *
 * Le reflet est le même éventail, retourné : il lévite et suit la souris à
 * l'envers, comme un vrai reflet.
 */
export function VitrineBoosters({ boosters }: { boosters: BoosterEnVitrine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [choix, setChoix] = useState<string | null>(null);
  /** Le dernier pointeur posé : un doigt choisit au toucher, la souris au survol. */
  const pointeur = useRef('mouse');

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

  // La place dans l'arc (-1,5 à gauche, +1,5 à droite) et le rang de
  // distribution, du premier au dernier.
  const place = (i: number) => {
    const o = i - (boosters.length - 1) / 2;
    return { ['--o' as string]: o, ['--o-abs' as string]: Math.abs(o), ['--rang' as string]: i } as CSSProperties;
  };
  const gestes = (id: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') setChoix(id);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') setChoix((c) => (c === id ? null : c));
    },
    onPointerDown: (e: React.PointerEvent) => {
      pointeur.current = e.pointerType;
    },
    onClick: () => {
      if (pointeur.current !== 'mouse') setChoix((c) => (c === id ? null : id));
    },
  });
  const sachet = (b: BoosterEnVitrine) => (
    <div className="acc-eventail-leve">
      <div className="acc-eventail-parallaxe">
        <BoosterPack3D name={b.nom} cardCount={1} gradient={b.gradient} art={b.art} rarete={b.rarete} vignette />
      </div>
    </div>
  );

  return (
    <div className="acc-vitrine">
      <div ref={ref} className="acc-eventail" data-choix={choix ?? undefined}>
        <span className="acc-sol" aria-hidden="true" />
        <div className="acc-reflet" aria-hidden="true">
          {boosters.map((b, i) => (
            <div
              key={b.id}
              className="acc-eventail-sachet"
              data-choisi={choix === b.id ? '' : undefined}
              style={place(i)}
            >
              {sachet(b)}
            </div>
          ))}
        </div>
        <div className="acc-ombres" aria-hidden="true">
          {boosters.map((b, i) => (
            <span key={b.id} data-choisi={choix === b.id ? '' : undefined} style={place(i)} />
          ))}
        </div>
        <div className="acc-sachets" aria-hidden="true">
          {boosters.map((b, i) => (
            <div
              key={b.id}
              className="acc-eventail-sachet"
              data-choisi={choix === b.id ? '' : undefined}
              style={place(i)}
              {...gestes(b.id)}
            >
              {sachet(b)}
            </div>
          ))}
        </div>
        <ul className="acc-cartels" aria-label="Les quatre boosters">
          {boosters.map((b, i) => (
            <li
              key={b.id}
              className="acc-cartel"
              data-choisi={choix === b.id ? '' : undefined}
              style={place(i)}
              {...gestes(b.id)}
            >
              <b>
                <span className="sr-only">Booster </span>
                {b.court}
              </b>
              <span>{b.quand}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
