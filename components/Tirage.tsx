'use client';

import { useEffect, useRef, useState } from 'react';
import { joueSon, programmeFin, sonDeFete } from '@/components/bruitage';
import { aUneIllustration, CardArt } from '@/components/CardArt';
import { RARITY_META } from '@/lib/domain/catalog';
import { RARITY_ORDER } from '@/lib/domain/rules';
import type { Rarity } from '@/lib/domain/types';

export interface CarteTirage {
  cardId: string;
  name: string;
  description: string;
  rarity: string;
  glyph: string;
  /** Absents pour une carte de collection, qui ne se joue pas. */
  power?: number;
  nature?: 'bonus' | 'malus';
}

/**
 * Combien d'items le rail parcourt, du départ à l'arrêt.
 *
 * ## Quarante-trois, et c'est le chiffre qui change tout
 *
 * Il valait huit. Mesuré image par image sur l'ouverture d'EmpireDrop — suivi
 * du décalage vertical par corrélation, puis déroulement de l'aliasing dû à la
 * répétition des items — leur rail en parcourt **quarante-neuf**. Le chiffre est
 * confirmé deux fois : par l'ajustement de la courbe de vitesse, et par
 * l'intégration directe des vitesses relevées, qui donnent l'une et l'autre 49.
 *
 * C'est la différence entre une roue lancée et un diaporama. À huit items en
 * neuf secondes, chaque carte reste plus d'une seconde à l'écran : on ne voit
 * pas défiler, on voit apparaître. À quarante-trois, le début est illisible et
 * c'est le but — une machine dont on ne peut pas suivre le contenu est une
 * machine dont on attend l'arrêt.
 */
const PARCOURS = 49;

/**
 * Combien de tuiles existent réellement dans un rouleau.
 *
 * Seize, recyclées : une tuile qui sort par le bas est remise en haut. Sans ce
 * recyclage, parcourir quarante-trois items voudrait dire monter quarante-six
 * cartes par rouleau, soit **deux cent trente cadres peints** pour une
 * ouverture à cinq — chacun avec son illustration vectorielle et sa rotation de
 * teinte. La mise en page seule aurait fait sauter le démarrage.
 *
 * Seize et pas moins : c'est le nombre d'items **lisibles** avant l'arrêt.
 * Passé la première seconde et demie, il reste environ onze items à défiler ;
 * avec seize tuiles distinctes, aucune ne repasse pendant qu'on peut la lire.
 * Les répétitions n'ont lieu que dans le flou.
 */
const TUILES = 16;

/**
 * Combien de jetons tiennent dans la hauteur de la fenêtre.
 *
 * Mesuré : leur bandeau fait 293 pixels pour un pas de 125, soit 2,4 items. La
 * fenêtre est **basse et large**, et c'est tout le contraire de ce que j'avais
 * fait — cinq colonnes hautes où l'on voyait trois cartes entières. On ne doit
 * presque rien voir à la fois : c'est ce qui concentre le regard sur le milieu.
 */
const VISIBLES = 2.4;

/**
 * Le pas vertical, en fraction de la largeur d'une colonne.
 *
 * Mesuré : leurs colonnes font 268 pixels de large pour un pas de 125, soit
 * 0,47. Les jetons se touchent presque — le pas est à peine plus grand que le
 * disque. Toute la géométrie découle de ce seul rapport : hauteur de la
 * fenêtre, taille de l'anneau, débord de l'illustration.
 */
const PAS_RELATIF = 0.47;

/**
 * Durée du défilement, en millisecondes.
 *
 * Mesurée : leur rail démarre à 1,8 s et ne bouge plus à 8,6 s — **6,8
 * secondes**, à l'aide de l'énergie de changement image à image, qui ne peut
 * pas se tromper là où la corrélation devenait ambiguë.
 */
const DUREE = 6800;
const DUREE_REDUITE = 900;

