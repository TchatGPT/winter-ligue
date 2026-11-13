'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { BlocDeGlace, EclatBooster } from '@/components/GlaceBooster';

/** Un booster de la vitrine : sa planche, son nom court et ce qui le fait tomber. */
export interface BoosterEnVitrine {
  id: string;
  /** « Booster Perso » : le nom complet, pour la planche. */
  nom: string;
  /** « Perso » : le nom gravé sur son cartel. */
  court: string;
  /** « Tous les 35 subs du live » : ce qui le fait tomber, en quelques mots. */
  quand: string;
  /** Ouvert pour un joueur (`toi`), ou tiré pour la ligue (`ligue`). */
  pour: 'toi' | 'ligue';
  /** Comment il tombe, en entier, pour sa fenêtre. */
  comment: string;
  /** Sur qui tombe sa carte, pour sa fenêtre. */
  qui: string;
  gradient: [string, string];
  art: string | null;
  rarete: string;
}

/**
 * La vitrine de l'accueil : les quatre boosters en éventail, en lévitation
 * au-dessus d'une banquise.
 *
 * Ce qui la pose : la glace sous eux — une arête claire, puis le sol qui
 * s'assombrit vers nous — et leur reflet dedans. Devant, un cartel par
 * booster : son nom, pour qui il est, et ce qui le fait tomber. Rien ne
 * brille, et rien de noir sous eux (13/11/2026 : les ombres de contact sont
 * parties).
 *
 * Trois gestes :
 *  - la souris déplace l'éventail de quelques pixels, chaque booster selon sa
 *    profondeur (`--px`, `--py`, une fois par image au plus) ;
 *  - un booster survolé, ou son cartel, se redresse et monte, son reflet avec
 *    lui, pendant que les autres s'effacent un peu ;
 *  - un clic, ou un doigt, brise sa glace : il s'ouvre en grand, la glace
 *    éclate, et trois de ses cartes en sortent (`EclatBooster`).
 *
 * Chaque booster est pris dans un bloc de glace (`BlocDeGlace`).
 *
 * Le reflet est le même éventail, retourné : il lévite et suit la souris à
 * l'envers, comme un vrai reflet.
 */
export function VitrineBoosters({ boosters, entree }: { boosters: BoosterEnVitrine[]; entree: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [choix, setChoix] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<BoosterEnVitrine | null>(null);

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
  });
  const sachet = (b: BoosterEnVitrine) => (
    <div className="acc-eventail-leve">
      <div className="acc-eventail-parallaxe">
        <BlocDeGlace graine={`vitrine-${b.id}`}>
          <BoosterPack3D name={b.nom} cardCount={1} gradient={b.gradient} art={b.art} rarete={b.rarete} vignette frozen />
        </BlocDeGlace>
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
        <div className="acc-sachets" aria-hidden="true">
          {boosters.map((b, i) => (
            <div
              key={b.id}
              className="acc-eventail-sachet"
              data-choisi={choix === b.id ? '' : undefined}
              style={place(i)}
              {...gestes(b.id)}
              onClick={() => setOuvert(b)}
            >
              {sachet(b)}
            </div>
          ))}
        </div>
        <ul className="acc-cartels" aria-label="Les quatre boosters">
          {boosters.map((b, i) => (
            <li key={b.id} className="acc-cartel" data-choisi={choix === b.id ? '' : undefined} style={place(i)}>
              <button type="button" {...gestes(b.id)} onClick={() => setOuvert(b)}>
                <b>
                  <span className="sr-only">Voir les cartes du Booster </span>
                  {b.court}
                </b>
                <span className="acc-cartel-pour" data-pour={b.pour}>
                  {b.pour === 'toi' ? 'pour toi' : 'pour la ligue'}
                </span>
                <span className="acc-cartel-quand">{b.quand}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="acc-vitrine-indice">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 11.5V5.8a1.6 1.6 0 0 1 3.2 0V11m0-1.2a1.6 1.6 0 0 1 3.2 0v1.6m0-.6a1.6 1.6 0 0 1 3.2 0v3.4a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.8-2.4L4.6 14a1.6 1.6 0 0 1 2.5-2l1.9 2" />
        </svg>
        Brise la glace d’un booster pour voir ses cartes
      </p>
      {ouvert && <EclatBooster booster={ouvert} entree={entree} onClose={() => setOuvert(null)} />}
    </div>
  );
}
