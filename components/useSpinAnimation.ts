'use client';

import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import {
  arreteTout,
  horlogeAudio,
  programme,
  programmeCrans,
  programmeFin,
  reveilleSon,
  sonDeFete,
} from '@/components/bruitage';
import {
  COURBE_MESUREE,
  type Courbe,
  demiFenetre,
  departDeBande,
  franchissements,
  dureeRelance,
  dureesEtalees,
  imagesClesRelance,
  PAUSE_RELANCE,
  imagesCles,
  instantsDesCrans,
  MARGE,
  PARCOURS,
} from '@/lib/spin/courbe';

/**
 * Le moteur du rail : mesurer, animer, caler le son. Rien d'autre.
 *
 * ## Pourquoi c'est un hook et pas le composant
 *
 * Le ressenti d'un rail tient à la courbe et au calage du son. Le rendu, lui,
 * ne fait que poser des div. Les séparer permet de régler le premier sans
 * toucher au second — et surtout de garder toute la partie calculable dans
 * `lib/spin/`, sous test, où l'on peut vérifier qu'inverser la courbe redonne
 * bien le temps qu'on y a mis.
 *
 * ## Zéro rendu React pendant la course
 *
 * Le hook n'appelle aucun `setState`. Tout passe par le DOM :
 *
 * - la géométrie s'écrit en variables CSS sur le cadre ;
 * - l'arrêt d'un rouleau s'écrit dans son `data-arrete`, que la feuille de style
 *   lit ;
 * - le mouvement est une seule animation WAAPI par rouleau, sur `transform`, donc
 *   sur le compositeur.
 *
 * Ce n'est pas de la coquetterie. Un rouleau porte trente et une cartes, et cinq
 * rouleaux en portent cent cinquante-cinq : un seul rendu React au mauvais moment
 * coûte une réconciliation de tout ça, pendant la demi-seconde où le rail va le
 * plus vite et où le moindre retard se voit.
 */

/* --------------------------------------------------------------------------
 * Les réglages de mise en scène
 * ------------------------------------------------------------------------ */

/**
 * L'amorce : le temps qu'on laisse au navigateur avant de lancer.
 *
 * Deux services pour le prix d'un. D'abord, la bande vient d'être montée et n'est
 * pas encore peinte ; partir tout de suite ferait partager à la première image de
 * l'animation le budget de cette mise en page, et le démarrage sauterait.
 * Ensuite, il faut de la marge devant pour programmer le son : une dent calculée
 * à `t = 3 ms` doit pouvoir être posée dans le futur, pas dans le passé.
 */
const AMORCE = 140;

/**
 * L'appât se joue-t-il à chaque ouverture, ou seulement sur une rareté haute ?
 *
 * **Toujours.** Le réserver aux hautes raretés donnerait au joueur une certitude
 * une seconde avant la fin de l'animation : il saurait avant de voir. C'est
 * échanger la surprise contre de l'anticipation, et l'anticipation, l'appât la
 * fabrique déjà tout seul en montant sur une carte dont personne ne sait rien.
 *
 * Passer à `false` rétablit le déclenchement conditionnel décrit dans le conseil
 * d'origine ; c'est la seule ligne à changer.
 */
const APPAT_TOUJOURS = true;

/** Le temps qu'on laisse sur la carte posée avant de passer à la révélation. */
const REPOS = 1400;
const REPOS_IMMEDIAT = 600;

/**
 * Le flou de mouvement, en pixels. **Zéro : il est retiré.**
 *
 * Essayé deux fois, écarté deux fois, et pour deux raisons différentes. La
 * première fois pour cause de hachage — mais ce diagnostic-là visait un flou
 * *animé*, qui force le re-tramage de la couche à chaque image. La seconde après
 * l'avoir vu tourner, fixe et donc peu coûteux : une carte floue n'est plus une
 * carte, et depuis que les rouleaux montrent de vraies cartes plutôt que des
 * jetons, ce qui défile mérite d'être lisible.
 *
 * Le code qui le pose reste, et une valeur non nulle le rétablit : ce n'est
 * qu'une variable CSS et deux écritures d'attribut par rouleau.
 */
