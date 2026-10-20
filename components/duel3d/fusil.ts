import * as THREE from 'three';
import { couleur, texGlace, texGrain } from './matieres';

/**
 * Le fusil de glace de la rafale : une AK-47 taillée dans la glace, qui tire
 * des boules de neige (la fête `rafale`, voir `lib/domain/course.ts`).
 *
 * La caméra la montre de loin, de profil : ce sont ses lignes qui doivent la
 * faire reconnaître — le chargeur en banane recourbé vers l'avant, la crosse
 * fixe qui plonge, la poignée-pistolet, le tube des gaz au-dessus du canon, le
 * guidon en aileron, la baguette sous le canon, le grand levier de sûreté sur
 * le flanc droit. Les profils sont relevés en millimètres sur la vraie, puis
 * extrudés, arêtes adoucies.
 *
 * La glace a deux tons, comme le bois et l'acier de l'arme : profonde et lisse
 * pour la boîte de culasse, le canon et le chargeur ; claire et givrée pour la
 * crosse, la poignée et les garde-mains. Les tranches de chaque pièce sont
 * blanches de givre, comme celles d'un bloc taillé : c'est ce qui la fait lire
 * comme de la glace, et non comme du plastique bleu.
 *
 * Repère : le canon le long de +x, le haut en +y, le flanc droit — celui que
 * la caméra voit, et d'où sortent les douilles — en +z. L'origine est sur
 * l'axe du canon, au-dessus de la poignée.
 */

/**
 * Du millimètre de la vraie à l'unité de la scène : bien plus grande que
 * nature — un jouet de père Noël —, pour se reconnaître de loin.
 */
const MM = 1.45 / 1000;

export interface Fusil3D {
  groupe: THREE.Group;
  /** La bouche : la boule de neige en part, le long de l'axe du canon. */
  bouche: THREE.Object3D;
  /** La fenêtre d'éjection, sur le flanc droit : les douilles en sortent. */
  ejection: THREE.Object3D;
  /** Là où la main droite tient l'arme, dans le repère du groupe. */
  poignee: THREE.Vector3;
  /** Le talon de la crosse, qui se cale contre l'épaule, dans le repère du groupe. */
  talon: THREE.Vector3;
  /** La glace de l'arme : les douilles et le givre de la bouche sont de la même. */
  glace: THREE.Material;
}

type Point = [number, number];

/** Un profil fermé, extrudé sur `epaisseur` millimètres, centré en z, arêtes adoucies. */
function profil(points: Point[], epaisseur: number, chanfrein = 2.5): THREE.ExtrudeGeometry {
  const forme = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const profondeur = Math.max(0.5, epaisseur - 2 * chanfrein);
  const g = new THREE.ExtrudeGeometry(forme, {
    depth: profondeur,
    bevelEnabled: true,
    bevelThickness: chanfrein,
    bevelSize: chanfrein,
    // Le chanfrein mange le profil au lieu de l'élargir : les cotes restent justes.
    bevelOffset: -chanfrein,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -profondeur / 2);
  return g;
}

/** Un tube le long de x, de `x0` à `x1`, à la hauteur `y`. */
function tube(rayon: number, x0: number, x1: number, y: number): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(rayon, rayon, x1 - x0, 20);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, 0);
  return g;
}

/**
 * Le chargeur en banane : sa ligne médiane est un arc qui part sous la boîte
 * de culasse, presque à la verticale, et se recourbe vers l'avant ; il
 * s'élargit un peu vers le bas, jusqu'à la semelle.
 */
function chargeur(): Point[] {
  const rayon = 360;
  const depart = 0.12;
  const balayage = 0.64;
  const cx = 106 + rayon * Math.cos(depart);
  const cy = -40 + rayon * Math.sin(depart);
  const pas = 16;
  const dos: Point[] = [];
  const face: Point[] = [];
  for (let i = 0; i <= pas; i += 1) {
    const k = i / pas;
    const angle = Math.PI + depart + balayage * k;
    const demi = 33 + 7 * k;
    dos.push([cx + (rayon + demi) * Math.cos(angle), cy + (rayon + demi) * Math.sin(angle)]);
    face.push([cx + (rayon - demi) * Math.cos(angle), cy + (rayon - demi) * Math.sin(angle)]);
  }
  return [...dos, ...face.reverse()];
}

