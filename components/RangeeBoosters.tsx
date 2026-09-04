'use client';

/**
 * La rangée de sachets, et le seul endroit où elle est écrite.
 *
 * Elle vivait dans `BoosterOpening`, avec ses flèches, sa détection de
 * débordement et son balayage tactile. La page des batailles, qui demande
 * exactement le même geste — choisir un sachet parmi quatre — en avait reçu une
 * version amputée : la rangée défilait, mais sans flèches. Sur un téléphone,
 * deux sachets sur quatre étaient donc hors du cadre sans que rien ne le dise.
 *
 * Deux implémentations d'un même carrousel finissent toujours par diverger, et
 * celle-ci avait déjà commencé. Il n'y en a plus qu'une.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { boosterArt, boosterSize } from '@/lib/domain/catalog';
import type { BoosterDefinition } from '@/lib/domain/types';

export function RangeeBoosters({
  boosters,
  selection,
  onSelection,
  fige = false,
  onOuvrir,
  ouvrable = false,
}: {
  boosters: BoosterDefinition[];
  selection: string;
  onSelection: (id: string) => void;
  /** Neutralise le choix, et arrête la respiration des sachets. */
  fige?: boolean;
  /** Le double-clic sur le sachet retenu, quand la page en propose un. */
  onOuvrir?: () => void;
  ouvrable?: boolean;
}) {
  const rangee = useRef<HTMLDivElement>(null);
  const cases = useRef<(HTMLDivElement | null)[]>([]);

  const rang = Math.max(
    0,
    boosters.findIndex((b) => b.id === selection),
  );

  /**
   * La rangée déborde-t-elle de sa boîte ?
   *
   * C'est ce qui décide de l'affichage des flèches. Une requête de média sur la
   * largeur de l'écran s'en approcherait sans jamais tomber juste : ce qui
   * compte est de savoir si les sachets tiennent côte à côte, ce qui dépend
   * aussi de la largeur de la fenêtre sur un ordinateur, et du niveau de zoom.
   */
  const [deborde, setDeborde] = useState(false);

  useEffect(() => {
    const el = rangee.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const mesure = () => setDeborde(el.scrollWidth > el.clientWidth + 4);
    mesure();
    const observateur = new ResizeObserver(mesure);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [boosters.length]);

  /** Amène un sachet au centre de la rangée, quand elle défile. */
  const defileVers = (i: number) => {
    const el = rangee.current;
    const c = cases.current[i];
    if (!el || !c) return;
    el.scrollTo({
      left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2,
      behavior: 'smooth',
    });
  };

  /**
   * Le sachet le plus proche du centre devient le sachet retenu.
   *
   * C'est ce qui rend le balayage tactile équivalent au clic : on pousse la
   * rangée, et chaque sachet qui passe devant marque son passage. Sur un écran
   * large la rangée ne défile pas, et ce gestionnaire ne se déclenche jamais.
   */
  const onScroll = () => {
    if (fige) return;
    const el = rangee.current;
    if (!el) return;
    const milieu = el.scrollLeft + el.clientWidth / 2;
    let plusProche = 0;
    let ecart = Infinity;
    cases.current.forEach((c, i) => {
      if (!c) return;
      const centre = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(centre - milieu);
      if (d < ecart) {
        ecart = d;
        plusProche = i;
      }
    });
    const b = boosters[plusProche];
    if (b) onSelection(b.id);
  };

  /** Un cran à gauche ou à droite, par les flèches ou par le clavier. */
  const decale = useCallback(
    (pas: number) => {
      if (fige) return;
      const cible = Math.max(0, Math.min(boosters.length - 1, rang + pas));
      const b = boosters[cible];
      if (!b) return;
      onSelection(b.id);
      defileVers(cible);
    },
    [boosters, fige, onSelection, rang],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const pas = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!pas) return;
    event.preventDefault();
    decale(pas);
  };

  return (
    <div className="rangee-cadre">
      {deborde && (
        <button
          type="button"
          className="rangee-fleche rangee-fleche-avant"
          onClick={() => decale(-1)}
          disabled={fige || rang === 0}
          aria-label="Sachet précédent"
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}

      <div
        ref={rangee}
        className={`rangee ${fige ? 'rangee-gros-plan' : ''}`}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        role="listbox"
        aria-label="Choix du sachet"
        tabIndex={0}
      >
        {/* La piste porte les sachets et se centre elle-même : un
            `justify-content: center` sur la boîte qui défile rogne le premier
            sachet dès que le contenu déborde, alors qu'une marge automatique sur
            une piste aussi large que son contenu reste centrée sans rogner. */}
        <div className="rangee-piste">
          {boosters.map((b, i) => {
            const actif = b.id === selection;
            return (
              <div
                key={b.id}
                ref={(el) => {
                  cases.current[i] = el;
                }}
                className={`rangee-case ${actif ? 'rangee-case-actif' : ''}`}
                role="option"
                aria-selected={actif}
              >
                <button
                  type="button"
                  className="rangee-prise"
                  disabled={fige}
                  aria-label={
                    actif && ouvrable
                      ? `Ouvrir le sachet ${b.name} — double-clic`
                      : `Choisir le sachet ${b.name}`
                  }
                  onClick={() => {
                    if (fige) return;
                    // Un clic sur le sachet déjà retenu ne fait rien : il n'y a
                    // qu'un seul geste sur cet objet, le double-clic qui l'ouvre.
                    // Un simple clic qui agirait aussi déclencherait l'ouverture
                    // au premier des deux.
                    if (actif) return;
                    onSelection(b.id);
                    defileVers(i);
                  }}
                  onDoubleClick={() => {
                    if (!actif || fige || !ouvrable) return;
                    onOuvrir?.();
                  }}
                >
                  <div className="scene">
                    <BoosterPack3D
                      name={b.name}
                      cardCount={boosterSize(b)}
                      gradient={b.gradient}
                      art={boosterArt(b.id)}
                      frozen={fige}
                      rarete={b.guaranteed}
                      vignette={!actif}
                    />
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {deborde && (
        <button
          type="button"
          className="rangee-fleche rangee-fleche-apres"
          onClick={() => decale(1)}
          disabled={fige || rang === boosters.length - 1}
          aria-label="Sachet suivant"
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}
