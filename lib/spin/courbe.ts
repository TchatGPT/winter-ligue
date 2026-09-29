/**
 * La courbe du rail : la distance parcourue, son inverse, et ce qu'on en tire.
 *
 * Module **pur** — aucune entrée-sortie, aucun DOM, aucune horloge. C'est
 * volontaire et c'est tout l'intérêt : le ressenti d'un rail tient à quatre
 * nombres, et on ne peut les régler sans tout casser que s'ils vivent hors du
 * composant, sous test. `tests/spin.test.ts` verrouille ce fichier.
 *
 * Les valeurs et leur provenance sont dans `docs/SPEC.md`. Ne pas les changer
 * ici sans mettre à jour là-bas : ce sont des mesures, pas des préférences.
 */

/* --------------------------------------------------------------------------
 * Le mouvement
 * ------------------------------------------------------------------------ */

/** Durée nominale d'une course, en millisecondes. Mesurée : 1,8 s → 8,6 s. */
export const DUREE = 6800;

/**
 * Combien d'items la fenêtre montre à la fois.
 *
 * Mesuré chez eux : 2,4 — un bandeau de 293 px pour un pas de 125. La fenêtre
 * est basse, et c'est tout l'effet : on ne doit presque rien voir à la fois.
 *
 * Ici les tuiles sont des **cartes**, deux fois et demie plus hautes qu'un jeton
 * rond. À largeur de colonne égale on en voit donc moins, et 1,6 est le nombre
 * qui garde une carte pleine au centre avec ses deux voisines tranchées par le
 * bord — la même lecture que chez eux, à l'échelle de l'objet.
 */
export const VISIBLES = 1.6;

/** Ce que la vidéo montre : 37 items parcourus pour 2,4 visibles. */
const PARCOURS_MESURE = 37;
const VISIBLES_MESURE = 2.4;

/**
 * Combien d'items le rail franchit, du départ à l'arrêt.
 *
 * ## Pourquoi ce nombre est dérivé et non copié
 *
 * Copier les 37 items mesurés serait une faute dès qu'on change la taille des
 * tuiles. Ce qui gouverne la lisibilité n'est pas le nombre d'items par seconde
 * mais le nombre de **hauteurs de fenêtre** par seconde : entre deux images, le
 * contenu ne doit pas changer entièrement, sinon ce n'est plus du mouvement mais
 * un stroboscope — et cela se lit à la fois comme du hachage et comme de la
 * vitesse excessive.
 *
 * Chez eux, 37 items pour 2,4 visibles font 15,4 hauteurs de fenêtre parcourues,
 * et une pointe à 25 fenêtres par seconde. Avec des cartes, une fenêtre n'en
 * contient plus que 1,6 : garder 37 items multiplierait la vitesse en pixels par
 * deux et demi, et le rail deviendrait illisible.
 *
 * Le trajet suit donc les visibles, et les deux grandeurs qui comptent — trajet
 * en fenêtres, pointe en fenêtres par seconde — restent celles de la mesure.
 */
export const PARCOURS = Math.floor(PARCOURS_MESURE * (VISIBLES / VISIBLES_MESURE));

/**
 * La décélération : deux frottements, pas un.
 *
 * La courbe réelle chute plus vite au début et traîne plus longtemps à la fin
 * qu'aucune exponentielle unique ne le peut — une seule se trompe de 45 % au
 * milieu. La somme de deux la décrit : un lancer bref qui meurt, puis une glisse
 * longue, chacun parcourant à peu près la moitié du trajet.
 *
 * Ce n'est pas un artifice d'ajustement, c'est un mécanisme.
 *
 * L'écriture est en **distance** et non en vitesse : l'intégrale d'un `e^(−t/τ)`
 * est un `τ·(1 − e^(−t/τ))`, si bien que `part` se lit directement comme « la
 * distance que ce terme parcourt à lui seul », en items. Leur somme vaut 37,36 —
 * le trajet mesuré, à la normalisation près.
 */
