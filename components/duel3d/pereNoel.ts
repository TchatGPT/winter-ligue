import * as THREE from 'three';
import type { Chute, Fete } from '../../lib/domain/course';

/**
 * Le père Noël de la course, en trois dimensions.
 *
 * Un personnage de jeu, construit de formes simples bien éclairées : manteau
 * de velours (un reflet satiné qui glisse sur les rondeurs), fourrure duveteuse,
 * bottes et ceinture vernies, boucle d'or. Le visage a ce qui le rend vivant —
 * des yeux ovales avec leur éclat, des sourcils de neige, une moustache, une
 * barbe en volume, les joues qui rosissent — et le bonnet retombe en arrière,
 * pompon au bout, en suivant la course.
 *
 * Le bot est le même, d'acier : peau métallique, yeux allumés.
 *
 * Il sait attendre en respirant, courir en poussant sa boule (les bras visent
 * la boule, qui grossit), et finir de bien des façons, tirées par la course :
 *
 *  - perdre : en avant sur un obstacle, en arrière sur la glace, écrasé par sa
 *    propre boule, assis à bout de souffle, ou à la renverse, une boule de neige
 *    en pleine face — et sonné sous trois étoiles ;
 *  - gagner : sauter de joie, danser en tournoyant, grimper sur sa boule ;
 *  - lancer : la ligne passée, se retourner, armer, lancer, et rire.
 */

export type EtatCoureur = 'depart' | 'course' | 'chute' | 'victoire' | 'lancer';

export interface Tenue {
  manteau: THREE.Color;
  peau: THREE.Color;
  nez: THREE.Color;
  fourrure: THREE.Color;
  cuir: THREE.Color;
  or: THREE.Color;
  /** Le bot : peau d'acier, yeux allumés. */
  robot: boolean;
  yeux: THREE.Color;
}

export interface PereNoel3D {
  /** Posée aux pieds, au sol. */
  racine: THREE.Group;
  /** Au-dessus du bonnet : là où s'accroche son nom. */
  ancre: THREE.Object3D;
  /** La moufle qui lance la boule de neige. */
  main: THREE.Object3D;
  /** Le visage : là où la boule de neige arrive. */
  visage: THREE.Object3D;
  /**
   * Une image. `cible` est le point de la boule que les mains visent, dans le
   * repère du monde ; `depuis` le temps passé dans l'état courant.
   */
  anime(e: {
    t: number;
    dt: number;
    etat: EtatCoureur;
    depuis: number;
    saut: number;
    vitesse: number;
    cible: THREE.Vector3;
    /** Comment il perd, s'il perd. */
    mode: Chute;
    /** Comment il fête, s'il gagne. */
    fete: Fete;
    /** Pour grimper sur sa boule : l'écart jusqu'à elle, et la hauteur de son sommet. */
    dessus: { dx: number; hauteur: number };
  }): void;
}

const BLANC = new THREE.Color('#ffffff');

