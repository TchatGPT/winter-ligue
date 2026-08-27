'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PackArtwork } from './PackArtwork';

/**
 * Dimensions d'affichage, en pixels.
 *
 * Elles suivent le ratio de la planche détourée — 1117 × 1981, soit **1:1,774**,
 * qui est aussi celui d'un booster du commerce (67 × 117 mm).
 */
const W = 200;
const H = 355;

/**
 * Demi-épaisseur du sachet en son point le plus gonflé.
 *
 * 14 px pour 200 px de large, soit 14 % d'épaisseur totale. C'est au-dessus de
 * ce que donneraient cinq à huit cartes dans un sachet de 67 mm, et c'est
 * volontaire : à l'échelle où le sachet est affiché, l'épaisseur physiquement
 * juste ne se lisait pas.
 */
const T = 14;

/** Ce qu'il reste d'épaisseur au ras des soudures : presque rien. */
const SOUDURE = 0.05;

/** Longueur de la reprise entre soudure et corps, en fraction de la hauteur. */
const REPRISE = 0.115;

/**
 * Découpage du maillage.
 *
 * Les colonnes sont resserrées près des bords et les rangées près des
 * soudures : c'est là que le film tourne le plus vite, donc là qu'une tuile
 * plate s'écarte le plus de la vraie courbe.
 */
const COLS = [0, 0.04, 0.095, 0.17, 0.29, 0.5, 0.71, 0.83, 0.905, 0.96, 1];
const ROWS = [0, 0.034, 0.07, 0.115, 0.885, 0.93, 0.966, 1];

/** Chevauchement des tuiles, pour que les coutures ne s'ouvrent pas. */
const CHEV = 1.3;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Deux décimales : la précision au-delà ne sert qu'à casser l'hydratation. */
function arrondi(n: number) {
  return Math.round(n * 100) / 100;
}