export const ELAN = { part: 13.53, tau: 330 } as const;
export const GLISSE = { part: 23.83, tau: 1260 } as const;

/**
 * Le plafond de vitesse, en items par seconde. **Il n'est pas négociable.**
 *
 * L'ajustement libre donnait 145 items/s au départ : meilleure erreur, résultat
 * inutilisable. Le premier point mesuré est à +0,35 s, tout ce qui précède était
 * de l'extrapolation, et c'est elle qui pilote la demi-seconde la plus visible.
 * Six images consécutives extraites au moment le plus rapide le tranchent : les
 * objets y sont nets et décalés d'environ un item par image, soit 60 par
 * seconde — pour leurs 2,4 items visibles, donc **25 hauteurs de fenêtre par
 * seconde**. C'est cette seconde forme qui se transpose, et le plafond en items
 * suit la taille des tuiles comme le trajet.
 *
 * `ELAN` et `GLISSE` sont ajustés **sous cette contrainte**. Le test le vérifie ;
 * si on les retouche et que la pointe repasse au-dessus, le rail redevient un
 * stroboscope et cela se lit à la fois comme du hachage et comme de la vitesse.
 */
export const PLAFOND = (60 / VISIBLES_MESURE) * VISIBLES;

/**
 * Écart minimal entre deux dents du cliquet, en millisecondes.
 *
 * Très court, et c'est voulu. Au départ le rail franchit soixante items par
 * seconde ; l'échantillon en porte quarante millisecondes de son utile, donc les
 * dents se recouvrent largement et se fondent en un grondement — celui qui se
 * résout peu à peu en clics distincts, puis isolés. L'étranglement ne sert pas à
 * espacer les dents mais à borner le nombre de voix simultanées, ce qui ne
 * compte vraiment qu'en mode turbo, où le barème est comprimé de cinq fois.
 */
export const ETRANGLEMENT = 15;

/**
 * L'étalement des arrêts, en millisecondes.
 *
 * Les rouleaux ne s'arrêtent pas ensemble, et pas non plus dans l'ordre des
 * colonnes. Relevé sur la vidéo : **5,97 · 6,07 · 6,17 · 6,47 s** — une
 * demi-seconde d'étalement, dans un ordre qui n'est pas celui de la mise en
 * page. C'est donc un tirage au sort et non une cascade de gauche à droite.
 *
 * L'écart est petit exprès. Une demi-seconde suffit à ce que chaque arrêt soit
 * un évènement séparé — on entend cinq claquements et non un seul ; au-delà, le
 * dernier rouleau tourne seul trop longtemps et l'ouverture traîne.
 */
export const ETALEMENT = 500;

/* --------------------------------------------------------------------------
 * La bande
 * ------------------------------------------------------------------------ */

/**
 * Combien de tuiles de marge de part et d'autre du trajet.
 *
 * Elles couvrent la demi-fenêtre : au départ comme à l'arrêt, il doit rester de
 * la bande au-dessus et en dessous du repère, sinon on voit le vide au bout du
 * rouleau.
 *
 * Quatre suffisent largement, et c'est la disposition verticale qui le permet :
 * la fenêtre ne montre que **2,4 items**, donc 1,2 de chaque côté du repère.
 * Couchée, elle en montrait sept à douze et il en fallait dix. Trente tuiles de
 * moins par rouleau, cent cinquante de moins sur une ouverture à cinq — autant
 * d'anneaux à ne pas peindre avant la première image.
 */
export const MARGE = 3;

/** Le rang de la gagnante dans la bande. Elle arrive pile sous le repère. */
export const RANG_GAGNANT = PARCOURS + MARGE;

/** La longueur de la bande, en tuiles. */
export const TUILES = RANG_GAGNANT + MARGE + 1;

/* --------------------------------------------------------------------------
 * La relance — quand le jeton Winter Spin tombe sur une colonne
 * ------------------------------------------------------------------------ */