/**
 * Écart minimal entre deux dents, en millisecondes.
 *
 * Très court, et c'est voulu. Au départ le rail franchit cent quarante items
 * par seconde : les crans se recouvrent alors largement — l'échantillon en dure
 * 209 — et se fondent en un grondement. C'est exactement ce qu'on entend chez
 * eux, et c'est ce grondement qui se résout peu à peu en clics distincts, puis
 * en clics isolés. L'étranglement ne sert qu'à borner le nombre de voix
 * simultanées, pas à espacer les dents.
 *
 * Un seul rouleau émet, puisqu'ils sont synchrones.
 */
const ETRANGLEMENT = 15;

/**
 * La décélération : deux frottements, pas un.
 *
 * ## Ce que la vidéo dit vraiment
 *
 * Vitesse relevée sur leur rouleau, en items par seconde depuis le départ :
 *
 *     +0,35 s → 35,0    +0,75 s → 14,4    +1,15 s → 7,7    +1,55 s → 5,3
 *     +2,15 s →  3,8    +2,75 s →  2,4    +3,55 s → 1,4    +4,35 s → 0,5
 *
 * Une exponentielle simple, essayée d'abord, se trompe de 45 % au milieu : la
 * courbe réelle **chute plus vite au début et traîne plus longtemps à la fin**
 * qu'aucune exponentielle unique ne peut le faire.
 *
 * La somme de deux la décrit à 11 % près (contre 25 % pour une seule) :
 *
 *     v(t) = 124·e^(−t/0,19) + 21·e^(−t/1,22)   items par seconde
 *
 * Ce n'est pas une astuce d'ajustement, c'est un mécanisme : **un lancer
 * violent qui meurt en deux dixièmes de seconde, puis une glisse longue**. Les
 * deux termes se partagent le trajet presque à égalité — 48 % pour le lancer,
 * 52 % pour la glisse. C'est cette double nature qui donne la sensation
 * particulière d'une caisse qui s'ouvre : le coup de fouet du départ, puis
 * l'attente.
 *
 * Les courbes en puissance essayées avant — exposants 5, puis 2, puis 1,25 —
 * ne pouvaient reproduire ni l'un ni l'autre : elles gardent leur vitesse
 * longtemps puis s'arrêtent d'un coup, l'exact contraire.
 */
const ELAN = { part: 23.56, tau: 190 };
const GLISSE = { part: 25.62, tau: 1220 };

/**
 * L'avancement, de 0 à 1, à l'instant `ms`.
 *
 * L'intégrale d'une vitesse en `e^(-t/τ)` est en `τ·(1 − e^(-t/τ))` : la somme
 * de deux exponentielles s'intègre donc aussi simplement qu'une seule. `part`
 * est la distance que chaque terme parcourt à lui seul, ce qui rend leur
 * pondération lisible — presque moitié-moitié.
 *
 * On normalise par la valeur atteinte à `DUREE` pour que l'arrivée tombe
 * exactement sur la gagnante : sans cela une exponentielle n'arrive jamais.
 */
function brut(ms: number): number {
  return (
    ELAN.part * (1 - Math.exp(-ms / ELAN.tau)) + GLISSE.part * (1 - Math.exp(-ms / GLISSE.tau))
  );
}
const AVANCE_FIN = brut(DUREE);
const avance = (ms: number) => brut(ms) / AVANCE_FIN;

/** Modulo positif : `%` renvoie un négatif pour un dividende négatif. */
const cycle = (v: number, m: number) => ((v % m) + m) % m;