export function creeFusilDeGlace(): Fusil3D {
  const veines = texGlace(41);
  // Les profils sont en millimètres : un motif tous les trente centimètres.
  veines.repeat.set(1 / 420, 1 / 420);
  const profonde = new THREE.MeshPhysicalMaterial({
    color: couleur('--fusil-glace', '#3197dc'),
    map: veines,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    // Un liseré clair sur les arrondis, comme la glace prend la lumière par la tranche.
    sheen: 0.8,
    sheenColor: couleur('--frost', '#eaf7ff'),
    sheenRoughness: 0.3,
    envMapIntensity: 2.4,
  });
  const grain = texGrain(23);
  // Les profils sont en millimètres : un grain tous les sept centimètres.
  grain.repeat.set(1 / 70, 1 / 70);
  const givree = new THREE.MeshPhysicalMaterial({
    color: couleur('--fusil-givre', '#84c9ee'),
    roughness: 0.55,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
    sheen: 1,
    sheenColor: couleur('--neige-1', '#ffffff'),
    sheenRoughness: 0.7,
    bumpMap: grain,
    bumpScale: 1.6,
  });
  // Les tranches, givrées : plus blanches, plus mates, grenues.
  const tranche = new THREE.MeshPhysicalMaterial({
    color: couleur('--frost', '#eaf7ff'),
    roughness: 0.4,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    sheen: 1,
    sheenColor: couleur('--neige-1', '#ffffff'),
    sheenRoughness: 0.6,
    bumpMap: grain,
    bumpScale: 1.2,
  });

  const groupe = new THREE.Group();
  const arme = new THREE.Group();
  arme.scale.setScalar(MM);
  groupe.add(arme);
  const pose = (geo: THREE.BufferGeometry, mat: THREE.Material, z = 0) => {
    // Un profil extrudé : ses faces (groupe 0), puis ses tranches (groupe 1).
    // Un tube : son flanc, puis ses deux bouts.
    const mats =
      geo instanceof THREE.ExtrudeGeometry
        ? [mat, tranche]
        : geo instanceof THREE.CylinderGeometry
          ? [mat, tranche, tranche]
          : mat;
    const m = new THREE.Mesh(geo, mats);
    m.position.z = z;
    m.castShadow = true;
    arme.add(m);
    return m;
  };

  // La crosse fixe, qui plonge vers le talon, et sa plaque de couche.
  pose(
    profil(
      [
        [-78, 6],
        [-110, 2],
        [-200, -9],
        [-300, -20],
        [-330, -23],
        [-330, -137],
        [-318, -140],
        [-250, -118],
        [-180, -95],
        [-120, -72],
        [-90, -56],
        [-78, -46],
      ],
      36,
    ),
    givree,
  );
  pose(
    profil(
      [
        [-339, -21],
        [-329, -21],
        [-329, -139],
        [-339, -139],
      ],
      38,
      2,
    ),
    profonde,
  );

  // La boîte de culasse, son couvercle arrondi à l'arrière.
  pose(
    profil(
      [
        [-80, -44],
        [-80, 4],
        [-74, 12],
        [-62, 17],
        [190, 17],
        [198, 13],
        [214, 13],
        [214, -44],
      ],
      30,
    ),
    profonde,
  );
  // La hausse, sur l'avant de la boîte, et sa planchette.
  pose(
    profil(
      [
        [196, 12],
        [242, 12],
        [242, 24],
        [196, 24],
      ],
      22,
      2,
    ),
    profonde,
  );
  pose(
    profil(
      [
        [204, 23],
        [238, 23],
        [236, 31],
        [206, 29],
      ],
      12,
      1.5,
    ),
    profonde,
  );

  // Le garde-main du haut, autour du tube des gaz ; le bloc des gaz, devant.
  pose(tube(15, 236, 395, 25), givree);
  pose(tube(12, 394, 402, 25), profonde);
  pose(tube(9, 400, 462, 25), profonde);
  pose(
    profil(
      [
        [456, 33],
        [486, 33],
        [490, -8],
        [452, -8],
      ],
      22,
      2,
    ),
    profonde,
  );

  // Le garde-main du bas, sous le canon.
  pose(
    profil(
      [
        [214, -6],
        [214, -42],
        [370, -40],
        [388, -34],
        [392, -22],
        [392, -6],
      ],
      42,
    ),
    givree,
  );

  // Le canon, la baguette dessous, le guidon en aileron, le frein de bouche.
  pose(tube(9, 214, 528, 0), profonde);
  pose(tube(3.2, 236, 520, -18), profonde);
  pose(
    profil(
      [
        [484, -13],
        [524, -13],
        [524, 13],
        [484, 13],
      ],
      24,
      2,
    ),
    profonde,
  );
  pose(
    profil(
      [
        [488, 12],
        [500, 50],
        [512, 50],
        [522, 12],
      ],
      16,
      2,
    ),
    profonde,
  );
  pose(
    profil(
      [
        [490, -12],
        [518, -12],
        [516, -25],
        [492, -25],
      ],
      14,
      1.5,
    ),
    profonde,
  );
  pose(tube(11, 524, 552, 0), profonde);

  // La poignée-pistolet, penchée vers l'arrière ; le pontet et la détente.
  pose(
    profil(
      [
        [8, -40],
        [-32, -40],
        [-62, -140],
        [-58, -150],
        [-34, -153],
        [-24, -146],
        [8, -52],
      ],
      28,
    ),
    givree,
  );
  pose(
    profil(
      [
        [12, -42],
        [16, -76],
        [70, -76],
        [74, -42],
        [66, -42],
        [63, -69],
        [23, -69],
        [20, -42],
      ],
      10,
      1.5,
    ),
    profonde,
  );
  pose(
    profil(
      [
        [30, -42],
        [38, -42],
        [36, -56],
        [32, -64],
        [28, -62],
        [31, -54],
      ],
      8,
      1.5,
    ),
    profonde,
  );

  // Le chargeur en banane.
  pose(profil(chargeur(), 26, 3), profonde);

  // Sur le flanc droit : le grand levier de sûreté, et le levier d'armement.
  pose(
    profil(
      [
        [-62, -6],
        [40, -2],
        [72, -10],
        [66, -20],
        [-62, -18],
      ],
      4,
      1,
    ),
    profonde,
    17,
  );
  const tige = new THREE.CylinderGeometry(5.5, 5.5, 20, 12);
  tige.rotateX(Math.PI / 2);
  pose(tige, profonde, 25).position.set(150, 3, 25);
  pose(new THREE.SphereGeometry(8, 14, 10), profonde).position.set(150, 3, 37);

  const bouche = new THREE.Object3D();
  bouche.position.set(556, 0, 0);
  arme.add(bouche);
  const ejection = new THREE.Object3D();
  ejection.position.set(95, 6, 20);
  arme.add(ejection);

  return {
    groupe,
    bouche,
    ejection,
    poignee: new THREE.Vector3(-24, -92, 0).multiplyScalar(MM),
    talon: new THREE.Vector3(-334, -72, 0).multiplyScalar(MM),
    glace: profonde,
  };
}
