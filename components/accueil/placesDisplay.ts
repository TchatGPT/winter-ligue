/**
 * La display de l'accueil, rendue dans Blender (16/11/2026) : ce que la vidéo
 * montre, et où elle laisse les boosters.
 *
 * La vidéo est rendue par `scratchpad/display/display2.py`, en deux cadrages :
 * le paysage des ordinateurs (plateau de 1920 × 1080) et le portrait des
 * téléphones (1080 × 1920), fond transparent. Le navigateur ne lit pas la
 * transparence d'une vidéo partout (Safari ignore celle du VP9) : elle est
 * encodée en H.264 avec sa transparence en niveaux de gris à côté de l'image —
 * dessous en paysage, à droite en portrait — et recomposée dans un `<canvas>`
 * (`detoureur`).
 *
 * À sa dernière image, les quatre boosters sont exactement aux places
 * ci-dessous, face à l'écran et sans lumière de scène : le site y pose les
 * vraies images, et la vidéo s'efface sous elles. À changer avec la vidéo.
 */

/** Le cadrage du téléphone et de la tablette debout. Le CSS dit la même chose (`.acc-scene`). */
export const REQUETE_PORTRAIT = '(max-width: 1023px) and (orientation: portrait)';

/** La vidéo dure 188 images à 30 i/s. */
export const IMAGES_PAR_SECONDE = 30;

/**
 * L'image où la display commence à s'effacer : le centre de la page (le nom,
 * l'entrée, les tuiles) apparaît là.
 */
export const IMAGE_REVELATION = 160;

/** Un booster à la fin de la vidéo : le centre de son image, en pixels du plateau, et son inclinaison. */
export interface PlaceBooster {
  x: number;
  y: number;
  /** En degrés, dans le sens des aiguilles d'une montre. */
  inclinaison: number;
}

export interface FormatDisplay {
  plateau: { largeur: number; hauteur: number };
  /** La hauteur d'un booster à la fin, en pixels du plateau (image de 600 × 1119). */
  hauteurBooster: number;
  places: Record<string, PlaceBooster>;
  /** Les vidéos, de la plus fine à la plus légère, avec la largeur d'écran (en pixels réels) qu'elles servent. */
  videos: { src: string; pourLargeur: number }[];
  /** Où est la transparence dans la vidéo : sous l'image, ou à sa droite. */
  alpha: 'dessous' | 'droite';
}

export const PAYSAGE: FormatDisplay = {
  plateau: { largeur: 1920, hauteur: 1080 },
  hauteurBooster: 500,
  places: {
    perso: { x: 232, y: 455, inclinaison: 7 },
    commu: { x: 520, y: 400, inclinaison: 3.5 },
    folie: { x: 1400, y: 400, inclinaison: -3.5 },
    finisseur: { x: 1688, y: 455, inclinaison: -7 },
  },
  videos: [
    { src: '/accueil/display-2560.mp4?v=2', pourLargeur: 1800 },
    { src: '/accueil/display-1600.mp4?v=2', pourLargeur: 0 },
  ],
  alpha: 'dessous',
};

export const PORTRAIT: FormatDisplay = {
  plateau: { largeur: 1080, hauteur: 1920 },
  hauteurBooster: 400,
  places: {
    perso: { x: 150, y: 345, inclinaison: 8 },
    commu: { x: 395, y: 315, inclinaison: 3 },
    folie: { x: 685, y: 315, inclinaison: -3 },
    finisseur: { x: 930, y: 345, inclinaison: -8 },
  },
  videos: [{ src: '/accueil/display-portrait.mp4?v=2', pourLargeur: 0 }],
  alpha: 'droite',
};

/**
 * La place d'un booster dans un format, en variables CSS (pourcentages du
 * plateau) : `--{prefixe}-g`, `-h`, `-l`, `-t`, `-r`. Le CSS choisit le jeu
 * selon le cadrage.
 */
export function placeEnVariables(prefixe: string, f: FormatDisplay, p: PlaceBooster): Record<string, string> {
  const hauteur = f.hauteurBooster;
  const largeur = (hauteur * 600) / 1119;
  const pc = (v: number, total: number) => `${((v / total) * 100).toFixed(4)}%`;
  return {
    [`--${prefixe}-g`]: pc(p.x - largeur / 2, f.plateau.largeur),
    [`--${prefixe}-h`]: pc(p.y - hauteur / 2, f.plateau.hauteur),
    [`--${prefixe}-l`]: pc(largeur, f.plateau.largeur),
    [`--${prefixe}-t`]: pc(hauteur, f.plateau.hauteur),
    [`--${prefixe}-r`]: `${p.inclinaison}deg`,
  };
}
