/**
 * Le mélange avant le rail (15/11/2026), joué sur les **vraies cartes du rail**.
 *
 * La vidéo d'ouverture s'arrête quand les cartes jaillissent du booster et
 * s'efface ; les cinq premières cartes de la bande — celles qu'on voit au départ — apparaissent en paquet au milieu, se
 * mélangent, s'étalent à leur place, et la bande prend de l'élan jusqu'à la
 * vitesse du rail. Le rail reprend alors sa course là, déjà lancé
 * (`entame`) : ce sont les mêmes éléments du début à la fin, rien ne change à
 * l'œil.
 *
 * Tout se mesure en pixels de mise en page (`offsetLeft`), pas à l'écran :
 * l'overlay est mis à l'échelle de sa source.
 */

import { COURBE_MESUREE } from '@/lib/spin/courbe';

/**
 * L'allure d'une ouverture de booster (17/11/2026) : la course du rail est
 * jouée en accéléré — la même forme, en 70 % du temps —, la vidéo plus vite,
 * le mélange plus court. Le site et l'overlay la partagent.
 */
export const ALLURE_OUVERTURE = 0.7;
/** La durée de la course du rail d'une ouverture, en ms. */
export const DUREE_OUVERTURE = Math.round(COURBE_MESUREE.duree * ALLURE_OUVERTURE);
/** La vitesse de lecture de la vidéo d'ouverture. */
export const VITESSE_VIDEO = 1.35;
/** Le temps laissé sur la carte posée avant la suite. */
export const REPOS_OUVERTURE = 800;

/** Le rail a fait ces millisecondes de course à la fin de l'élan : 200 ms du barème nominal. */
export const ENTAME_MELANGE = Math.round(200 * ALLURE_OUVERTURE);
/** La distance de l'élan, en cartes : la course du rail à 200 ms du barème nominal. */
const ELAN_CARTES = 6.2203;
/**
 * La durée de l'élan : une accélération constante jusqu'à la vitesse du rail.
 * Le rail allant plus vite, l'élan est plus court d'autant — la même distance,
 * une vitesse d'arrivée plus haute.
 */
const ELAN_MS = Math.round(500 * ALLURE_OUVERTURE);

const attendre = (a: Animation) => a.finished.catch(() => undefined);
const dors = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Joue le mélange dans le rail qui attend à son départ. Résout juste avant la
 * fin de l'élan, avec l'instant (`performance.now()`) où il s'achève.
 */
export async function joueMelange(cadre: HTMLElement): Promise<number> {
  const ruban = cadre.querySelector<HTMLElement>('[data-rail-ruban]');
  const fenetre = ruban?.parentElement;
  const tuiles = ruban ? ([...ruban.children] as HTMLElement[]) : [];
  if (!ruban || !fenetre || tuiles.length < 7) return performance.now();

  const pas = tuiles[2].offsetLeft - tuiles[1].offsetLeft;
  const largeur = tuiles[3].offsetWidth;
  const hauteur = tuiles[3].offsetHeight;
  const depart = new DOMMatrix(getComputedStyle(ruban).transform).m41;
  const paquet = [1, 2, 3, 4, 5];
  const autres = tuiles.filter((_, k) => !paquet.includes(k));

  cadre.dataset.melange = '';
  // Les cartes du paquet, empilées sur la carte du milieu, un rien décalées.
  const pile = (k: number) =>
    `translate(${(3 - k) * pas + (k - 3) * 3}px, ${(3 - k) * 2}px)`;
  for (const t of autres) t.style.opacity = '0';
  for (const k of paquet) {
    const t = tuiles[k];
    t.style.transform = pile(k);
    t.style.zIndex = String(k);
    t.style.opacity = '0';
  }

  // Les cartes apparaissent pendant que la vidéo s'efface dessous.
  await dors(80);
  const apparitions = paquet.map((k) =>
    tuiles[k].animate(
      [
        { opacity: 0, transform: `${pile(k)} scale(0.86)` },
        { opacity: 1, transform: `${pile(k)} scale(1)` },
      ],
      { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    ),
  );
  for (const k of paquet) tuiles[k].style.opacity = '1';
  await Promise.all(apparitions.map(attendre));

  // Le mélange : à tour de rôle, une carte sort du paquet par un côté et
  // revient devant — trois passes (cinq jusqu'au 17/11/2026).
  let dessus = 6;
  for (let passe = 0; passe < 3; passe += 1) {
    const k = paquet[(passe * 2) % 5];
    const t = tuiles[k];
    const sens = passe % 2 === 0 ? 1 : -1;
    const sortie = t.animate(
      [
        { transform: pile(k) },
        {
          transform: `${pile(k)} translate(${sens * largeur * 0.62}px, -${hauteur * 0.04}px) rotate(${sens * 7}deg)`,
        },
      ],
      { duration: 130, easing: 'cubic-bezier(0.3, 0, 0.4, 1)', fill: 'forwards' },
    );
    await attendre(sortie);
    t.style.zIndex = String(dessus++);
    const retour = t.animate(
      [
        {
          transform: `${pile(k)} translate(${sens * largeur * 0.62}px, -${hauteur * 0.04}px) rotate(${sens * 7}deg)`,
        },
        { transform: pile(k) },
      ],
      { duration: 150, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
    );
    await attendre(retour);
    sortie.cancel();
  }

  // L'étalement : chaque carte rejoint sa place dans la bande ; les autres
  // cartes de la bande reparaissent.
  const etalement = paquet.map((k) =>
    tuiles[k].animate([{ transform: pile(k) }, { transform: 'none' }], {
      duration: 380,
      easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)',
    }),
  );
  for (const k of paquet) tuiles[k].style.transform = '';
  for (const t of autres) {
    t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    t.style.opacity = '';
  }
  await Promise.all(etalement.map(attendre));

  // L'élan : une accélération constante vers la gauche, jusqu'à la vitesse du
  // rail à 200 ms de course (une courbe en t²).
  const elan = ruban.animate(
    [
      { transform: `translate3d(${depart}px, 0, 0)` },
      { transform: `translate3d(${depart - ELAN_CARTES * pas}px, 0, 0)` },
    ],
    { duration: ELAN_MS, easing: 'cubic-bezier(0.333, 0, 0.667, 0.333)', fill: 'forwards' },
  );
  // On rend la main un peu avant la fin de l'élan : le rail se monte pendant
  // ses dernières images et part à l'instant exact où il finit (`depuis`).
  const fin = performance.now() + ELAN_MS;
  await dors(ELAN_MS - 40);

  // Le rail prend la main sur ce même élément : on range derrière lui.
  setTimeout(() => {
    elan.cancel();
    for (const k of paquet) {
      tuiles[k].style.zIndex = '';
      tuiles[k].style.opacity = '';
    }
    delete cadre.dataset.melange;
  }, 200);
  return fin;
}
