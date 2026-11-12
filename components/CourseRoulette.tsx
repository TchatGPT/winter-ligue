'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DessinObstacle, PereNoel } from '@/components/BatailleArene';
import { demarreRoulement, sonDepart, sonFracas, type Roulement } from '@/components/sonsDuel';
import { avancee, ecritCourseRoulette } from '@/lib/domain/course';

/** La durée de la course, du départ à la ligne des premiers. */
const DUREE_MS = 7000;
/** Après la ligne, le temps de voir qui est resté à terre. */
const APRES_MS = 1600;

/** Un manteau par couloir : six couleurs du site, pour reconnaître chacun. */
const MANTEAUX = [
  'var(--noel-rouge)',
  'var(--noel-vert)',
  'var(--ice-3)',
  'var(--violet)',
  'var(--r-ur)',
  'var(--noel-acier)',
];

/**
 * La Roulette russe du Booster Folie (12/11/2026), courue comme un duel : six
 * pères Noël et leurs boules de neige, un couloir chacun. Tous passent la
 * ligne, sauf un, qui tombe — celui que le serveur a tiré à l'ouverture, le
 * premier des `pseudos`. La course est écrite par la graine (`ecritCourseRoulette`) :
 * l'écran de la modération et l'overlay du live montrent la même.
 *
 * Les couloirs sont ceux des duels, en 2D et plus fins : mêmes pères Noël,
 * mêmes obstacles, même chute.
 */
export function CourseRoulette({
  pseudos,
  graine,
  sourdine = false,
  onFini,
}: {
  /** Les joueurs tirés : le premier est celui qui ne passe pas la ligne. */
  pseudos: string[];
  graine: string;
  sourdine?: boolean;
  onFini?: () => void;
}) {
  const course = useMemo(() => ecritCourseRoulette(graine, pseudos.length), [graine, pseudos.length]);
  const couloirs = useRef<(HTMLDivElement | null)[]>([]);
  const [tombe, setTombe] = useState(false);
  const [arrives, setArrives] = useState(false);
  const rappel = useRef(onFini);
  useEffect(() => {
    rappel.current = onFini;
  }, [onFini]);

  useEffect(() => {
    const depart = performance.now();
    let image = 0;
    let chuteFaite = false;
    let finie = false;
    // Un seul roulement pour tout le peloton : six à la fois couvriraient la chute.
    const roulement: Roulement | null = sourdine ? null : demarreRoulement();
    if (!sourdine) sonDepart();

    const pas = () => {
      const e = performance.now() - depart;
      const u = Math.min(1, e / DUREE_MS);
      course.couloirs.forEach((c, i) => {
        const el = couloirs.current[i];
        const perdant = i === 0;
        const aTerre = perdant && u >= course.chute.instant;
        const p = aTerre ? course.chute.position : avancee(c.allure, u);
        if (aTerre && !chuteFaite) {
          chuteFaite = true;
          if (!sourdine) sonFracas();
          setTombe(true);
        }
        if (!el) return;
        el.style.setProperty('--p', p.toFixed(4));
        el.style.setProperty('--tour', `${Math.round(p * 1500)}deg`);
        for (const o of el.querySelectorAll<HTMLElement>('[data-obstacle]')) {
          if (p > Number(o.dataset.obstacle) + 0.012 && !(perdant && aTerre && Number(o.dataset.obstacle) === course.chute.position)) {
            o.dataset.passe = '';
          }
        }
      });
      roulement?.regle(u);
      if (u >= 1 && !finie) {
        finie = true;
        roulement?.arrete();
        setArrives(true);
        window.setTimeout(() => rappel.current?.(), APRES_MS);
        return;
      }
      image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => {
      cancelAnimationFrame(image);
      roulement?.arrete();
    };
  }, [course, sourdine]);

  return (
    <div className="course course-roulette" aria-label="La Roulette russe, courue comme un duel">
      {course.ordre.map((i) => {
        const perdant = i === 0;
        const etat = perdant ? (tombe ? 'chute' : 'course') : arrives ? 'victoire' : 'course';
        return (
          <div
            key={i}
            ref={(el) => {
              couloirs.current[i] = el;
            }}
            className="couloir"
            data-etat={etat}
            data-chute={perdant && tombe ? course.chute.type : undefined}
            style={{ ['--manteau' as string]: MANTEAUX[i % MANTEAUX.length] }}
          >
            <p className="couloir-nom">
              <b>{pseudos[i]}</b>
              {perdant && tombe && <span className="couloir-roulette-perdu">perdu</span>}
            </p>
            <span className="couloir-arrivee" aria-hidden="true" />
            {course.couloirs[i].obstacles.map((o) => (
              <span
                key={o.position}
                className="obstacle"
                data-obstacle={o.position}
                data-genre={o.genre}
                style={{ ['--q' as string]: o.position }}
                aria-hidden="true"
              >
                <DessinObstacle genre={o.genre} />
              </span>
            ))}
            <div className="attelage" aria-hidden="true">
              <span className="noel-ombre" />
              <PereNoel />
              <span className="boule">
                <i />
              </span>
              <span className="eclats">
                {Array.from({ length: 9 }, (_, k) => (
                  <i key={k} />
                ))}
              </span>
            </div>
            <span className="couloir-sol" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}