function piece(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Rebond amorti, pour une chute qui tape puis se pose. */
function rebond(k: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
}

function etoile(): THREE.BufferGeometry {
  const f = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? 0.075 : 0.032;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) f.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else f.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  f.closePath();
  const g = new THREE.ExtrudeGeometry(f, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  g.center();
  return g;
}

export function creePereNoel(tenue: Tenue): PereNoel3D {
  /* ------------------------------ Les matières ----------------------------- */
  const velours = new THREE.MeshPhysicalMaterial({
    color: tenue.manteau,
    roughness: 0.62,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: tenue.manteau.clone().lerp(BLANC, 0.45),
  });
  const pantalon = velours.clone();
  pantalon.color = tenue.manteau.clone().multiplyScalar(0.78);
  const fourrure = new THREE.MeshPhysicalMaterial({
    color: tenue.fourrure,
    roughness: 0.95,
    sheen: 1,
    sheenRoughness: 0.9,
    sheenColor: BLANC,
  });
  const peau = new THREE.MeshPhysicalMaterial({
    color: tenue.peau,
    roughness: tenue.robot ? 0.3 : 0.55,
    metalness: tenue.robot ? 0.6 : 0,
    clearcoat: tenue.robot ? 0.7 : 0.15,
    sheen: tenue.robot ? 0 : 0.4,
    sheenColor: tenue.nez,
  });
  const nez = new THREE.MeshPhysicalMaterial({ color: tenue.nez, roughness: 0.3, clearcoat: 0.6 });
  const cuir = new THREE.MeshPhysicalMaterial({ color: tenue.cuir, roughness: 0.28, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const or = new THREE.MeshStandardMaterial({ color: tenue.or, roughness: 0.22, metalness: 1 });
  const oeil = new THREE.MeshStandardMaterial({
    color: tenue.robot ? tenue.yeux : new THREE.Color('#0b1220'),
    roughness: 0.12,
    emissive: tenue.robot ? tenue.yeux : new THREE.Color('#000000'),
    emissiveIntensity: tenue.robot ? 1.3 : 0,
  });
  const eclat = new THREE.MeshBasicMaterial({ color: BLANC });
  const joue = new THREE.MeshStandardMaterial({ color: tenue.nez, roughness: 0.6, transparent: true, opacity: tenue.robot ? 0 : 0.42, depthWrite: false });
  const astre = new THREE.MeshStandardMaterial({ color: tenue.or, roughness: 0.3, metalness: 0.6, emissive: tenue.or, emissiveIntensity: 0.35 });

  /* ------------------------------- Le corps -------------------------------- */
  const racine = new THREE.Group();
  const bascule = new THREE.Group();
  racine.add(bascule);
  const corps = new THREE.Group();
  corps.position.y = 0.66;
  bascule.add(corps);

  const ventre = piece(new THREE.SphereGeometry(0.42, 36, 28), velours, 0, 0.05, 0);
  ventre.scale.set(1, 1.12, 0.96);
  corps.add(ventre);

  // La fourrure du bas du manteau, et la bande qui descend sur le devant.
  const ourlet = piece(new THREE.TorusGeometry(0.325, 0.085, 16, 40), fourrure, 0, -0.27, 0);
  ourlet.rotation.x = Math.PI / 2;
  corps.add(ourlet);
  const bande = piece(new THREE.CapsuleGeometry(0.05, 0.22, 6, 12), fourrure, 0.405, 0.2, 0);
  bande.rotation.z = -0.28;
  corps.add(bande);

  // La ceinture et sa boucle.
  const cuirDouble = cuir.clone();
  cuirDouble.side = THREE.DoubleSide;
  corps.add(piece(new THREE.CylinderGeometry(0.428, 0.432, 0.12, 48, 1, true), cuirDouble, 0, -0.02, 0));
  const boucle = piece(new THREE.BoxGeometry(0.05, 0.16, 0.2), or, 0.43, -0.02, 0);
  corps.add(boucle);
  corps.add(piece(new THREE.BoxGeometry(0.052, 0.07, 0.1), cuir, 0.438, -0.02, 0));

  /* -------------------------------- La tête -------------------------------- */
  const tete = new THREE.Group();
  tete.position.set(0.06, 0.62, 0);
  corps.add(tete);

  tete.add(piece(new THREE.SphereGeometry(0.29, 36, 28), peau));
  for (const cote of [-1, 1]) tete.add(piece(new THREE.SphereGeometry(0.07, 16, 12), peau, -0.02, 0, cote * 0.28));

  const truffe = piece(new THREE.SphereGeometry(0.075, 20, 16), nez, 0.29, -0.02, 0);
  truffe.scale.set(1, 0.9, 1);
  tete.add(truffe);
  tete.add(piece(new THREE.SphereGeometry(0.018, 8, 6), eclat, 0.34, 0.015, 0.03));

  for (const cote of [-1, 1]) {
    const o = piece(new THREE.SphereGeometry(0.042, 16, 12), oeil, 0.238, 0.075, cote * 0.108);
    o.scale.set(0.7, 1.18, 1);
    tete.add(o);
    tete.add(piece(new THREE.SphereGeometry(0.012, 8, 6), eclat, 0.268, 0.097, cote * 0.108 + 0.012));
    const sourcil = piece(new THREE.CapsuleGeometry(0.022, 0.08, 4, 8), fourrure, 0.24, 0.152, cote * 0.118);
    sourcil.rotation.set(Math.PI / 2, 0, 0);
    sourcil.rotation.y = cote * 0.25;
    tete.add(sourcil);
    const rose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), joue);
    rose.position.set(0.222, -0.03, cote * 0.18);
    rose.scale.set(0.45, 0.8, 1);
    tete.add(rose);
  }

  // La barbe, en volume : des boules de fourrure serrées autour du menton.
  const barbe: [number, number, number, number][] = [
    [0.16, -0.17, 0, 0.17],
    [0.12, -0.2, 0.13, 0.15],
    [0.12, -0.2, -0.13, 0.15],
    [0.02, -0.14, 0.2, 0.13],
    [0.02, -0.14, -0.2, 0.13],
    [0.2, -0.28, 0, 0.125],
    [0.1, -0.3, 0.085, 0.115],
    [0.1, -0.3, -0.085, 0.115],
    [0.15, -0.38, 0, 0.085],
  ];
  for (const [x, y, z, r] of barbe) tete.add(piece(new THREE.SphereGeometry(r, 20, 16), fourrure, x, y, z));

  for (const cote of [-1, 1]) {
    const m = piece(new THREE.CapsuleGeometry(0.045, 0.1, 6, 12), fourrure, 0.285, -0.08, cote * 0.065);
    m.rotation.set(cote * 1.15, 0, 0.35);
    tete.add(m);
  }

  // Le bonnet : le revers, le corps, la pointe qui retombe et son pompon.
  const bonnet = new THREE.Group();
  bonnet.position.set(-0.02, 0.17, 0);
  bonnet.rotation.z = 0.32;
  tete.add(bonnet);
  const revers = piece(new THREE.TorusGeometry(0.262, 0.078, 16, 40), fourrure);
  revers.rotation.x = Math.PI / 2;
  bonnet.add(revers);
  bonnet.add(piece(new THREE.CylinderGeometry(0.11, 0.265, 0.34, 32), velours, 0, 0.18, 0));
  const pointe = new THREE.Group();
  pointe.position.y = 0.34;
  bonnet.add(pointe);
  pointe.add(piece(new THREE.ConeGeometry(0.11, 0.36, 28), velours, 0, 0.17, 0));
  const pompon = piece(new THREE.SphereGeometry(0.088, 20, 16), fourrure, 0, 0.36, 0);
  pointe.add(pompon);

  /* ------------------------------- Les bras -------------------------------- */
  const LONGUEUR_BRAS = 0.57;
  const bras: THREE.Group[] = [];
  const moufles: THREE.Mesh[] = [];
  for (const cote of [-1, 1]) {
    const epaule = new THREE.Group();
    epaule.position.set(0.12, 0.28, cote * 0.36);
    epaule.rotation.x = -cote * 0.12;
    corps.add(epaule);
    epaule.add(piece(new THREE.SphereGeometry(0.11, 20, 16), velours));
    epaule.add(piece(new THREE.CapsuleGeometry(0.095, 0.3, 8, 16), velours, 0, -0.2, 0));
    const poignet = piece(new THREE.TorusGeometry(0.097, 0.038, 12, 24), fourrure, 0, -0.38, 0);
    poignet.rotation.x = Math.PI / 2;
    epaule.add(poignet);
    const moufle = piece(new THREE.SphereGeometry(0.112, 20, 16), cuir, 0, -0.47, 0);
    moufles.push(moufle);
    moufle.scale.set(1, 1.12, 0.9);
    epaule.add(moufle);
    bras.push(epaule);
  }

  /* ------------------------------ Les jambes ------------------------------- */
  const jambes: THREE.Group[] = [];
  for (const cote of [-1, 1]) {
    const hanche = new THREE.Group();
    hanche.position.set(0, -0.3, cote * 0.16);
    corps.add(hanche);
    hanche.add(piece(new THREE.CapsuleGeometry(0.115, 0.14, 8, 16), pantalon, 0, -0.12, 0));
    const revers = piece(new THREE.TorusGeometry(0.112, 0.042, 12, 24), fourrure, 0, -0.2, 0);
    revers.rotation.x = Math.PI / 2;
    hanche.add(revers);
    const botte = piece(new THREE.CapsuleGeometry(0.105, 0.13, 8, 16), cuir, 0.05, -0.27, 0);
    botte.rotation.z = Math.PI / 2;
    hanche.add(botte);
    jambes.push(hanche);
  }

  /* ------------------------- Les étoiles de la chute ------------------------ */
  const etoiles = new THREE.Group();
  etoiles.position.set(0.02, 1.62, 0);
  etoiles.visible = false;
  const formeEtoile = etoile();
  for (let i = 0; i < 3; i += 1) {
    const e = new THREE.Mesh(formeEtoile, astre);
    const a = (i / 3) * Math.PI * 2;
    e.position.set(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
    etoiles.add(e);
  }
  racine.add(etoiles);

  // La neige d'une boule reçue en pleine face.
  const masque = piece(new THREE.SphereGeometry(0.2, 20, 16), fourrure, 0.25, 0.03, 0);
  masque.scale.set(0.55, 0.95, 1.05);
  masque.visible = false;
  tete.add(masque);
  const visage = new THREE.Object3D();
  visage.position.set(0.3, 0.02, 0);
  tete.add(visage);

  const ancre = new THREE.Object3D();
  ancre.position.set(0, 0.78, 0);
  tete.add(ancre);

  /* ------------------------------- Le jeu ---------------------------------- */
  let foulee = 0;
  const local = new THREE.Vector3();
  const lisse = (k: number) => k * k * (3 - 2 * k);
  const borne = (k: number) => Math.min(1, Math.max(0, k));

  function anime({
    t,
    dt,
    etat,
    depuis,
    saut,
    vitesse,
    cible,
    mode,
    fete,
    dessus,
  }: Parameters<PereNoel3D['anime']>[0]) {
    let penche = -0.1;
    let hauteur = 0;
    let avance = 0;
    let rotation = 0;
    let tourne = 0;
    let jambe = 0;
    let jambesEnsemble = false;
    let flotte = 0.85;
    let visees = true;
    // Les bras, quand ils ne visent pas la boule : [lanceur, autre], et leur écart.
    let brasZ: [number, number] = [0.3, 0.3];
    let brasX = 0.2;
    corps.scale.set(1, 1, 1);
    corps.rotation.x = 0;
    tete.rotation.z = 0;
    etoiles.visible = false;
    masque.visible = false;

    if (etat === 'depart') {
      corps.scale.y = 1 + Math.sin(t * 2.4) * 0.014;
      penche = -0.1 + Math.sin(t * 1.2) * 0.02;
      flotte = 0.8 + Math.sin(t * 1.6) * 0.06;
    } else if (etat === 'course') {
      foulee += dt * (7 + vitesse * 60);
      jambe = Math.sin(foulee) * 0.8;
      hauteur = Math.abs(Math.sin(foulee)) * 0.05 + saut * 0.2;
      penche = -0.3 - saut * 0.1;
      flotte = 0.95 + Math.sin(foulee) * 0.18;
    } else if (etat === 'lancer') {
      // Il se retourne, arme le bras au-dessus de la tête, lance — et rit.
      visees = false;
      tourne = Math.PI * lisse(borne(depuis / 0.3));
      penche = -0.05;
      if (depuis < 0.3) {
        brasZ = [0.6, 0.6];
      } else if (depuis < 0.55) {
        const k = lisse((depuis - 0.3) / 0.25);
        brasZ = [0.6 - 3.1 * k, 0.6 + 0.7 * k];
        penche = 0.1 * k;
      } else if (depuis < 0.78) {
        const k = 1 - (1 - (depuis - 0.55) / 0.23) ** 2;
        brasZ = [-2.5 + 4 * k, 1.3];
        penche = 0.1 - 0.4 * k;
      } else {
        brasZ = [0.45, 0.45];
        brasX = 0.75;
        penche = -0.05 + Math.sin(t * 24) * 0.05;
        hauteur = Math.abs(Math.sin(t * 24)) * 0.025;
      }
      flotte = 1.1;
    } else if (etat === 'chute') {
      const k = borne(depuis / 0.6);
      const e = rebond(k);
      visees = false;
      flotte = 1.3;
      let etoilesX = 1.25;
      let etoilesY = 0.55;
      if (mode === 'rocher' || mode === 'eclate') {
        rotation = -0.3 - 1.12 * e;
        avance = 0.3 * e;
        jambe = 0.55 * e;
        brasZ = [2.2, 2.2];
      } else if (mode === 'glisse') {
        rotation = 1.45 * e;
        avance = 0.8 * (1 - (1 - k) * (1 - k));
        jambe = -0.9 * e;
        brasZ = [1.1 + Math.sin(t * 18) * 0.5 * (1 - k), 1.1 - Math.sin(t * 18) * 0.5 * (1 - k)];
        etoilesX = -1.0 + avance;
        etoilesY = 0.48;
      } else if (mode === 'boule') {
        // À la renverse, la neige plein la figure.
        masque.visible = true;
        rotation = 1.45 * e;
        jambe = -0.8 * e;
        brasZ = [1.2 + Math.sin(t * 20) * 0.6 * (1 - k), 1.2 - Math.sin(t * 20) * 0.6 * (1 - k)];
        brasX = 0.5;
        etoilesX = -1.0;
        etoilesY = 0.48;
      } else {
        // À bout de souffle : il s'assoit dans la neige, la tête basse, et souffle.
        const kk = lisse(borne(depuis / 0.5));
        hauteur = -0.3 * kk;
        jambe = 1.35 * kk;
        jambesEnsemble = true;
        penche = 0.18 * kk;
        tete.rotation.z = -0.35 * kk;
        brasZ = [0.25, 0.25];
        brasX = 0.35;
        corps.scale.y = 1 + Math.sin(t * 9) * 0.035 * kk;
      }
      if (k >= 1 && mode !== 'essouffle') {
        etoiles.visible = true;
        etoiles.rotation.y += dt * 3.2;
        etoiles.position.set(etoilesX, etoilesY + Math.sin(t * 5) * 0.03, 0);
      }
    } else {
      // La victoire, de trois façons.
      visees = false;
      if (fete === 'danse') {
        tourne = t * 5.5;
        hauteur = Math.abs(Math.sin(t * 10)) * 0.14;
        jambe = Math.sin(t * 10) * 0.3;
        brasZ = [1.45, 1.45];
        brasX = 1.25 + Math.sin(t * 10) * 0.15;
        penche = 0.05;
      } else if (fete === 'grimpe') {
        // Il saute sur sa boule, et s'y tient, bras au ciel.
        const k = borne(depuis / 0.5);
        avance = dessus.dx * lisse(k);
        hauteur = dessus.hauteur * lisse(k) + Math.sin(Math.PI * k) * 0.55;
        if (k >= 1) hauteur = dessus.hauteur + Math.abs(Math.sin(t * 6.5)) * 0.1;
        jambe = k < 1 ? -0.5 : 0;
        brasZ = [2.75 + Math.sin(t * 12) * 0.12, 2.75 - Math.sin(t * 12) * 0.12];
        brasX = 0.62;
        penche = 0.04;
      } else {
        const bond = Math.abs(Math.sin(t * 7.2));
        hauteur = bond * 0.42;
        penche = 0.06;
        jambe = -0.35 * bond;
        brasZ = [2.75 + Math.sin(t * 14) * 0.18, 2.75 + Math.sin(t * 14) * 0.18];
        brasX = 0.62;
        flotte = 0.6 + bond * 0.5;
      }
    }

    racine.rotation.y = tourne;
    bascule.rotation.z = rotation;
    bascule.position.set(avance, hauteur, 0);
    corps.rotation.z = penche;
    jambes[0].rotation.set(0, 0, jambe);
    jambes[1].rotation.set(0, 0, etat === 'course' && !jambesEnsemble ? -jambe : jambe);
    pointe.rotation.z = flotte;

    if (visees) {
      // Les mains vont chercher la boule : on vise, et le bras s'allonge un peu.
      racine.updateMatrixWorld(true);
      for (const [i, epaule] of bras.entries()) {
        epaule.rotation.x = -(i === 0 ? -1 : 1) * 0.12;
        local.copy(cible);
        corps.worldToLocal(local);
        const dx = local.x - epaule.position.x;
        const dy = local.y - epaule.position.y;
        epaule.rotation.z = Math.atan2(dx, -dy);
        epaule.scale.y = THREE.MathUtils.clamp(Math.hypot(dx, dy) / LONGUEUR_BRAS, 0.82, 1.3);
      }
    } else {
      // bras[1] lance ; bras[0] équilibre.
      bras[1].rotation.set(-brasX, 0, brasZ[0]);
      bras[0].rotation.set(brasX, 0, brasZ[1]);
      bras[0].scale.y = 1;
      bras[1].scale.y = 1;
    }
  }

  return { racine, ancre, main: moufles[1], visage, anime };
}