function Piste({
  cartes,
  gagnante,
  mene,
  cran,
  onFini,
}: {
  cartes: CarteTirage[];
  gagnante: CarteTirage;
  /**
   * Ce rouleau émet-il le cliquet ?
   *
   * Un seul le fait. Les cinq sont synchrones — mesuré : chez EmpireDrop les
   * cinq colonnes démarrent, ralentissent et s'arrêtent ensemble, à l'image
   * près — donc leurs franchissements tombent aux mêmes instants. Cinq cliquets
   * identiques superposés ne font pas un mécanisme plus riche, ils gaspillent
   * des voix.
   */
  mene: boolean;
  /** Horodatage de la dernière dent. */
  cran: React.RefObject<number>;
  onFini: () => void;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [arrete, setArrete] = useState(false);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  /*
   * La bande : seize tuiles, la gagnante en tête.
   *
   * Aucun appât n'y est placé, et ce n'est pas un oubli. La vidéo n'en contient
   * pas : la vitesse relevée décroît strictement, sans la moindre hésitation,
   * sur les deux ouvertures. Les trois creux que le rail portait jusqu'ici ont
   * donc été retirés — avec toute la machinerie d'intégration et d'antécédents
   * qui les rendait possibles sans faire reculer la bande.
   *
   * La gagnante occupe le rang 0 : c'est le rang qui, par construction du
   * décalage de départ, se trouve pile sur le repère quand le rail s'arrête.
   * Le recyclage la fait passer deux fois avant, mais dans le flou.
   */
  const [bande] = useState<CarteTirage[]>(() => {
    const pioche = cartes.length ? cartes : [gagnante];
    const items: CarteTirage[] = [gagnante];
    for (let i = 1; i < TUILES; i += 1) {
      // Aucun doublon à moins de trois cases, en tenant compte du bouclage :
      // la première et la dernière tuile sont voisines à l'écran.
      const recents = [...items.slice(-3), ...(i > TUILES - 4 ? items.slice(0, 3) : [])].map(
        (c) => c.cardId,
      );
      const libres = pioche.filter((c) => !recents.includes(c.cardId));
      const source = libres.length ? libres : pioche;
      items.push(source[Math.floor(Math.random() * source.length)]);
    }
    return items;
  });

  useEffect(() => {
    const boite = cadre.current;
    const el = rail.current;
    if (!boite || !el) return;

    const reduit =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduit ? DUREE_REDUITE : DUREE;

    /*
     * Toute la géométrie découle de la largeur mesurée d'une tuile.
     *
     * La hauteur de la fenêtre est posée ici, et non en CSS : elle vaut
     * `VISIBLES` pas, et le pas dépend du rapport de la carte. Les deux côtés
     * ne peuvent donc pas diverger — ce qui est déjà arrivé, et le rail
     * s'arrêtait alors deux tuiles à côté.
     */
    const tuiles = Array.from(el.children) as HTMLElement[];
    const large = boite.clientWidth;
    const pas = large * PAS_RELATIF;
    const hTuile = pas;
    const hauteur = VISIBLES * pas;
    // Le pas commande tout : c'est lui qui donne la taille des jetons, posée en
    // variable pour que le style n'ait rien à recalculer de son côté.
    boite.style.setProperty('--pas', `${pas.toFixed(1)}px`);
    boite.style.height = `${hauteur.toFixed(1)}px`;

    const boucle = TUILES * pas;
    const trajet = PARCOURS * pas;
    const centre = hauteur / 2 - hTuile / 2;
    // Le décalage de départ, choisi pour que le rang 0 tombe pile au centre à
    // l'arrivée. Tout le reste en découle par simple modulo.
    const base = cycle(centre - trajet, boucle);

    let debut = 0;
    let trame = 0;
    let franchis = -1;

    const image = (temps: number) => {
      if (!debut) debut = temps;
      const t = Math.min(1, (temps - debut) / total);
      const x = avance(t * total) * trajet;

      /*
       * Chaque tuile est placée par un modulo, ce qui la recycle toute seule.
       *
       * C'est ce qui remplace la longue bande d'autrefois : au lieu de
       * quarante-six cartes translatées d'un bloc, seize cartes tournent en
       * rond. Une tuile qui sort par le bas réapparaît en haut sans qu'on ait
       * à la déplacer explicitement — le modulo s'en charge à chaque image.
       */
      for (let k = 0; k < tuiles.length; k += 1) {
        const y = cycle(base + x + k * pas, boucle);
        tuiles[k].style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      }

      /*
       * La dent du cliquet : un item vient de franchir le repère.
       *
       * Le compteur est la distance parcourue divisée par le pas, donc le son
       * est exactement l'évènement qu'on voit. Vérifié sur la vidéo : entre
       * chaque franchissement mesuré et l'attaque sonore la plus proche, l'écart
       * tient dans ±65 ms sur toute la phase lisible.
       *
       * Le `while` n'est pas une précaution de style : au démarrage le rail
       * franchit deux items par image, et un `if` en avalerait la moitié.
       */
      if (mene && !reduit) {
        const n = Math.floor(x / pas);
        while (franchis < n) {
          franchis += 1;
          if (temps - cran.current >= ETRANGLEMENT) {
            cran.current = temps;
            joueSon('cran');
          }
        }
      }

      if (t < 1) {
        trame = requestAnimationFrame(image);
        return;
      }
      boite.dataset.arrete = 'true';
      setArrete(true);
      fini.current();
    };

    /*
     * Le départ est décalé d'une image.
     *
     * Au premier `requestAnimationFrame` après le montage, le navigateur n'a pas
     * encore peint les cartes du rail : la première image de l'animation
     * partagerait son budget avec cette mise en page, et le démarrage — le
     * moment le plus rapide, celui où le moindre retard se voit — sauterait.
     */
    let amorce = requestAnimationFrame(() => {
      amorce = requestAnimationFrame(image);
      trame = amorce;
    });
    trame = amorce;

    return () => {
      cancelAnimationFrame(amorce);
      cancelAnimationFrame(trame);
    };
  }, [mene, cran]);

  const meta = RARITY_META[gagnante.rarity as Rarity] ?? RARITY_META.C;

  return (
    <div
      className="tirage-piste"
      ref={cadre}
      data-arrete="false"
      data-rang={RARITY_ORDER[gagnante.rarity as Rarity] ?? 0}
      style={{ ['--gagne' as string]: meta.color }}
    >
      <div className="tirage-rail" ref={rail}>
        {bande.map((c, i) => {
          const m = RARITY_META[c.rarity as Rarity] ?? RARITY_META.C;
          return (
            /*
             * Le jeton : un anneau pointillé de rareté, et l'illustration qui
             * déborde par-dessus.
             *
             * C'est leur objet, relevé sur la vidéo. J'avais mis la carte
             * entière dans son cadre peint, ce qui n'avait rien à voir : à
             * cette vitesse un cadre n'est plus lisible, et cinq colonnes de
             * cartes hautes ne font pas un bandeau. Ce qui se lit d'un jeton
             * qui passe, c'est la **couleur de l'anneau** — donc la rareté.
             */
            <div
              key={`${c.cardId}-${i}`}
              className={`tirage-jeton ${i === 0 ? 'tirage-jeton-gagnant' : ''}`}
              data-rang={RARITY_ORDER[c.rarity as Rarity] ?? 0}
              style={{ ['--r' as string]: m.color }}
              aria-hidden={i !== 0}
            >
              <span className="tirage-anneau" aria-hidden="true" />
              {aUneIllustration(c.cardId) ? (
                <CardArt cardId={c.cardId} className="tirage-art" />
              ) : (
                <span className="tirage-glyphe" aria-hidden="true">
                  {c.glyph}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Le nom et la puissance, sous la gagnante et seulement à l'arrêt. C'est
          ainsi chez eux : rien n'est écrit pendant que ça tourne, et la carte
          obtenue se nomme d'elle-même une fois posée. */}
      {arrete && (
        <span className="tirage-etiquette">
          <span className="tirage-etiquette-nom">{gagnante.name}</span>
          {gagnante.power !== undefined && (
            <span className="tirage-etiquette-valeur num">{gagnante.power}</span>
          )}
        </span>
      )}

      {arrete && (RARITY_ORDER[gagnante.rarity as Rarity] ?? 0) >= 3 && (
        <span className="tirage-rayons" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * Le tirage : un rouleau par carte, tous en parallèle.
 *
 * ## La disposition
 *
 * Autant de colonnes que le booster donne de cartes, côte à côte, et **un seul
 * repère horizontal** qui les traverse toutes. Un repère par colonne donnerait
 * cinq machines juxtaposées ; une seule ligne en fait un appareil.
 *
 * ## Les arrêts en cascade
 *
 * Les rouleaux partent ensemble et s'arrêtent de gauche à droite, à `RELAIS`
 * d'intervalle. C'est là tout le suspense d'une ouverture à cinq : arrêtés en
 * même temps, on ne regarde nulle part et on ne voit rien. Espacés d'une
 * demi-seconde, chaque arrêt est un évènement, et le dernier rouleau qui tourne
 * encore tient le regard à lui seul.
 *
 * ## L'alignement n'est pas rigide
 *
 * Chaque rouleau s'arrête avec un décalage vertical tiré au hasard dans le quart
 * central de sa tuile. Cinq colonnes alignées au pixel près se lisent comme une
 * grille qui se replace ; cinq colonnes légèrement désalignées se lisent comme
 * cinq objets lancés qui se sont arrêtés.
 *
 * ## Rien n'est tiré ici
 *
 * Les cartes gagnantes arrivent en propriété, décidées par le serveur au moment
 * de l'achat — `purchaseAndOpen` tire les cinq d'un coup, débite le prix et
 * renvoie le tableau. Les rouleaux ne mettent en scène que le rythme de leur
 * révélation, et aucun appât ne peut devenir la carte sur laquelle on s'arrête.
 */
export function Tirage({
  cartes,
  gagnantes,
  onFini,
}: {
  /** Le catalogue, pour peupler les rouleaux de leurres. */
  cartes: CarteTirage[];
  gagnantes: CarteTirage[];
  onFini: () => void;
}) {

  const cran = useRef(0);
  const restants = useRef(gagnantes.length);

  /*
   * Le meilleur du lot, et le rouleau qui le porte.
   *
   * Une seule fête par ouverture, à l'arrêt du rouleau concerné. Les rouleaux
   * s'arrêtent à une demi-seconde d'intervalle : cinq fanfares de plusieurs
   * secondes s'empileraient en bouillie, et surtout la meilleure carte se
   * noierait au milieu des autres au lieu d'être ce qu'on retient.
   */
  const [fete] = useState(() => {
    let place = 0;
    let haut = -1;
    gagnantes.forEach((g, i) => {
      const r = RARITY_ORDER[g.rarity as Rarity] ?? 0;
      if (r > haut) {
        haut = r;
        place = i;
      }
    });
    return { place, son: sonDeFete(haut) };
  });

  /*
   * L'appât, calé pour résoudre à l'arrêt du dernier rouleau.
   *
   * Cinq secondes sept de montée, et c'est sa fin qui compte : elle doit tomber
   * sur l'arrêt, pas quelque part avant. `programmeFin` s'en charge à partir de
   * la durée du tampon décodé.
   */
  useEffect(() => {
    programmeFin('appat', DUREE);
  }, []);

  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  const unDeMoins = (place: number) => {
    restants.current -= 1;
    // Le claquement d'arrêt, pour chaque rouleau ; la fanfare, pour le seul qui
    // porte la meilleure carte.
    joueSon('commun');
    if (place === fete.place && fete.son) joueSon(fete.son);
    // Une pause après le dernier arrêt : sans elle, la grille remplace les
    // rouleaux dans l'image qui suit le dernier clac, et on n'a rien vu.
    if (restants.current <= 0) setTimeout(() => fini.current(), 1_200);
  };

  return (
    <div className="tirage">
      <div
        className="tirage-scene"
        style={{ ['--rouleaux']: gagnantes.length } as React.CSSProperties}
      >
        {gagnantes.map((g, i) => (
          <Piste
            key={`${g.cardId}-${i}`}
            cartes={cartes}
            gagnante={g}
            mene={i === 0}
            cran={cran}
            onFini={() => unDeMoins(i)}
          />
        ))}

        {/* Aucun repère. La vidéo n'en a pas : le milieu se lit tout seul,
            parce que c'est le seul endroit où un jeton est entier. Le trait
            blanc et ses deux flèches, que j'avais ajoutés, n'existent nulle
            part chez eux. */}
        <span className="tirage-voile tirage-voile-haut" aria-hidden="true" />
        <span className="tirage-voile tirage-voile-bas" aria-hidden="true" />
      </div>
    </div>
  );
}
