/**
 * La display de l'accueil, rendue dans Blender (16/11/2026) : ce que la vidéo
 * montre, et où elle laisse les boosters.
 *
 * La vidéo est rendue par `scratchpad/display/display.py` sur un plateau de
 * 1920 × 1080, fond transparent. Le navigateur ne lit pas la transparence
 * d'une vidéo partout (Safari ignore celle du VP9) : elle est donc encodée en
 * H.264, l'image en haut et sa transparence en niveaux de gris en bas
 * (1920 × 2160), et recomposée dans un `<canvas>` (`useVideoDetouree`).
 *
 * À sa dernière image, les quatre boosters sont exactement aux places
 * ci-dessous, face à l'écran et sans lumière de scène : le site y pose les
 * vraies images, et la vidéo s'efface sous elles. À changer avec la vidéo.
 */

export const PLATEAU = { largeur: 1920, hauteur: 1080 } as const;

/** La vidéo, en grand et en petit (téléphone, économie de données). */
export const VIDEO_DISPLAY = {
  grande: '/accueil/display.mp4?v=1',
  petite: '/accueil/display-960.mp4?v=1',
} as const;

/** La vidéo dure 176 images à 30 i/s. */
export const IMAGES_PAR_SECONDE = 30;

/**
 * L'image où la display commence à s'effacer : le centre de la page (le nom,
 * l'entrée, les tuiles) apparaît là.
 */
export const IMAGE_REVELATION = 150;

/** Un booster à la fin de la vidéo : le centre de son image, en pixels du plateau, et son inclinaison. */
export interface PlaceBooster {
  x: number;
  y: number;
  /** En degrés, dans le sens des aiguilles d'une montre. */
  inclinaison: number;
}

/** La taille d'un booster à la fin de la vidéo, en pixels du plateau (image de 600 × 1119). */
export const TAILLE_BOOSTER = { largeur: (500 * 600) / 1119, hauteur: 500 } as const;

export const PLACES_BOOSTERS: Record<string, PlaceBooster> = {
  perso: { x: 232, y: 455, inclinaison: 7 },
  commu: { x: 520, y: 400, inclinaison: 3.5 },
  folie: { x: 1400, y: 400, inclinaison: -3.5 },
  finisseur: { x: 1688, y: 455, inclinaison: -7 },
};

/** La place d'un booster en pourcentages du plateau, pour le CSS. */
export function placeEnPourcents(p: PlaceBooster) {
  const { largeur, hauteur } = TAILLE_BOOSTER;
  return {
    left: `${(((p.x - largeur / 2) / PLATEAU.largeur) * 100).toFixed(4)}%`,
    top: `${(((p.y - hauteur / 2) / PLATEAU.hauteur) * 100).toFixed(4)}%`,
    width: `${((largeur / PLATEAU.largeur) * 100).toFixed(4)}%`,
    height: `${((hauteur / PLATEAU.hauteur) * 100).toFixed(4)}%`,
    rotate: `${p.inclinaison}deg`,
  };
}
