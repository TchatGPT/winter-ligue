/**
 * Index des illustrations disponibles — FICHIER GÉNÉRÉ, ne pas éditer.
 *
 * Produit par `npm run cartes`, qui lit `public/cartes/` et
 * `public/boosters/`. Relancer la commande après avoir ajouté ou retiré un
 * visuel.
 */

export const CARD_ART: Record<string, string> = {
  'bocal-de-givre': '/cartes/bocal-de-givre.webp?v=31d96460f8',
  'bonhomme-de-neige': '/cartes/bonhomme-de-neige.webp?v=0cbedbb361',
  'chocolat-chaud': '/cartes/chocolat-chaud.webp?v=3cad6baf63',
  'congere': '/cartes/congere.webp?v=08c1d7e67d',
  'coulee-de-neige': '/cartes/coulee-de-neige.webp?v=8635a13872',
  'echo-lointain': '/cartes/echo-lointain.webp?v=1e8090fbee',
  'feu-de-camp': '/cartes/feu-de-camp.webp?v=02cf5b9392',
  'grand-degel': '/cartes/grand-degel.webp?v=aa98daf628',
  'joker-givre': '/cartes/joker-givre.webp?v=ecb2947835',
  'lanterne-givree': '/cartes/lanterne-givree.webp?v=1937a21319',
  'luge': '/cartes/luge.webp?v=eba66ea438',
  'marche-gelee': '/cartes/marche-gelee.webp?v=2d30a4aeab',
  'ouragan-blanc': '/cartes/ouragan-blanc.webp?v=0eae23d832',
  'permafrost': '/cartes/permafrost.webp?v=f5c809c738',
  'plaque-verglas-coup': '/cartes/plaque-verglas-coup.webp?v=e0498f5df3',
  'plaque-verglas': '/cartes/plaque-verglas.webp?v=e0498f5df3',
  'vent-porteur': '/cartes/vent-porteur.webp?v=ca8060b2b0',
};

export const BOOSTER_ART: Record<string, string> = {
  'commu': '/boosters/commu.webp?v=90990c113e',
  'finisseur': '/boosters/finisseur.webp?v=6c7007400a',
  'folie': '/boosters/folie.webp?v=4bbba7505f',
  'perso': '/boosters/perso.webp?v=e161ffa44d',
};

/**
 * Les vignettes des illustrations de cartes, de 200 et 480 px de large, et le
 * `srcset` qui les propose au navigateur avec l’illustration entière.
 */