/**
 * Le temps d'arrêt sur le jeton avant que la colonne ne reparte.
 *
 * Assez pour qu'on lise ce qui vient de tomber et qu'on comprenne pourquoi la
 * colonne repart — moins, et la relance passerait pour un défaut d'animation.
 * Pas davantage : c'est une promesse, pas une cérémonie, et les autres colonnes
 * sont déjà arrêtées pendant ce temps-là.
 */
export const PAUSE_RELANCE = 900;

/** Le rang du jeton : là où la première course s'arrête. */
export const RANG_JETON = RANG_GAGNANT;

/**
 * Le rang de la vraie gagnante dans une bande relancée.
 *
 * La seconde course repart du jeton et parcourt le même trajet : la gagnante est
 * donc exactement `PARCOURS` tuiles plus loin. Une seule bande porte les deux
 * courses, ce qui évite d'avoir à remonter un rouleau au milieu de l'ouverture —
 * remplacer le contenu d'une colonne pendant qu'elle est à l'écran coûterait une
 * réconciliation React au pire moment.
 */
export const RANG_RELANCE = RANG_GAGNANT + PARCOURS;

/** La longueur d'une bande relancée, en tuiles. */
export const TUILES_RELANCE = RANG_RELANCE + MARGE + 1;

/** La durée totale d'une course relancée : deux courses et la pause. */
export function dureeRelance(duree: number, pause = PAUSE_RELANCE): number {
  return duree <= 0 ? duree : duree * 2 + pause;
}

/* --------------------------------------------------------------------------
 * Les modes
 * ------------------------------------------------------------------------ */

/**
 * Les quatre allures, en **fraction** de la durée nominale de la courbe.
 *
 * Des fractions et non des millisecondes, depuis qu'il y a deux courbes en
 * concurrence et qu'elles n'ont pas la même durée nominale : « rapide » doit
 * vouloir dire la même chose des deux côtés.
 *
 * Le barème est comprimé, la **forme** ne change pas. C'est ce qui distingue un
 * mode rapide d'une autre animation : on garde le lancer et la longue traîne, on
 * les regarde simplement en accéléré.
 */
export const MODES = {
  normal: 1,
  rapide: 0.44,
  turbo: 0.21,
  immediat: 0,
} as const;

export type Mode = keyof typeof MODES;

export const MODES_ORDRE: readonly Mode[] = ['normal', 'rapide', 'turbo', 'immediat'];

export const MODE_LIBELLE: Record<Mode, string> = {
  normal: 'Normal',
  rapide: 'Rapide',
  turbo: 'Turbo',
  immediat: 'Immédiat',
};

/* --------------------------------------------------------------------------
 * La courbe, et son inverse
 * ------------------------------------------------------------------------ */

/** La distance brute à l'instant `ms`, en items, avant normalisation. */
function brut(ms: number): number {
  return (
    ELAN.part * (1 - Math.exp(-ms / ELAN.tau)) + GLISSE.part * (1 - Math.exp(-ms / GLISSE.tau))
  );
}

/**
 * La distance atteinte à l'arrivée, qui sert de normalisateur.
 *
 * Sans elle une exponentielle n'arrive jamais : la gagnante s'immobiliserait à
 * quelques dixièmes de tuile du repère, ce qui se lit exactement comme un bug.
 */
const BRUT_FIN = brut(DUREE);

/**
 * L'avancement, de 0 à 1, à l'instant `ms` du **barème nominal**.
 *
 * Le barème nominal est celui de 6 800 ms. Un mode rapide ne change pas cette
 * fonction : il comprime le temps qui l'interroge, ce qui préserve la forme.
 */
export function avance(ms: number): number {
  if (ms <= 0) return 0;
  if (ms >= DUREE) return 1;
  return brut(ms) / BRUT_FIN;
}

