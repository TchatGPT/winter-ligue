'use client';

/**
 * La rangée des quatre packs : flèches, détection de débordement, balayage
 * tactile. Un seul carrousel pour tout le site.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BoosterPack3D } from '@/components/BoosterPack3D';
import { GEMME_DU_PACK, packArt } from '@/lib/domain/catalog';
import type { PackDefinition } from '@/lib/domain/types';

/**
 * L'aurore derrière le sachet retenu, de la plus discrète à la plus riche :
 * le Perso, qu'on ouvre le plus souvent, n'a qu'une brume et un voile ; le
 * Finisseur, une fois par joueur et par saison, trois voiles et des paillettes
 * d'or. Les couleurs de chacun vivent dans `app/globals.css` (`.aurore`).
 */
const NIVEAU_AURORE: Record<string, 1 | 2 | 3 | 4> = {
  perso: 1,
  commu: 2,
  folie: 3,
  finisseur: 4,
};

export function RangeePacks({
  packs: boosters,
  selection,
  onSelection,
  fige = false,
  onOuvrir,
  ouvrable = false,
}: {
  packs: PackDefinition[];
  selection: string;
  onSelection: (id: string) => void;
  /** Neutralise le choix, et arrête la respiration des sachets. */
  fige?: boolean;
  /** Le double-clic sur le sachet retenu, quand la page en propose un. */
  onOuvrir?: () => void;
  ouvrable?: boolean;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const rangee = useRef<HTMLDivElement>(null);
  const cases = useRef<(HTMLDivElement | null)[]>([]);

  const rang = Math.max(
    0,
    boosters.findIndex((b) => b.id === selection),
  );

  /**
   * Pose l'aurore derrière le sachet retenu : le centre de sa case et sa
   * largeur, écrits en variables sur le cadre. Elle vit hors de la rangée, qui
   * défile et rogne donc tout ce qui dépasse : dans le cadre, elle peut monter
   * au-dessus des sachets et s'étendre entre eux. La largeur est celle de la
   * mise en page, pas celle de l'écran : le sachet retenu grandit de 7 % en
   * transition, l'aurore ne doit pas le suivre à la trace.
   *
   * La première pose se fait sans glisser : le cadre ne reçoit `data-aurore`
   * qu'à l'image suivante, et c'est lui qui allume la transition.
   */
  const placeAurore = useCallback(() => {
    const k = cadre.current;
    const c = cases.current[rang];
    if (!k || !c) return;
    const rk = k.getBoundingClientRect();
    const rc = c.getBoundingClientRect();
    k.style.setProperty('--aurore-x', `${rc.left - rk.left + rc.width / 2}px`);
    k.style.setProperty('--aurore-l', `${c.offsetWidth}px`);
    if (!k.dataset.aurore) requestAnimationFrame(() => (k.dataset.aurore = 'pret'));
  }, [rang]);

  useEffect(() => {
    placeAurore();
    const el = rangee.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(placeAurore);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [placeAurore]);

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
    // Mesuré sans le rembourrage qui amène les sachets des bouts au centre
    // (voir `.rangee[data-defile]`) : posé parce que la rangée déborde, il la
    // ferait déborder à jamais, même une fois l'écran élargi.
    const mesure = () => {
      const piste = el.firstElementChild as HTMLElement | null;
      if (!piste) return;
      const st = getComputedStyle(piste);
      const marge = parseFloat(st.getPropertyValue('--marge')) || 16;
      const contenu = piste.offsetWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) + 2 * marge;
      setDeborde(contenu > el.clientWidth + 4);
    };
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
    placeAurore();
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
    <div className="rangee-cadre" ref={cadre}>
      <div className="aurore-cadre" aria-hidden="true">
        <div className="aurore" data-pack={selection} data-niveau={NIVEAU_AURORE[selection] ?? 1}>
          <span className="aurore-brume" />
          <span className="aurore-voile aurore-voile-1" />
          <span className="aurore-voile aurore-voile-2" />
          <span className="aurore-voile aurore-voile-3" />
          <span className="aurore-voile aurore-voile-4" />
          <span className="aurore-paillettes" />
        </div>
      </div>

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
        data-defile={deborde ? '' : undefined}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        role="listbox"
        aria-label="Choix du booster"
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
                      ? `Ouvrir le ${b.name} — double-clic`
                      : `Choisir le ${b.name}`
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
                      cardCount={1}
                      gradient={b.gradient}
                      art={packArt(b.id)}
                      frozen={fige}
                      rarete={GEMME_DU_PACK[b.id]}
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
