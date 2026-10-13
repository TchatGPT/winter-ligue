'use client';

import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { CardFrame } from '@/components/CardFrame';
import { CarteInclinable } from '@/components/CarteInclinable';
import type { Rarity } from '@/lib/domain/types';

export interface BoosterPresente {
  id: string;
  nom: string;
  accroche: string;
  declencheur: string;
  gradient: [string, string];
  art: string | null;
  gemme: Rarity | null;
  cartes: { cardId: string; name: string; rarity: string; glyph: string; nature: 'bonus' | 'malus' }[];
}

/**
 * Les boosters de l'accueil, en présentoir.
 *
 * Quatre sachets côte à côte. Un clic sur l'un en fait sortir ses cartes, en
 * éventail par le haut : elles dépassent du sachet, qui reste devant. On les
 * survole — chacune penche et se soulève (`CarteInclinable`) —, on ne clique
 * pas dessus : elles montrent ce qu'on peut tirer, rien de plus. Un second
 * clic referme le sachet.
 *
 * L'éventail est centré sur son sachet, puis ramené dans le présentoir s'il en
 * déborde : celui du bout de la rangée ne sort pas de l'écran.
 */
export function PresentoirBoosters({ boosters }: { boosters: BoosterPresente[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const presentoir = useRef<HTMLDivElement>(null);
  const eventail = useRef<HTMLDivElement>(null);
  const [decalage, setDecalage] = useState(0);
  const actif = boosters.find((b) => b.id === ouvert) ?? null;

  // L'éventail ne sort pas du présentoir : mesuré une fois posé, et à chaque
  // changement de taille de la fenêtre.
  useLayoutEffect(() => {
    const ajuste = () => {
      const cadre = presentoir.current?.getBoundingClientRect();
      const cartes = eventail.current;
      if (!cadre || !cartes) {
        setDecalage(0);
        return;
      }
      let gauche = Infinity;
      let droite = -Infinity;
      for (const c of Array.from(cartes.children)) {
        const r = c.getBoundingClientRect();
        gauche = Math.min(gauche, r.left);
        droite = Math.max(droite, r.right);
      }
      setDecalage((avant) => {
        const g = gauche - avant;
        const d = droite - avant;
        if (g < cadre.left) return cadre.left - g;
        if (d > cadre.right) return cadre.right - d;
        return 0;
      });
    };
    ajuste();
    window.addEventListener('resize', ajuste);
    return () => window.removeEventListener('resize', ajuste);
  }, [ouvert]);

  return (
    <div ref={presentoir} className="pres" data-ouvert={ouvert ?? undefined}>
      <ul className="pres-rangee">
        {boosters.map((b) => {
          const estOuvert = b.id === ouvert;
          const n = b.cartes.length;
          return (
            <li key={b.id} className="pres-booster" data-actif={estOuvert || undefined}>
              <div className="pres-zone">
                {estOuvert && (
                  <div
                    ref={eventail}
                    className="pres-cartes"
                    style={{ ['--n' as string]: n, ['--decalage' as string]: `${decalage}px` } as CSSProperties}
                    aria-label={`Les ${n} cartes du ${b.nom}`}
                  >
                    {b.cartes.map((c, k) => (
                      <div
                        key={c.cardId}
                        className="pres-carte"
                        style={{ ['--k' as string]: k, ['--d' as string]: k - (n - 1) / 2 } as CSSProperties}
                      >
                        <CarteInclinable>
                          <CardFrame
                            cardId={c.cardId}
                            name={c.name}
                            rarity={c.rarity}
                            glyph={c.glyph}
                            nature={c.nature}
                          />
                        </CarteInclinable>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="pres-sachet"
                  aria-pressed={estOuvert}
                  aria-label={estOuvert ? `Refermer le ${b.nom}` : `Voir les cartes du ${b.nom}`}
                  onClick={() => setOuvert(estOuvert ? null : b.id)}
                >
                  <BoosterPack3D
                    name={b.nom}
                    cardCount={n}
                    gradient={b.gradient}
                    art={b.art}
                    rarete={b.gemme}
                    vignette
                  />
                </button>
              </div>
              <p className="pres-nom">{b.nom}</p>
              <p className="pres-accroche">{b.accroche}</p>
            </li>
          );
        })}
      </ul>
      <p className="pres-indice" aria-live="polite">
        {actif ? (
          <>
            <b>{actif.nom}</b> · {actif.cartes.length} cartes · {actif.declencheur}{' '}
            <span>Survole-les, clique encore pour refermer.</span>
          </>
        ) : (
          'Clique sur un booster pour voir ses cartes.'
        )}
      </p>
    </div>
  );
}