export const CARD_VIGNETTES: Record<string, { petite: string; moyenne: string; srcset: string }> = {
  'bocal-de-givre': { petite: '/cartes/vignettes/bocal-de-givre.31d96460f8.200.webp', moyenne: '/cartes/vignettes/bocal-de-givre.31d96460f8.480.webp', srcset: '/cartes/vignettes/bocal-de-givre.31d96460f8.200.webp 200w, /cartes/vignettes/bocal-de-givre.31d96460f8.480.webp 480w, /cartes/bocal-de-givre.webp?v=31d96460f8 1000w' },
  'bonhomme-de-neige': { petite: '/cartes/vignettes/bonhomme-de-neige.0cbedbb361.200.webp', moyenne: '/cartes/vignettes/bonhomme-de-neige.0cbedbb361.480.webp', srcset: '/cartes/vignettes/bonhomme-de-neige.0cbedbb361.200.webp 200w, /cartes/vignettes/bonhomme-de-neige.0cbedbb361.480.webp 480w, /cartes/bonhomme-de-neige.webp?v=0cbedbb361 1000w' },
  'chocolat-chaud': { petite: '/cartes/vignettes/chocolat-chaud.3cad6baf63.200.webp', moyenne: '/cartes/vignettes/chocolat-chaud.3cad6baf63.480.webp', srcset: '/cartes/vignettes/chocolat-chaud.3cad6baf63.200.webp 200w, /cartes/vignettes/chocolat-chaud.3cad6baf63.480.webp 480w, /cartes/chocolat-chaud.webp?v=3cad6baf63 1000w' },
  'congere': { petite: '/cartes/vignettes/congere.08c1d7e67d.200.webp', moyenne: '/cartes/vignettes/congere.08c1d7e67d.480.webp', srcset: '/cartes/vignettes/congere.08c1d7e67d.200.webp 200w, /cartes/vignettes/congere.08c1d7e67d.480.webp 480w, /cartes/congere.webp?v=08c1d7e67d 1000w' },
  'coulee-de-neige': { petite: '/cartes/vignettes/coulee-de-neige.8635a13872.200.webp', moyenne: '/cartes/vignettes/coulee-de-neige.8635a13872.480.webp', srcset: '/cartes/vignettes/coulee-de-neige.8635a13872.200.webp 200w, /cartes/vignettes/coulee-de-neige.8635a13872.480.webp 480w, /cartes/coulee-de-neige.webp?v=8635a13872 1000w' },
  'echo-lointain': { petite: '/cartes/vignettes/echo-lointain.1e8090fbee.200.webp', moyenne: '/cartes/vignettes/echo-lointain.1e8090fbee.480.webp', srcset: '/cartes/vignettes/echo-lointain.1e8090fbee.200.webp 200w, /cartes/vignettes/echo-lointain.1e8090fbee.480.webp 480w, /cartes/echo-lointain.webp?v=1e8090fbee 1000w' },
  'feu-de-camp': { petite: '/cartes/vignettes/feu-de-camp.02cf5b9392.200.webp', moyenne: '/cartes/vignettes/feu-de-camp.02cf5b9392.480.webp', srcset: '/cartes/vignettes/feu-de-camp.02cf5b9392.200.webp 200w, /cartes/vignettes/feu-de-camp.02cf5b9392.480.webp 480w, /cartes/feu-de-camp.webp?v=02cf5b9392 1000w' },
  'grand-degel': { petite: '/cartes/vignettes/grand-degel.aa98daf628.200.webp', moyenne: '/cartes/vignettes/grand-degel.aa98daf628.480.webp', srcset: '/cartes/vignettes/grand-degel.aa98daf628.200.webp 200w, /cartes/vignettes/grand-degel.aa98daf628.480.webp 480w, /cartes/grand-degel.webp?v=aa98daf628 1000w' },
  'joker-givre': { petite: '/cartes/vignettes/joker-givre.ecb2947835.200.webp', moyenne: '/cartes/vignettes/joker-givre.ecb2947835.480.webp', srcset: '/cartes/vignettes/joker-givre.ecb2947835.200.webp 200w, /cartes/vignettes/joker-givre.ecb2947835.480.webp 480w, /cartes/joker-givre.webp?v=ecb2947835 1000w' },
  'lanterne-givree': { petite: '/cartes/vignettes/lanterne-givree.1937a21319.200.webp', moyenne: '/cartes/vignettes/lanterne-givree.1937a21319.480.webp', srcset: '/cartes/vignettes/lanterne-givree.1937a21319.200.webp 200w, /cartes/vignettes/lanterne-givree.1937a21319.480.webp 480w, /cartes/lanterne-givree.webp?v=1937a21319 1000w' },
  'luge': { petite: '/cartes/vignettes/luge.eba66ea438.200.webp', moyenne: '/cartes/vignettes/luge.eba66ea438.480.webp', srcset: '/cartes/vignettes/luge.eba66ea438.200.webp 200w, /cartes/vignettes/luge.eba66ea438.480.webp 480w, /cartes/luge.webp?v=eba66ea438 1000w' },
  'marche-gelee': { petite: '/cartes/vignettes/marche-gelee.2d30a4aeab.200.webp', moyenne: '/cartes/vignettes/marche-gelee.2d30a4aeab.480.webp', srcset: '/cartes/vignettes/marche-gelee.2d30a4aeab.200.webp 200w, /cartes/vignettes/marche-gelee.2d30a4aeab.480.webp 480w, /cartes/marche-gelee.webp?v=2d30a4aeab 1000w' },
  'ouragan-blanc': { petite: '/cartes/vignettes/ouragan-blanc.0eae23d832.200.webp', moyenne: '/cartes/vignettes/ouragan-blanc.0eae23d832.480.webp', srcset: '/cartes/vignettes/ouragan-blanc.0eae23d832.200.webp 200w, /cartes/vignettes/ouragan-blanc.0eae23d832.480.webp 480w, /cartes/ouragan-blanc.webp?v=0eae23d832 1000w' },
  'permafrost': { petite: '/cartes/vignettes/permafrost.f5c809c738.200.webp', moyenne: '/cartes/vignettes/permafrost.f5c809c738.480.webp', srcset: '/cartes/vignettes/permafrost.f5c809c738.200.webp 200w, /cartes/vignettes/permafrost.f5c809c738.480.webp 480w, /cartes/permafrost.webp?v=f5c809c738 1000w' },
  'plaque-verglas-coup': { petite: '/cartes/vignettes/plaque-verglas-coup.e0498f5df3.200.webp', moyenne: '/cartes/vignettes/plaque-verglas-coup.e0498f5df3.480.webp', srcset: '/cartes/vignettes/plaque-verglas-coup.e0498f5df3.200.webp 200w, /cartes/vignettes/plaque-verglas-coup.e0498f5df3.480.webp 480w, /cartes/plaque-verglas-coup.webp?v=e0498f5df3 1000w' },
  'plaque-verglas': { petite: '/cartes/vignettes/plaque-verglas.e0498f5df3.200.webp', moyenne: '/cartes/vignettes/plaque-verglas.e0498f5df3.480.webp', srcset: '/cartes/vignettes/plaque-verglas.e0498f5df3.200.webp 200w, /cartes/vignettes/plaque-verglas.e0498f5df3.480.webp 480w, /cartes/plaque-verglas.webp?v=e0498f5df3 1000w' },
  'vent-porteur': { petite: '/cartes/vignettes/vent-porteur.ca8060b2b0.200.webp', moyenne: '/cartes/vignettes/vent-porteur.ca8060b2b0.480.webp', srcset: '/cartes/vignettes/vent-porteur.ca8060b2b0.200.webp 200w, /cartes/vignettes/vent-porteur.ca8060b2b0.480.webp 480w, /cartes/vent-porteur.webp?v=ca8060b2b0 1000w' },
};