const FLOU = 0;

/** À quelle fraction de la course le flou tombe. */
const FLOU_JUSQU_A = 0.7;

/**
 * À partir de quel rang une carte qui passe allume la colonne.
 *
 * Deux, donc rare et au-dessus. En dessous il ne se passe rien, et c'est le
 * but : un halo qui s'allume à chaque commune n'est plus un signal, c'est un
 * clignotant.
 */
const HALO_RANG = 2;

/**
 * Sous cet écart entre deux franchissements, le halo ne s'allume pas.
 *
 * Au départ le rail franchit une carte toutes les vingt-cinq millisecondes :
 * allumer la colonne à chacune donnerait un stroboscope coloré, illisible et
 * désagréable. Le halo n'a de sens que lorsqu'on a le temps de le voir — c'est
 * précisément la fin de course, quand une rare approche et qu'on la suit des
 * yeux.
 */
const HALO_ECART = 140;

/* --------------------------------------------------------------------------
 * La géométrie — mesurée, cette fois. Voir docs/SPEC.md §4.
 * ------------------------------------------------------------------------ */

export interface Geometrie {
  /** Le pas vertical : une carte, plus la gouttière. */
  pas: number;
  /** La hauteur du bandeau, donc de chaque fenêtre. */
  hauteur: number;
}

/**
 * La géométrie, **mesurée sur ce qui est peint** et non recalculée.
 *
 * ## Pourquoi elle n'est plus calculée ici
 *
 * Elle l'était, et le JavaScript la posait ensuite en variables CSS. Deux
 * défauts, dont un visible :
 *
 * - la feuille de style avait besoin de valeurs par défaut pour le temps d'avant,
 *   et elles étaient fausses. On voyait, l'espace d'un battement à l'ouverture,
 *   des cadres empilés à 120 px les uns des autres au lieu de 305 ;
 * - deux sources décrivaient la même chose. Elles ont déjà divergé une fois, et
 *   le rail s'arrêtait alors deux tuiles à côté du repère.
 *
 * La feuille de style calcule maintenant tout, en requêtes de conteneur, donc
 * dès la première image. Le moteur, lui, **lit le résultat** : le pas est
 * l'écart réel entre deux tuiles, la fenêtre est la hauteur réelle du bandeau.
 * Il ne peut plus se tromper sur ce qu'il anime, puisqu'il le mesure.
 */
export function geometrie(boite: HTMLElement, pistes: HTMLElement[]): Geometrie | null {
  const tuiles = pistes[0]?.children;
  if (!tuiles || tuiles.length < 2) return null;

  const pas =
    (tuiles[1] as HTMLElement).offsetTop - (tuiles[0] as HTMLElement).offsetTop;
  const hauteur = boite.clientHeight;
  if (!(pas > 0) || !(hauteur > 0)) return null;

  return { pas, hauteur };
}

/* --------------------------------------------------------------------------
 * Le hook
 * ------------------------------------------------------------------------ */

/**
 * La mesure et la pose de la géométrie doivent précéder la première peinture.
 *
 * Un `useEffect` tourne **après** : le bandeau serait peint une fois à ses
 * valeurs par défaut, puis une seconde fois aux bonnes — un clignotement au
 * moment exact où le joueur regarde. `useLayoutEffect` n'existe pas au rendu
 * serveur, d'où le repli ; en pratique ce composant n'est monté qu'après un clic
 * et ne passe jamais par le serveur.
 */
const useEffetDeMiseEnPage = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Le contrat DOM entre le hook et le rendu.
 *
 * Le hook ne reçoit qu'une référence : celle du bandeau. Il y trouve les
 * fenêtres et les rubans par ces deux attributs, dans l'ordre du document.
 *
 * C'est plus simple qu'un tableau de références passé de l'un à l'autre, et ce
 * n'est pas un couplage de plus : le hook écrit déjà `data-arrete` sur les
 * fenêtres et les variables CSS sur le bandeau. Autant que le contrat soit
 * lisible dans le balisage plutôt qu'éparpillé dans des `ref` numérotées.
 */