function lissage(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Profil transversal : une lentille, plate au centre, pincée aux plis. */
function galbeX(u: number) {
  return Math.sin(Math.PI * u) ** 0.65;
}

/** Profil vertical : nul aux soudures, plein dans le corps. */
function galbeY(v: number) {
  const t = v < REPRISE ? v / REPRISE : v > 1 - REPRISE ? (1 - v) / REPRISE : 1;
  return SOUDURE + (1 - SOUDURE) * lissage(t);
}

/** L'écart au plan médian, en pixels, en un point de la surface. */
function prof(u: number, v: number) {
  return T * galbeX(u) * galbeY(v);
}

interface Tuile {
  left: number;
  top: number;
  w: number;
  h: number;
  z: number;
  ry: number;
  rx: number;
  /** La tuile tombe-t-elle dans une soudure ? */
  soudure: boolean;
}

/**
 * Le maillage, calculé une fois pour toutes.
 *
 * Chaque tuile est un quadrilatère plat qui approche la surface galbée : on la
 * place à la profondeur du centre de sa maille, puis on l'incline selon les
 * pentes locales en x et en y. Avec des mailles resserrées là où ça tourne, la
 * facettisation ne se voit pas.
 */
const TUILES: Tuile[] = [];
for (let i = 0; i < COLS.length - 1; i += 1) {
  const u0 = COLS[i];
  const u1 = COLS[i + 1];
  const uc = (u0 + u1) / 2;

  for (let j = 0; j < ROWS.length - 1; j += 1) {
    const v0 = ROWS[j];
    const v1 = ROWS[j + 1];
    const vc = (v0 + v1) / 2;

    const x0 = u0 * W;
    const y0 = v0 * H;
    const dx = (u1 - u0) * W;
    const dy = (v1 - v0) * H;

    // Pentes locales. Le signe de `ry` suit CSS : un `rotateY` positif éloigne
    // le bord droit du regard, or sur la moitié gauche c'est lui qui avance.
    const ry = Math.atan2(prof(u0, vc) - prof(u1, vc), dx) * DEG;
    const rx = Math.atan2(prof(uc, v1) - prof(uc, v0), dy) * DEG;

    // Une tuile inclinée doit être plus grande pour couvrir la même maille.
    const w = dx / Math.cos(ry * RAD) + CHEV;
    const h = dy / Math.cos(rx * RAD) + CHEV;

    // Arrondi obligatoire, et pas cosmétique.
    //
    // `Math.sin` et `**` ne sont pas tenus de rendre le même bit de poids
    // faible d'un moteur à l'autre. Le maillage est calculé au rendu serveur
    // puis recalculé dans le navigateur : sans arrondi, deux styles écartés
    // d'un ULP suffisaient à déclencher une erreur d'hydratation React.
    TUILES.push({
      left: arrondi(x0 - (w - dx) / 2),
      top: arrondi(y0 - (h - dy) / 2),
      w: arrondi(w),
      h: arrondi(h),
      z: arrondi(prof(uc, vc)),
      ry: arrondi(ry),
      rx: arrondi(rx),
      soudure: vc < 0.075 || vc > 0.925,
    });
  }
}

/**
 * La coupe du sachet, pour la vue de profil.
 *
 * Les tuiles n'ont pas d'épaisseur : vues exactement par la tranche, elles se
 * réduisent à des traits et le sachet paraîtrait creux. Ce plan médian, découpé
 * au profil réel, remplit la silhouette. Il est gardé 6 % en retrait de la
 * coque pour ne jamais la traverser — le tri en profondeur du navigateur se
 * fait par plan, pas par pixel, et deux surfaces qui se croisent s'affichent
 * mal.
 */
const COUPE = (() => {
  const droite: string[] = [];
  const gauche: string[] = [];
  for (let k = 0; k <= 24; k += 1) {
    const v = k / 24;
    const demi = 50 * galbeY(v) * 0.94;
    droite.push(`${(50 + demi).toFixed(2)}% ${(v * 100).toFixed(2)}%`);
    gauche.unshift(`${(50 - demi).toFixed(2)}% ${(v * 100).toFixed(2)}%`);
  }
  return `polygon(${[...droite, ...gauche].join(',')})`;
})();

/**
 * L'ombrage, en dégradés à l'échelle du sachet entier.
 *
 * Une première version calculait une teinte plate par tuile. Chaque tuile
 * devenait alors un aplat légèrement différent de sa voisine, et le sachet se
 * couvrait de bandes verticales — le maillage se voyait. Ici les dégradés font
 * la taille du sachet et sont décalés comme la planche : ils traversent les
 * tuiles sans montrer une seule couture.
 *
 * `deg` bascule à 270 pour le verso, dont les tuiles sont retournées.
 */
const bombement = (deg: number) =>
  `linear-gradient(${deg}deg,
    rgb(0 0 0 / 0.66) 0%,
    rgb(0 0 0 / 0.3) 5%,
    rgb(255 255 255 / 0.26) 16%,
    rgb(255 255 255 / 0.03) 30%,
    rgb(0 0 0 / 0.12) 47%,
    rgb(255 255 255 / 0.2) 66%,
    rgb(255 255 255 / 0.02) 80%,
    rgb(0 0 0 / 0.32) 93%,
    rgb(0 0 0 / 0.7) 100%)`;

/** Le creux d'ombre des deux plis, là où la soudure rejoint le corps. */
const PLIS = `linear-gradient(180deg,
  rgb(0 0 0 / 0) 5%,
  rgb(0 0 0 / 0.34) 11.5%,
  rgb(0 0 0 / 0) 19%,
  rgb(0 0 0 / 0) 81%,
  rgb(0 0 0 / 0.34) 88.5%,
  rgb(0 0 0 / 0) 95%)`;

/** Les stries de la soudure. */
const STRIES =
  'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.34) 0 1px, ' +
  'rgb(0 0 0 / 0.3) 1px 2px, rgb(255 255 255 / 0.12) 2px 3px)';

/** Le mylar brossé du verso, teinté par le booster. */
const MYLAR = `linear-gradient(190deg,
  #eaf2fb 0%,
  color-mix(in srgb, var(--p1) 38%, #bacdde) 21%,
  #dfeaf5 43%,
  color-mix(in srgb, var(--p2) 44%, #7e94aa) 68%,
  #d2e0ef 100%)`;

/** Le vernis : la bande spéculaire large qui fait « feuille brillante ». */
const VERNIS = `linear-gradient(255deg,
  rgb(255 255 255 / 0) 24%,
  rgb(255 255 255 / 0.44) 42%,
  rgb(255 255 255 / 0.05) 52%,
  rgb(255 255 255 / 0.3) 61%,
  rgb(255 255 255 / 0) 76%)`;

/**
 * L'impression du verso, en SVG embarqué.
 *
 * Le verso est fait de dizaines de tuiles : y poser un élément de texte le
 * découperait en morceaux. En passant par une image de la taille du sachet,
 * décalée comme les autres couches, le texte traverse les tuiles d'un bloc.
 *
 * Le SVG est un document isolé : les polices du site ne l'atteignent pas, d'où
 * une pile générique. Sur un dos de sachet, une grotesque condensée fait
 * parfaitement l'affaire.
 *
 * Le texte est écrit à l'endroit. Les tuiles du verso sont retournées, mais
 * leur fond est décalé en miroir (voir `px` plus bas) : les deux inversions
 * s'annulent et l'impression se lit correctement quand on regarde le dos.
 */
function versoImprime(nom: string) {
  const police = "font-family='Arial Narrow, Haettenschweiler, Arial, sans-serif'";

  // L'Everest : la longue épaule ouest à gauche, le sommet pyramidal décalé à
  // droite du centre, et une arête d'avant-plan qui donne la profondeur.
  //
  // Les massifs descendent sous le bord du sachet et débordent sur les côtés.
  // Fermer leur contour à l'intérieur du cadre traçait un trait horizontal net
  // en travers du dos, qui se lisait comme une couture et non comme un relief.
  const massif =
    'M-4,380 L-4,250 L28,208 L46,222 L70,180 L86,194 L106,132 L124,168 ' +
    'L142,156 L162,200 L180,184 L204,252 L204,380 Z';
  const avant =
    'M-4,380 L-4,262 L26,238 L50,250 L76,220 L98,238 L120,214 L146,240 ' +
    'L170,226 L204,262 L204,380 Z';
  const neige = 'M106,132 L119,160 L110,165 L106,176 L99,162 L93,158 Z';

  /**
   * Le gaufrage.
   *
   * Une copie sombre décalée vers le bas-droite, une copie claire vers le
   * haut-gauche, et un voile neutre par-dessus l'intérieur. Seuls les liserés
   * qui dépassent restent visibles : le motif n'est pas posé sur la feuille,
   * il est frappé dedans.
   *
   * Le décalage reste petit — 1,1 px pour un sachet de 200 px de large. Au-delà
   * les liserés cessent d'être des arêtes et redeviennent un dessin.
   */
  const relief = (d: string, force: number) =>
    `<path d='${d}' transform='translate(1.1,1.1)' fill='#08131f' opacity='${(0.36 * force).toFixed(2)}'/>` +
    `<path d='${d}' transform='translate(-1.1,-1.1)' fill='#ffffff' opacity='${(0.42 * force).toFixed(2)}'/>` +
    `<path d='${d}' fill='#8ca4bb' opacity='${(0.12 * force).toFixed(2)}'/>`;

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>` +
    relief(massif, 1) +
    relief(neige, 0.8) +
    relief(avant, 0.85) +
    `<g fill='#f4faff' text-anchor='middle' ${police}>` +
    `<text x='${W / 2}' y='${H * 0.3}' font-size='10' font-weight='700' ` +
    `letter-spacing='3.2' opacity='0.9'>WINTER LIGUE</text>` +
    `<text x='${W / 2}' y='${H * 0.86}' font-size='19' font-weight='700' ` +
    `letter-spacing='4.4' opacity='0.75'>${nom.toUpperCase()}</text>` +
    `</g>` +
    `<g fill='#eaf4ff' opacity='0.32'>` +
    `<rect x='${W * 0.28}' y='${H * 0.325}' width='${W * 0.44}' height='0.8'/>` +
    `<rect x='${W * 0.36}' y='${H * 0.895}' width='${W * 0.28}' height='0.8'/>` +
    `</g>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface Pack3DProps {
  name: string;
  cardCount: number;
  gradient: [string, string];
  /** Planche peinte du sachet. Absente, on retombe sur le sachet dessiné. */
  art?: string | null;
  /** Coupe la rotation continue, pendant l'ouverture par exemple. */
  frozen?: boolean;
  /**
   * Rendu allégé, pour le sélecteur.
   *
   * Une vignette n'a ni maillage, ni verso, ni prise à la souris : une seule
   * face suffit à reconnaître un sachet à cette taille. Le maillage coûte cent
   * quarante tuiles — en afficher un par booster à côté de la grande scène
   * multiplierait la page par cinq pour un gain nul.
   */
  vignette?: boolean;
  /** Facteur d'échelle. La géométrie reste la même, seul l'affichage change. */
  taille?: number;
  className?: string;
}

/**
 * Le sachet de booster, orientable à 360°.
 *
 * **La planche EST le sachet** : elle n'est ni recadrée, ni encadrée, ni
 * recouverte. Le code ne fait que lui donner la forme d'un sachet gonflé.
 *
 * Trois versions ont précédé, et chacune corrigeait la précédente :
 *
 *  1. **Une boîte à six faces**, avec la planche collée devant. Épaisseur
 *     constante du haut en bas, arête vive au sommet — ça se lisait comme un
 *     carton. Or un sachet n'a pas d'arête en haut : il y est soudé à plat.
 *  2. **Deux plans sans épaisseur.** Le sommet était réglé, mais l'objet
 *     disparaissait de profil : un sachet plein de cartes est gonflé, il a
 *     une vraie épaisseur au milieu.
 *  3. **La surface galbée**, ici. La planche est découpée en tuiles qui
 *     suivent un profil en lentille : nul aux soudures, maximal au centre.
 *     C'est la forme d'un sachet, sans être une boîte.
 *
 * Au repos le sachet se balance. Dès qu'on l'attrape, la rotation passe sous
 * le doigt avec de l'inertie au relâchement : c'est ce ralentissement
 * progressif qui fait qu'un objet manipulé semble avoir une masse.
 */
export function BoosterPack3D({
  name,
  cardCount,
  gradient,
  art,
  frozen = false,
  vignette = false,
  taille = 1,
  className,
}: Pack3DProps) {
  const packRef = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  // L'état de rotation vit dans des refs, pas dans le state : le faire passer
  // par React déclencherait un rendu par image d'animation.
  const rot = useRef({ x: -8, y: 0 });
  const velocity = useRef(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0, at: 0 });
  const frame = useRef<number | null>(null);

  const apply = useCallback(() => {
    const el = packRef.current;
    if (!el) return;
    el.style.setProperty('--rx3', `${rot.current.x.toFixed(2)}deg`);
    el.style.setProperty('--ry3', `${rot.current.y.toFixed(2)}deg`);
  }, []);

  /**
   * Inertie : la vitesse décroît jusqu'à devenir imperceptible.
   *
   * La boucle est une fonction locale nommée plutôt qu'un `useCallback` qui
   * s'appellerait lui-même : une fonction déclarée par `useCallback` ne peut
   * pas se référencer dans sa propre closure sans figer une version périmée
   * d'elle-même.
   */
  const startGlide = useCallback(() => {
    const step = () => {
      if (dragging.current) return;
      velocity.current *= 0.94;
      if (Math.abs(velocity.current) < 0.02) {
        velocity.current = 0;
        frame.current = null;
        return;
      }
      rot.current.y += velocity.current;
      apply();
      frame.current = requestAnimationFrame(step);
    };

    if (frame.current === null) frame.current = requestAnimationFrame(step);
  }, [apply]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    setGrabbed(true);
    velocity.current = 0;
    last.current = { x: event.clientX, y: event.clientY, at: performance.now() };

    // On repart de l'angle réellement affiché par l'animation CSS, sinon le
    // sachet saute à zéro au moment où on le saisit.
    const el = packRef.current;
    if (el) {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const yaw = Math.atan2(-matrix.m31, matrix.m11) * DEG;
      if (Number.isFinite(yaw)) rot.current.y = yaw;
      apply();
    }
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const now = performance.now();
    const dx = event.clientX - last.current.x;
    const dy = event.clientY - last.current.y;
    const dt = Math.max(1, now - last.current.at);

    rot.current.y += dx * 0.45;
    // L'axe vertical est bridé : au-delà, on regarde le sachet par la tranche
    // et l'objet devient illisible.
    rot.current.x = Math.max(-32, Math.min(32, rot.current.x - dy * 0.28));

    velocity.current = (dx * 0.45 * 16) / dt;
    last.current = { x: event.clientX, y: event.clientY, at: now };
    apply();
  };

  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // Vitesse bornée : un geste très rapide ne doit pas transformer le sachet
    // en toupie.
    velocity.current = Math.max(-9, Math.min(9, velocity.current));
    startGlide();
  };

  /**
   * La coque galbée, portée par la planche.
   *
   * Le maillage a besoin d'une image tramée : chaque tuile affiche sa part de
   * la planche en décalant un fond. Les boosters encore sans planche restent
   * donc sur deux plans dessinés — un repli, appelé à disparaître dès que
   * leurs quatre illustrations sont livrées.
   */
  // L'impression du verso ne dépend que du nom : inutile de reconstruire le
  // SVG et de le ré-encoder à chaque image d'animation.
  const verso = useMemo(() => versoImprime(name), [name]);

  const coque = vignette ? (
    /* Une seule face, posée de trois quarts. L'ombrage du bombement est là,
       le maillage non : à cette taille, la courbure ne se verrait pas. */
    <div className="sachet-face">
      {art ? (
        <span
          className="sachet-vignette"
          style={{ backgroundImage: `${PLIS}, ${bombement(90)}, url("${art}")` }}
          aria-hidden="true"
        />
      ) : (
        <PackArtwork name={name} cardCount={cardCount} tint={gradient} />
      )}
    </div>
  ) : art ? (
    <>
      {TUILES.map((t, i) => {
        const couches = [PLIS, bombement(90), `url("${art}")`];
        return (
          <span
            key={`av${i}`}
            className="sachet-tuile"
            style={{
              left: t.left,
              top: t.top,
              width: t.w,
              height: t.h,
              transform: `translateZ(${t.z.toFixed(2)}px) rotateY(${t.ry.toFixed(2)}deg) rotateX(${t.rx.toFixed(2)}deg)`,
              backgroundImage: couches.join(', '),
              backgroundSize: couches.map(() => `${W}px ${H}px`).join(', '),
              backgroundPosition: couches
                .map(() => `${(-t.left).toFixed(2)}px ${(-t.top).toFixed(2)}px`)
                .join(', '),
            }}
            aria-hidden="true"
          />
        );
      })}

      {TUILES.map((t, i) => {
        // L'ordre compte : le vernis passe par-dessus l'impression, comme sur
        // une vraie feuille brillante où le texte est sous le brillant.
        const couches = t.soudure
          ? [PLIS, bombement(270), STRIES, MYLAR]
          : [PLIS, bombement(270), VERNIS, verso, MYLAR];
        // Les tuiles du verso sont retournées sur elles-mêmes : leur repère
        // horizontal est inversé. Sans ce décalage miroir, chaque tuile
        // redémarrerait le dégradé pour son compte et le maillage réapparaîtrait.
        const px = (t.left + t.w - W).toFixed(2);
        return (
          <span
            key={`ar${i}`}
            className="sachet-tuile"
            style={{
              left: t.left,
              top: t.top,
              width: t.w,
              height: t.h,
              transform: `translateZ(${(-t.z).toFixed(2)}px) rotateY(${(-t.ry).toFixed(2)}deg) rotateX(${(-t.rx).toFixed(2)}deg) rotateY(180deg)`,
              backgroundImage: couches.join(', '),
              backgroundSize: couches.map(() => `${W}px ${H}px`).join(', '),
              backgroundPosition: couches
                .map(() => `${px}px ${(-t.top).toFixed(2)}px`)
                .join(', '),
            }}
            aria-hidden="true"
          />
        );
      })}

      <span
        className="sachet-coupe"
        style={{ left: W / 2 - T, width: T * 2, height: H, clipPath: COUPE }}
        aria-hidden="true"
      />
    </>
  ) : (
    <>
      <div className="sachet-face sachet-avant" style={{ transform: 'translateZ(1.5px)' }}>
        <PackArtwork name={name} cardCount={cardCount} tint={gradient} />
        <span className="sachet-reflet" aria-hidden="true" />
      </div>
      <div
        className="sachet-face sachet-arriere"
        style={{ transform: 'rotateY(180deg) translateZ(1.5px)' }}
      >
        {/* Le même verso que la coque galbée : la face pleine largeur est
            retournée d'un bloc, donc son fond se lit déjà à l'endroit. */}
        <span
          className="sachet-dos"
          style={{
            backgroundImage: [VERNIS, verso, MYLAR].join(', '),
            backgroundSize: `${W}px ${H}px, ${W}px ${H}px, ${W}px ${H}px`,
          }}
          aria-hidden="true"
        />
      </div>
    </>
  );

  // La mise à l'échelle porte sur la scène, pas sur la géométrie : le maillage
  // est calculé une fois pour toutes et reste juste à toutes les tailles.
  const boite =
    taille === 1
      ? undefined
      : { width: Math.round(W * taille), height: Math.round(H * taille) };

  const scene = (
    <div
      className={`sachet-scene ${vignette ? 'sachet-scene-fixe' : ''} ${boite ? '' : (className ?? '')}`}
      style={{
        width: W,
        height: H,
        ...(boite ? { transform: `scale(${taille})`, transformOrigin: 'top left' } : null),
      }}
    >
      <div
        ref={packRef}
        className={`sachet ${vignette || grabbed || frozen ? '' : 'sachet-tourne'}`}
        style={{
          width: W,
          height: H,
          ['--p1' as string]: gradient[0],
          ['--p2' as string]: gradient[1],
          ...(vignette ? { ['--rx3' as string]: '-6deg', ['--ry3' as string]: '-15deg' } : null),
        }}
        {...(vignette
          ? {}
          : {
              onPointerDown: onDown,
              onPointerMove: onMove,
              onPointerUp: onUp,
              onPointerCancel: onUp,
            })}
        role="img"
        aria-label={
          vignette
            ? `Sachet ${name}`
            : `Sachet ${name}, ${cardCount} cartes — faites-le tourner`
        }
      >
        {coque}
        <span className="sachet-ombre" aria-hidden="true" />
      </div>
    </div>
  );

  // Un conteneur à la taille réduite, sinon la scène occuperait toujours sa
  // place d'origine dans la mise en page malgré le `scale`.
  return boite ? (
    <div className={className} style={{ ...boite, overflow: 'visible' }}>
      {scene}
    </div>
  ) : (
    scene
  );
}
