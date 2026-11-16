/**
 * La display de l'accueil, rendue dans Blender (EEVEE, 16/11/2026) : ce que la
 * vidéo montre, et où elle laisse les boosters.
 *
 * La vidéo est rendue par `scratchpad/display/display4.py`, en deux cadrages :
 * le paysage des ordinateurs (1920 × 1080) et le portrait des téléphones
 * (1080 × 2160). La display tombe dans un champ de neige, s'y enfonce et se
 * renverse un peu ; son couvercle saute, des boosters sont éjectés (corps
 * rigides simulés) ; les quatre de la ligue s'élèvent et vont se placer. La
 * vidéo couvre tout l'écran, comme une image de fond (`cover`).
 *
 * À sa dernière image, les quatre boosters sont exactement aux places
 * ci-dessous, face à l'écran et sans lumière de scène : le site y pose les
 * vraies images, puis dissipe la scène dans un brouillard (`ecranBrume`) qui
 * laisse apparaître la page. À changer avec la vidéo.
 */

/** Le cadrage du téléphone et de la tablette debout. Le CSS dit la même chose (`.acc-scene`). */
export const REQUETE_PORTRAIT = '(max-width: 1023px) and (orientation: portrait)';

/**
 * Le brouillard (`ecranBrume`), en secondes depuis le début de la vidéo : il
 * monte quand les quatre boosters se relèvent de la neige (`DEBUT`), couvre la
 * scène sous eux pendant qu'ils vont prendre leur pose (`MONTEE`), puis se
 * dissipe et laisse apparaître la page (`LEVEE`). Les boosters restent
 * au-dessus : le brouillard ne les couvre jamais.
 */
export const BRUME = { debut: 3.3, montee: 1.2, levee: 1.8 } as const;

/** L'avancée du brouillard, de 0 (rien) à 0,5 (la scène couverte) puis 1 (dissipé). */
export function avanceeBrume(t: number): number {
  const { debut, montee, levee } = BRUME;
  if (t <= debut) return 0;
  if (t <= debut + montee) return (0.5 * (t - debut)) / montee;
  return Math.min(1, 0.5 + (0.5 * (t - debut - montee)) / levee);
}

/** Le moment du brouillard (de 0 à 1) où le centre de la page apparaît. */
export const REVELATION_BRUME = 0.62;

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
  /** La vidéo : la scène, l'image des boosters de la ligue et leur transparence, côte à côte. */
  video: string;
  /** Comment les trois images sont rangées : l'une sous l'autre, ou côte à côte. */
  pile: 'verticale' | 'horizontale';
}

export const PAYSAGE: FormatDisplay = {
  plateau: { largeur: 1920, hauteur: 1080 },
  hauteurBooster: 480,
  places: {
    perso: { x: 270, y: 390, inclinaison: 7 },
    commu: { x: 545, y: 345, inclinaison: 3.5 },
    folie: { x: 1375, y: 345, inclinaison: -3.5 },
    finisseur: { x: 1650, y: 390, inclinaison: -7 },
  },
  video: '/accueil/display-paysage.mp4?v=6',
  pile: 'verticale',
};

export const PORTRAIT: FormatDisplay = {
  plateau: { largeur: 1080, hauteur: 2160 },
  hauteurBooster: 380,
  places: {
    perso: { x: 180, y: 400, inclinaison: 8 },
    commu: { x: 412, y: 372, inclinaison: 3 },
    folie: { x: 668, y: 372, inclinaison: -3 },
    finisseur: { x: 900, y: 400, inclinaison: -8 },
  },
  video: '/accueil/display-portrait.mp4?v=6',
  pile: 'horizontale',
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