export const ATTR_FENETRE = 'data-rail-fenetre';
export const ATTR_RUBAN = 'data-rail-ruban';

export interface ReglagesRail {
  /** Le bandeau : c'est lui qu'on mesure, et lui qui porte la géométrie. */
  cadre: RefObject<HTMLDivElement | null>;
  /** Combien de bandes tournent en parallèle — une par carte du booster. */
  bandes: number;
  /**
   * Le rang et la couleur de chaque tuile, par rouleau.
   *
   * C'est tout ce que le moteur a besoin de savoir du contenu, et c'est
   * volontaire : il allume un halo, il ne connaît pas les cartes.
   */
  tuiles: { rang: number; couleur: string }[][];
  /**
   * Quelles colonnes le jeton Winter Spin a fait rejouer.
   *
   * Décidé par le serveur, jamais ici — le rail met en scène une relance déjà
   * survenue, il ne la provoque pas.
   */
  relances?: boolean[];
  /** La durée nominale d'une course, en ms. Zéro pour une révélation directe. */
  duree: number;
  /** La loi de mouvement. Deux sont en concurrence — voir `Courbe`. */
  courbe?: Courbe;
  /** Le rang de rareté le plus haut du lot : c'est lui qui décide de la fanfare. */
  rang: number;
  /** Quelle bande porte cette meilleure carte : la fanfare tombe à son arrêt. */
  bandeMeilleure: number;
  /**
   * Ce rail tourne sans un bruit, et ne touche pas au contexte audio.
   *
   * Il n'existe que pour les batailles, où deux rails tournent côte à côte. Les
   * laisser sonner tous les deux ne ferait pas un son plus riche : ce sont les
   * mêmes échantillons aux mêmes instants, à quelques dizaines de millisecondes
   * près, ce qui donne un épaississement sale plutôt qu'un écho. Pire, chaque
   * rail appelle `arreteTout()` en se démontant, et couperait donc le son de son
   * voisin à chaque changement de manche. Un seul des deux parle.
   */
  sourdine?: boolean;
  /** Appelé une fois la dernière carte posée et regardée. */
  onFini: () => void;
}