/**
 * La vitesse instantanée, en items par seconde, sur le barème nominal.
 *
 * Dérivée analytique de `avance`, remise à l'échelle du trajet réel. Elle ne sert
 * pas à l'animation — le compositeur n'en a que faire — mais au test qui vérifie
 * le plafond, et à quiconque veut relire la courbe contre les huit points relevés
 * sur la vidéo.
 */
export function vitesse(ms: number): number {
  if (ms < 0) return 0;
  const derivee =
    (ELAN.part / ELAN.tau) * Math.exp(-ms / ELAN.tau) +
    (GLISSE.part / GLISSE.tau) * Math.exp(-ms / GLISSE.tau);
  return (derivee / BRUT_FIN) * PARCOURS * 1000;
}

/**
 * L'inverse : à quel instant l'avancement vaut-il `part` ?
 *
 * **C'est la fonction qui rend le son échantillon-précis.** Connaissant à
 * l'avance l'instant où chaque tuile franchit le repère, on programme les
 * trente-sept dents d'un coup sur l'horloge audio, au lieu de guetter le
 * franchissement dans une boucle d'animation — où chaque dent serait quantifiée
 * à l'image et porterait la gigue du fil principal.
 *
 * Une somme de deux exponentielles ne s'inverse pas en forme close, contrairement
 * à un `easeOutQuart` dont on tire un `t(p)` d'une ligne. Ce n'est pas un
 * problème : `avance` est strictement croissante, donc une bissection converge, et
 * soixante halvings d'un intervalle de 6 800 ms tombent très en deçà de la
 * précision d'un flottant. Le tout est calculé une fois par ouverture, hors
 * rendu — quarante inversions, quelques microsecondes.
 */