export function useSpinAnimation({
  cadre,
  bandes,
  tuiles,
  relances = [],
  duree,
  courbe = COURBE_MESUREE,
  rang,
  bandeMeilleure,
  sourdine = false,
  onFini,
}: ReglagesRail): void {

  // `onFini` change d'identité à chaque rendu du parent ; le mettre dans les
  // dépendances relancerait la course. Une référence tenue à jour l'évite.
  const fini = useRef(onFini);
  useEffect(() => {
    fini.current = onFini;
  });

  useEffetDeMiseEnPage(() => {
    const boite = cadre.current;
    if (!boite) return;

    // Un booster sans carte n'existe pas, mais une réponse tronquée, si. Le rail
    // n'aurait alors rien à révéler et l'écran resterait bloqué dessus : on
    // rend la main tout de suite.
    if (bandes < 1) {
      const passage = setTimeout(() => fini.current(), 0);
      return () => clearTimeout(passage);
    }

    const pistes = [...boite.querySelectorAll<HTMLElement>(`[${ATTR_RUBAN}]`)];
    const vues = [...boite.querySelectorAll<HTMLElement>(`[${ATTR_FENETRE}]`)];
    if (pistes.length !== bandes || vues.length !== bandes) return;

    /*
     * Le mode immédiat n'est pas un cas à part : c'est une course d'une
     * milliseconde, sans étalement des arrêts.
     *
     * L'écrire ainsi supprime toute une branche qui posait les transformations à
     * la main. Une animation qui arrive tout de suite laisse quand même la
     * feuille de style faire ses révélations en fondu.
     *
     * `prefers-reduced-motion` n'intervient **pas** ici. Il choisit l'allure par
     * défaut dans `components/allure.ts`, et s'arrête là : le forcer au moment
     * de l'animation écrasait un choix explicite du joueur, sans le dire et sans
     * recours. La durée reçue est la seule autorité.
     */
    const direct = duree <= 0;
    const total = direct ? 1 : duree;
    const amorce = direct ? 0 : AMORCE;

    /* ---------------------- La géométrie, une fois ---------------------- */

    const geo = geometrie(boite, pistes);
    // Le bandeau n'est pas encore mis en page : il n'y a rien à animer, et le
    // filet de sécurité rendra la main de toute façon.
    if (!geo) return;
    boite.style.setProperty('--flou', `${FLOU}px`);

    if (process.env.NODE_ENV !== 'production' && demiFenetre(geo.hauteur, geo.pas) > MARGE) {
      // Le rouleau ne couvre plus la fenêtre : on verrait le vide à son bout.
      // La réponse est d'augmenter MARGE dans lib/spin/courbe.ts, ce qui allonge
      // le rouleau — et donc le nombre de tuiles à peindre. Voir docs/SPEC.md §4.
      console.warn(
        `[rail] la fenêtre montre ${demiFenetre(geo.hauteur, geo.pas).toFixed(1)} tuiles ` +
          `de chaque côté du repère, pour une marge de ${MARGE}.`,
      );
    }

    // Le trajet se mesure sur la hauteur de la fenêtre, pas sur la largeur du
    // bandeau : c'est l'axe sur lequel le rouleau descend.
    const depart = departDeBande(geo.hauteur, geo.pas);
    const trajet = PARCOURS * geo.pas;

    /*
     * Les durées propres à chaque rouleau.
     *
     * Ils partent ensemble et se séparent en fin de course : une demi-seconde
     * d'étalement, dans un ordre tiré au sort. Voir `dureesEtalees`.
     */
    const durees = direct
      ? pistes.map(() => total)
      : dureesEtalees(pistes.length, total, Math.random, courbe);

    /*
     * Les colonnes relancées par le jeton Winter Spin.
     *
     * Leur course dure deux fois plus, plus la pause : elles sont donc toujours
     * les dernières à s'arrêter, ce qui tombe bien — l'appât résout au dernier
     * claquement, et c'est celui de la relance qu'on veut qu'il souligne.
     *
     * Rien de tout cela n'est décidé ici : le serveur a déjà tiré le jeton et la
     * carte qui suit, dans la même transaction que le débit.
     */
    const relance = (i: number) => relances[i] === true && !direct;
    const dureesVues = durees.map((d, i) => (relance(i) ? dureeRelance(d) : d));
    const dernier = dureesVues.indexOf(Math.max(...dureesVues));

    const minuteries: ReturnType<typeof setTimeout>[] = [];
    let coupe = false;

    /** Pose une bande à l'arrêt : la feuille de style fait le reste. */
    const immobilise = (i: number) => {
      const vue = vues[i];
      if (!vue) return;
      // La lueur de passage s'éteint à l'arrêt, quoi qu'il arrive. Celle de la
      // carte gagnée prend le relais, et elle se lit sur `data-arrete` et
      // `data-rang` : deux lueurs superposées ne s'additionnent pas, elles se
      // salissent — surtout si la dernière carte passée n'est pas la gagnante.
      delete vue.dataset.passe;
      vue.dataset.arrete = 'true';
    };

    /*
     * Les images-clés sont les mêmes pour toutes les bandes : même géométrie,
     * même courbe. Seul le retard au départ les distingue.
     *
     * `fill: 'both'` porte les deux bouts, et les deux comptent :
     *
     * - **en arrière**, il applique la première image-clé pendant le retard.
     *   Sans lui, la bande resterait à sa position nulle — tuile zéro collée au
     *   bord gauche — pendant l'amorce, puis sauterait sous le repère au
     *   démarrage. Cent quarante millisecondes d'un rail mal posé, juste avant
     *   le moment le plus visible.
     * - **en avant**, il laisse la dernière image en place après la course, ce
     *   qui permet de n'écrire aucun style depuis le JavaScript : le rail est
     *   décrit une fois, et le compositeur s'en occupe.
     */
    const cles = imagesCles(depart, trajet, courbe);

    const courses = pistes.map((piste, i) =>
      piste.animate(
        relance(i) ? imagesClesRelance(depart, trajet, durees[i], courbe) : cles,
        {
          duration: dureesVues[i],
          delay: amorce,
          easing: 'linear',
          fill: 'both',
        },
      ),
    );

    /*
     * Le palier sur le jeton : la colonne se signale pendant qu'elle attend.
     *
     * Sans cette marque, l'arrêt sur le jeton se lirait comme la fin de la
     * colonne, et le redémarrage comme un défaut. Avec elle, on comprend que
     * quelque chose vient de se produire — c'est tout ce qu'on demande à une
     * seconde d'attente.
     */
    for (let i = 0; i < pistes.length; i += 1) {
      if (!relance(i)) continue;
      const vue = vues[i];
      minuteries.push(
        setTimeout(() => {
          vue.dataset.relance = 'true';
        }, amorce + durees[i]),
      );
      minuteries.push(
        setTimeout(() => {
          delete vue.dataset.relance;
        }, amorce + durees[i] + PAUSE_RELANCE),
      );
    }

    /*
     * Le halo de la colonne, qui suit la rareté passant sous le repère.
     *
     * Les instants viennent de la même inversion de courbe que les dents du
     * cliquet : le halo s'allume donc exactement sur le clic qu'on entend, sans
     * qu'aucune boucle ne surveille quoi que ce soit.
     *
     * On ne programme que les cartes qui méritent d'être signalées, et seulement
     * quand la course a assez ralenti pour qu'on les voie : une poignée de
     * minuteries par rouleau, contre une par image si l'on suivait la position.
     *
     * ## Pourquoi ça se programme depuis `t0`, et pas depuis maintenant
     *
     * Ça se programmait depuis l'exécution de l'effet, et l'animation, elle, ne
     * démarre qu'à la première image suivante — puis `startTime` est réaligné
     * sur `t0` pour toutes les bandes. Deux origines pour une même course : le
     * halo dérivait de tout ce qui séparait les deux, et sur une fin de course
     * où les cartes se succèdent lentement, un décalage suffit à allumer la
     * colonne sur la carte d'à côté. On voyait alors une lueur d'ultra rare
     * autour d'une commune, ce qui est pire que pas de lueur du tout.
     *
     * Le calage se fait donc sur `t0`, la même origine que le son.
     */
    const programmeHalos = (t0: number) => {
      if (direct) return;
      const origine = t0 + amorce;

      for (let i = 0; i < vues.length; i += 1) {
        const acte = franchissements(durees[i], courbe);
        /*
         * Une colonne relancée franchit deux fois le même trajet. Le second acte
         * reprend après la pause, et lit des tuiles `PARCOURS` rangs plus loin —
         * la bande relancée porte les deux courses bout à bout.
         */
        const passages = relance(i)
          ? [
              ...acte,
              ...acte.map((p) => ({
                rang: p.rang + PARCOURS,
                ms: p.ms + durees[i] + PAUSE_RELANCE,
              })),
            ]
          : acte;
        const carte = tuiles[i] ?? [];
        for (let k = 0; k < passages.length; k += 1) {
          const suivant = passages[k + 1]?.ms ?? dureesVues[i];
          const tenue = suivant - passages[k].ms;
          const item = carte[passages[k].rang];
          if (!item || item.rang < HALO_RANG || tenue < HALO_ECART) continue;

          const vue = vues[i];
          minuteries.push(
            setTimeout(
              () => {
                vue.style.setProperty('--passe', item.couleur);
                vue.dataset.passe = String(item.rang);
              },
              origine + passages[k].ms - performance.now(),
            ),
          );
          // Éteint dès que la carte suivante arrive sous le repère : la lueur
          // dure exactement le temps que la carte y passe, pas une image de
          // plus. C'est ce qui la rend lisible — elle désigne une carte.
          minuteries.push(
            setTimeout(
              () => {
                delete vue.dataset.passe;
              },
              origine + suivant - performance.now(),
            ),
          );
        }
      }
    };

    /*
     * Le flou, posé au départ et retiré aux sept dixièmes.
     *
     * Deux écritures d'attribut par rouleau sur toute la course, et rien entre
     * les deux : c'est ce qui le distingue du flou animé qui avait fait hacher
     * le rail. La couche est tramée une fois, floue, puis translatée.
     */
    if (FLOU > 0 && !direct) {
      for (let i = 0; i < pistes.length; i += 1) {
        pistes[i].dataset.flou = 'true';
        minuteries.push(
          setTimeout(
            () => {
              delete pistes[i].dataset.flou;
            },
            amorce + durees[i] * FLOU_JUSQU_A,
          ),
        );
      }
    }

    /*
     * Toutes les bandes sur la même origine.
     *
     * Elles sont créées dans le même tour de boucle, donc leur `startTime` est
     * en principe identique — mais « en principe » ne suffit pas quand on va
     * programmer le son par rapport à lui. On lit celui de la première et on
     * l'impose aux autres : le décalage entre bandes redevient exactement le
     * `delay`, et rien d'autre.
     */
    void courses[0].ready
      .catch(() => {
        /*
         * `ready` est **rejetée** quand l'animation est annulée avant d'avoir
         * démarré — au démontage, et à chaque montage double du mode strict.
         * Sans ce `catch`, le rejet remonte en `unhandledRejection` : deux cent
         * dix-huit dans le journal de développement, tous les miens, tous avec
         * le même message trompeur — « AbortError: The user aborted a request »,
         * qui est le libellé standard d'une annulation et n'a rien à voir avec
         * une requête réseau.
         */
        return null;
      })
      .then((annulee) => {
      if (annulee === null || coupe) return;
      const t0 = Number(courses[0].startTime);
      // Une origine absente ou nulle voudrait dire « depuis le chargement de la
      // page » : l'imposer aux autres bandes les ferait toutes arriver d'un coup.
      if (!Number.isFinite(t0) || t0 <= 0) return;
      for (const course of courses) course.startTime = t0;

      // Le halo se cale sur la même origine que le mouvement : c'est la seule
      // façon qu'il désigne toujours la carte qui est effectivement sous le
      // repère, et jamais sa voisine.
      programmeHalos(t0);

      /*
       * Le son, programmé d'un bloc sur l'horloge audio.
       *
       * C'est le cœur de la reprise. Les trente-sept instants sont connus — ils
       * sortent de l'inversion de la courbe — donc on les pose tous maintenant,
       * échantillon par échantillon, au lieu de guetter les franchissements dans
       * une boucle d'animation qui les quantifierait à l'image.
       */
      // Un rail en sourdine s'arrête ici : il tourne, il ne sonne pas.
      if (sourdine) return;

      const t0Audio = horlogeAudio(t0 + amorce);
      if (t0Audio === null) return;

      const arretDe = (i: number) => t0Audio + dureesVues[i] / 1000;
      const fete = sonDeFete(rang);

      if (!direct) {
        // Le claquement du jeton : la colonne s'arrête une première fois, et il
        // faut l'entendre autant que le voir.
        for (let i = 0; i < courses.length; i += 1) {
          if (relance(i)) programme('commun', t0Audio + durees[i] / 1000);
        }
      }

      if (!direct) {
        /*
         * Un seul rouleau émet le cliquet : celui qui s'arrête en dernier.
         *
         * Les cinq sont identiques pendant six secondes sur six et demie, donc
         * cinq cliquets superposés ne feraient pas un mécanisme plus riche —
         * ils gaspilleraient des voix sur exactement le même son. Prendre le
         * plus long garde le cliquet vivant jusqu'au dernier arrêt, au lieu de
         * le couper pendant que deux rouleaux tournent encore.
         */
        const crans = instantsDesCrans(durees[dernier], courbe);
        // Une colonne relancée franchit deux fois le même trajet : le cliquet
        // repart avec elle, décalé du premier acte et de la pause.
        if (relance(dernier)) {
          const reprise = durees[dernier] + PAUSE_RELANCE;
          crans.push(...crans.slice(0, PARCOURS).map((ms) => ms + reprise));
        }
        programmeCrans(crans, t0Audio);

        // Chaque rouleau garde en revanche son claquement : c'est l'évènement
        // qu'on voit, et c'est lui qui fait des cinq arrêts cinq moments.
        for (let i = 0; i < courses.length; i += 1) programme('commun', arretDe(i));

        // L'appât est calé sur sa fin : ses 5,747 s doivent résoudre pile au
        // dernier claquement, sinon la montée retombe dans le vide.
        if (APPAT_TOUJOURS) programmeFin('appat', arretDe(dernier));
      }

      if (fete) programme(fete, arretDe(bandeMeilleure));
    });

    /*
     * La fin de l'ouverture ne dépend d'aucune promesse d'animation.
     *
     * Elle en dépendait, et c'était une faute : `finished` est le meilleur
     * signal pour poser une bande à l'arrêt — il tombe à l'image près — mais un
     * mauvais signal pour **changer d'écran**. S'il n'arrive pas, quelle qu'en
     * soit la raison, le joueur reste devant un rail immobile sans jamais voir
     * ses cartes, et rien ne le rattrape.
     *
     * Une animation qu'on regarde peut manquer son rendez-vous ; une durée qu'on
     * a soi-même fixée, non. La minuterie de secours est donc l'autorité, et
     * `finished` ne fait qu'arriver plus tôt quand tout va bien.
     */
    let termine = false;
    const conclut = () => {
      if (coupe || termine) return;
      termine = true;
      for (let k = 0; k < vues.length; k += 1) immobilise(k);
      minuteries.push(
        setTimeout(() => fini.current(), direct ? REPOS_IMMEDIAT : REPOS),
      );
    };

    for (let i = 0; i < courses.length; i += 1) {
      void courses[i].finished
        .then(() => {
          if (coupe) return;
          immobilise(i);
          // C'est le rouleau le plus lent qui clôt l'ouverture, et non le
          // dernier de la rangée : depuis que les arrêts sont étalés au hasard,
          // les deux ne sont plus le même.
          if (i === dernier) conclut();
        })
        .catch(() => {
          // `finished` est rejetée quand on annule l'animation : c'est le cas
          // normal du démontage, et il n'y a rien à en faire.
        });
    }

    // Le filet : un quart de seconde après l'arrêt calculé du rouleau le plus
    // lent. Si `finished` a fait son travail, `conclut` a déjà eu lieu et
    // celui-ci ne fait rien.
    minuteries.push(setTimeout(conclut, amorce + Math.max(...dureesVues) + 250));

    return () => {
      coupe = true;
      minuteries.forEach(clearTimeout);
      for (const course of courses) course.cancel();
      // Le contexte audio survit au démontage : sans ce ménage, une trentaine de
      // dents et une fanfare tomberaient dans le vide après le départ du joueur.
      // Un rail en sourdine n'y touche pas : il n'a rien programmé, et couperait
      // le son de celui qui tourne à côté de lui.
      if (!sourdine) arreteTout();
    };
  }, [cadre, bandes, tuiles, relances, duree, courbe, rang, bandeMeilleure, sourdine]);

  // Le contexte audio se réveille au clic, et l'ouverture en est un. Les
  // écouteurs globaux couvrent le reste, mais un appel explicite ici garantit
  // que l'horloge tourne avant qu'on ne programme quarante évènements dessus.
  useEffect(() => {
    reveilleSon();
  }, []);

}