export function instant(part: number): number {
  if (part <= 0) return 0;
  if (part >= 1) return DUREE;
  let bas = 0;
  let haut = DUREE;
  for (let i = 0; i < 60; i += 1) {
    const milieu = (bas + haut) / 2;
    if (avance(milieu) < part) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

/* --------------------------------------------------------------------------
 * Deux courbes, et de quoi trancher entre elles
 * ------------------------------------------------------------------------ */

/**
 * Une loi de mouvement : sa durée nominale, son avancement, son inverse.
 *
 * ## Pourquoi il y en a deux, et pourquoi ça se choisit à l'écran
 *
 * Deux dépouillements de la **même vidéo** ne donnent pas la même courbe :
 *
 * - une **somme de deux exponentielles** sur 6 800 ms, ajustée sur huit vitesses
 *   relevées image par image, sous la contrainte du plafond de 60 items/s ;
 * - une **exponentielle simple** de constante k = 3,9 sur 5 430 ms, d'erreur
 *   annoncée à 0,36 px par image.
 *
 * Elles divergent beaucoup : à la moitié du temps, la première a parcouru 96 %
 * du chemin, la seconde 87 %. Autrement dit la première rampe bien plus
 * longtemps, ce qui colle aux points de vitesse consignés ici (1,4 item/s à
 * +3,55 s, 0,5 à +4,35 s) mais peut se ressentir comme mou.
 *
 * Aucun argument écrit ne tranchera : ça se regarde. Les deux vivent donc côte à
 * côte, le banc `/dev/rail` bascule de l'une à l'autre, et l'on garde celle qui
 * ressemble à ce qu'on veut. Le reste du code n'en sait rien — il reçoit une
 * `Courbe` et s'en sert.
 */
export interface Courbe {
  /** Nom court, pour le sélecteur du banc. */
  nom: string;
  /** La durée nominale d'une course, en ms. */
  duree: number;
  /** L'avancement, de 0 à 1, à l'instant `ms` du barème nominal. */
  avance(ms: number): number;
  /** L'inverse : l'instant, en ms, où l'avancement vaut `part`. */
  instant(part: number): number;
}

/** La somme de deux exponentielles, ajustée sur les huit vitesses relevées. */
export const COURBE_MESUREE: Courbe = {
  nom: 'Deux exponentielles',
  duree: DUREE,
  avance,
  instant,
};

/**
 * L'exponentielle simple, k = 3,9 sur 5 430 ms.
 *
 * Elle s'inverse **analytiquement** — `u = −ln(1 − p·(1 − e^−k)) / k` — ce qui
 * évite la bissection. Ce n'est pas un argument décisif ici, la bissection
 * coûtant quelques microsecondes une fois par ouverture, mais c'est plus court à
 * lire.
 *
 * À noter pour qui voudrait l'ajuster : `easeOutExpo` correspond à k ≈ 6,93, et
 * c'est nettement plus brutal.
 */
const K_SIMPLE = 3.9;
const DUREE_SIMPLE = 5430;
const NK_SIMPLE = 1 - Math.exp(-K_SIMPLE);

export const COURBE_SIMPLE: Courbe = {
  nom: 'Exponentielle k=3,9',
  duree: DUREE_SIMPLE,
  avance(ms) {
    if (ms <= 0) return 0;
    if (ms >= DUREE_SIMPLE) return 1;
    return (1 - Math.exp((-K_SIMPLE * ms) / DUREE_SIMPLE)) / NK_SIMPLE;
  },
  instant(part) {
    if (part <= 0) return 0;
    if (part >= 1) return DUREE_SIMPLE;
    return (-Math.log(1 - part * NK_SIMPLE) / K_SIMPLE) * DUREE_SIMPLE;
  },
};

export const COURBES = { mesuree: COURBE_MESUREE, simple: COURBE_SIMPLE } as const;
export type NomCourbe = keyof typeof COURBES;
export const COURBES_ORDRE: readonly NomCourbe[] = ['mesuree', 'simple'];

/** La durée d'une course, pour une courbe et une allure. */
export function dureeDe(courbe: Courbe, mode: Mode): number {
  return courbe.duree * MODES[mode];
}

/* --------------------------------------------------------------------------
 * Ce que l'animation et le son consomment
 * ------------------------------------------------------------------------ */

/**
 * Les instants où une tuile franchit le repère, en ms depuis le départ.
 *
 * Le franchissement est l'évènement qu'on **voit** : le son est donc exactement
 * ce qui se passe à l'écran, et non une cadence plaquée par-dessus. Le
 * ralentissement n'est écrit nulle part — la cadence est la dérivée du
 * mouvement, donc elle épouse la courbe sans qu'on ait à la décrire deux fois.
 */
export function instantsDesCrans(duree: number, courbe: Courbe = COURBE_MESUREE): number[] {
  if (duree <= 0) return [];
  const echelle = duree / courbe.duree;
  const instants: number[] = [];
  let dernier = -Infinity;
  for (let k = 1; k <= PARCOURS; k += 1) {
    const ms = courbe.instant(k / PARCOURS) * echelle;
    if (ms - dernier < ETRANGLEMENT) continue;
    dernier = ms;
    instants.push(ms);
  }
  return instants;
}

/**
 * Tous les franchissements du repère, avec le rang de la tuile qui passe.
 *
 * `instantsDesCrans` sert le son et applique donc un étranglement : deux dents à
 * trois millisecondes d'écart feraient une mitraillette. Le halo, lui, a besoin
 * de la liste **entière** — il ne coûte rien de savoir quelle carte passe, et
 * c'est au consommateur de décider lesquelles méritent d'être signalées.
 *
 * Au départ, la tuile sous le repère est celle de rang `MARGE` ; au
 * franchissement numéro k, c'est celle de rang `MARGE + k`. C'est la même
 * inversion de courbe que pour les dents, donc les deux tombent forcément
 * ensemble : le halo s'allume sur le clic qu'on entend.
 */
export function franchissements(
  duree: number,
  courbe: Courbe = COURBE_MESUREE,
): { rang: number; ms: number }[] {
  if (duree <= 0) return [];
  const echelle = duree / courbe.duree;
  return Array.from({ length: PARCOURS }, (_, i) => ({
    rang: MARGE + i + 1,
    ms: courbe.instant((i + 1) / PARCOURS) * echelle,
  }));
}

/**
 * Les images-clés de l'animation, en translation sur X.
 *
 * ## Pourquoi une centaine de clés plutôt qu'un `easing`
 *
 * Le navigateur ne sait pas interpoler une somme d'exponentielles. Trois voies
 * s'offraient :
 *
 * - une `cubic-bezier` qui l'approche : impossible, la courbe a deux régimes et
 *   une Bézier cubique n'en tient qu'un ;
 * - la fonction `linear()` de CSS, faite exactement pour ça : mais elle demande
 *   Chrome 113 et Safari 17.2, alors que `browserslist` descend à Chrome 111 et
 *   Safari 16.4 ;
 * - **des images-clés explicites**, interpolées linéairement entre elles. C'est
 *   ce qu'on fait, et c'est composité comme n'importe quelle autre animation de
 *   `transform`.
 *
 * ## Pourquoi le temps est échantillonné en carré
 *
 * Découper le **temps** en parts égales place toutes les clés là où il ne se
 * passe rien — la traîne — et trop peu là où la courbure est forte, dans les
 * trois premiers dixièmes de seconde : 3,8 px d'erreur à 160 clés.
 *
 * Découper la **distance** en parts égales est le premier réflexe, et il est
 * pire : 4,2 px. Contre-intuitif, jusqu'à ce qu'on regarde la dernière clé — le
 * dernier soixantième de trajet prend deux secondes et demie, et interpoler
 * droit à travers une exponentielle sur deux secondes et demie coûte cher.
 *
 * Le carré prend les deux bouts : les clés se resserrent au démarrage, et le
 * dernier segment fait encore 68 ms. À 200 échantillons, l'erreur maximale est
 * de **0,21 px** — un cinquième de pixel sur toute la course. `tests/spin.test.ts`
 * la mesure, pour que personne n'aille alléger l'échantillonnage sans le voir.
 */
/**
 * L'axe du rouleau.
 *
 * Vertical pour les affrontements, où plusieurs colonnes tournent côte à côte
 * comme sur la vidéo de référence. Horizontal pour l'ouverture d'un pack, qui
 * ne tire qu'une carte : une seule bande, qui défile de droite à gauche devant
 * le repère.
 */
export type Axe = 'x' | 'y';

/** Une translation sur l'axe demandé, en px. */
export function translation(axe: Axe, valeur: number): string {
  const v = valeur.toFixed(2);
  return axe === 'x' ? `translate3d(${v}px, 0, 0)` : `translate3d(0, ${v}px, 0)`;
}

export function imagesCles(
  depart: number,
  trajet: number,
  courbe: Courbe = COURBE_MESUREE,
  echantillons = 200,
  axe: Axe = 'y',
): Keyframe[] {
  const cles: Keyframe[] = [];
  for (let k = 0; k <= echantillons; k += 1) {
    const offset = (k / echantillons) ** 2;
    cles.push({
      offset,
      transform: translation(axe, depart - courbe.avance(offset * courbe.duree) * trajet),
    });
  }
  return cles;
}

/**
 * Les images-clés d'une course **relancée** : deux actes et une pause.
 *
 * Une seule animation porte le tout. Découper en deux animations enchaînées
 * demanderait de guetter la fin de la première pour lancer la seconde, donc de
 * remettre une promesse au milieu du chemin — précisément ce qui a déjà valu un
 * écran figé. Ici la relance est décrite d'avance, comme le reste.
 *
 * L'acte de maintien n'est pas décoratif : sans lui, l'interpolation linéaire
 * entre la dernière clé du premier acte et la première du second ferait glisser
 * le rouleau pendant toute la pause au lieu de l'immobiliser.
 */
export function imagesClesRelance(
  depart: number,
  trajet: number,
  duree: number,
  courbe: Courbe = COURBE_MESUREE,
  pause = PAUSE_RELANCE,
  echantillons = 200,
  axe: Axe = 'y',
): Keyframe[] {
  const total = dureeRelance(duree, pause);
  const acte = duree / total;
  const reprise = (duree + pause) / total;
  const cles: Keyframe[] = [];

  const pose = (offset: number, x: number) =>
    cles.push({ offset, transform: translation(axe, x) });

  for (let k = 0; k <= echantillons; k += 1) {
    const u = (k / echantillons) ** 2;
    pose(u * acte, depart - courbe.avance(u * courbe.duree) * trajet);
  }

  // Le palier : immobile sur le jeton, le temps qu'on le lise.
  pose(reprise, depart - trajet);

  for (let k = 1; k <= echantillons; k += 1) {
    const u = (k / echantillons) ** 2;
    pose(reprise + u * acte, depart - trajet - courbe.avance(u * courbe.duree) * trajet);
  }

  return cles;
}

/**
 * Où poser le rouleau, en px, pour que la gagnante s'arrête sous le repère.
 *
 * Le repère est au milieu de la fenêtre. Le centre de la tuile de rang `i` est à
 * `i·pas + pas/2` dans le repère du rouleau ; on veut qu'à l'arrivée, la tuile
 * `RANG_GAGNANT` y tombe, le rouleau ayant reculé de `PARCOURS·pas`.
 *
 * Il en découle qu'au départ c'est la tuile de rang `MARGE` qui est sous le
 * repère — d'où la marge, des deux côtés.
 */
export function departDeBande(fenetre: number, pas: number): number {
  return fenetre / 2 - pas * (MARGE + 0.5);
}

/** Combien de tuiles la fenêtre montre de part et d'autre du repère. */
export function demiFenetre(fenetre: number, pas: number): number {
  return pas > 0 ? fenetre / (2 * pas) : 0;
}

/**
 * Les durées propres à chaque rouleau : même courbe, arrêts étalés au hasard.
 *
 * ## Pourquoi la durée et non le départ
 *
 * Les cinq rouleaux partent **ensemble** — la vidéo est nette là-dessus, ils
 * démarrent à l'image près — et se séparent en fin de course. Retarder les
 * départs, ce qu'on fait spontanément, produit l'inverse : cinq rouleaux qui
 * s'ébranlent l'un après l'autre puis s'arrêtent dans le même ordre, ce qui se
 * lit comme une vague et non comme cinq machines qui hésitent chacune pour soi.
 *
 * L'avancement étant normalisé par la durée de chaque rouleau, un rouleau plus
 * lent parcourt exactement le même trajet : sa gagnante tombe au même endroit,
 * il met simplement plus longtemps à y arriver. La traîne s'allonge, ce qui est
 * précisément l'effet cherché.
 *
 * ## Régulier, puis mélangé
 *
 * Les retards sont répartis régulièrement dans l'étalement — c'est ce qui
 * garantit que deux arrêts ne se confondent jamais — puis mélangés, parce que
 * l'ordre relevé sur la vidéo n'est pas celui des colonnes.
 *
 * L'étalement suit l'allure : une demi-seconde sur une course de 6,8 s, mais un
 * dixième en turbo, sinon la moitié de l'ouverture serait de l'attente.
 */
export function dureesEtalees(
  bandes: number,
  duree: number,
  hasard: () => number = Math.random,
  courbe: Courbe = COURBE_MESUREE,
): number[] {
  if (bandes <= 0) return [];
  if (duree <= 0) return Array.from({ length: bandes }, () => duree);

  const etalement = ETALEMENT * (duree / courbe.duree);
  const retards = Array.from({ length: bandes }, (_, i) =>
    bandes > 1 ? (i / (bandes - 1)) * etalement : 0,
  );

  // Mélange de Fisher-Yates : l'ordre des arrêts ne doit rien devoir à celui
  // des colonnes, sans quoi on retombe sur une cascade de gauche à droite.
  for (let i = retards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [retards[i], retards[j]] = [retards[j], retards[i]];
  }

  return retards.map((retard) => duree + retard);
}
