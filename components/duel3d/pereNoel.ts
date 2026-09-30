import * as THREE from 'three';

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
 * Il sait quatre choses : attendre sur la ligne en respirant, courir en
 * poussant sa boule (les bras visent la boule, qui grossit), tomber — en avant
 * sur un obstacle, en arrière sur la glace, sonné sous trois étoiles — et
 * sauter de joie à l'arrivée.
 */

export type EtatCoureur = 'depart' | 'course' | 'chute' | 'victoire';

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
    chute: 'avant' | 'arriere';
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

  const ancre = new THREE.Object3D();
  ancre.position.set(0, 0.78, 0);
  tete.add(ancre);

  /* ------------------------------- Le jeu ---------------------------------- */
  let foulee = 0;
  const local = new THREE.Vector3();

  function anime({
    t,
    dt,
    etat,
    depuis,
    saut,
    vitesse,
    cible,
    chute,
  }: Parameters<PereNoel3D['anime']>[0]) {
    let penche = -0.1;
    let sautille = 0;
    let jambe = 0;
    let flotte = 0.85;
    corps.scale.y = 1;
    bascule.rotation.z = 0;
    bascule.position.x = 0;
    etoiles.visible = false;
    let visees = true;
    let brasLeves = 0;

    if (etat === 'depart') {
      corps.scale.y = 1 + Math.sin(t * 2.4) * 0.014;
      penche = -0.1 + Math.sin(t * 1.2) * 0.02;
      flotte = 0.8 + Math.sin(t * 1.6) * 0.06;
    } else if (etat === 'course') {
      foulee += dt * (7 + vitesse * 60);
      jambe = Math.sin(foulee) * 0.8;
      sautille = Math.abs(Math.sin(foulee)) * 0.05 + saut * 0.2;
      penche = -0.3 - saut * 0.1;
      flotte = 0.95 + Math.sin(foulee) * 0.18;
    } else if (etat === 'chute') {
      const k = Math.min(1, depuis / 0.6);
      const e = rebond(k);
      visees = false;
      if (chute === 'avant') {
        bascule.rotation.z = -0.3 - 1.12 * e;
        bascule.position.x = 0.3 * e;
        jambe = 0.55 * e;
      } else {
        bascule.rotation.z = 1.45 * e;
        bascule.position.x = 0.8 * (1 - (1 - k) * (1 - k));
        jambe = -0.9 * e;
      }
      flotte = 1.3;
      brasLeves = chute === 'avant' ? 2.2 : 1.1 + Math.sin(t * 18) * 0.5 * (1 - k);
      if (k >= 1) {
        etoiles.visible = true;
        etoiles.rotation.y += dt * 3.2;
        etoiles.position.y = (chute === 'avant' ? 0.55 : 0.48) + Math.sin(t * 5) * 0.03;
        etoiles.position.x = chute === 'avant' ? 1.25 : -1.0;
      }
    } else {
      // La victoire : il bondit, bras au ciel.
      const bond = Math.abs(Math.sin(t * 7.2));
      sautille = bond * 0.42;
      penche = 0.06;
      jambe = -0.35 * bond;
      visees = false;
      brasLeves = 2.75 + Math.sin(t * 14) * 0.18;
      flotte = 0.6 + bond * 0.5;
    }

    bascule.position.y = sautille;
    corps.rotation.z = penche;
    jambes[0].rotation.z = jambe;
    jambes[1].rotation.z = etat === 'course' ? -jambe : jambe;
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
      // Bras levés en V à la victoire ; à la chute, jetés vers l'avant.
      const ecarte = etat === 'victoire' ? 0.62 : 0.2;
      for (const [i, epaule] of bras.entries()) {
        const cote = i === 0 ? -1 : 1;
        epaule.rotation.z = brasLeves;
        epaule.rotation.x = -cote * ecarte;
        epaule.scale.y = 1;
      }
    }
  }

  return { racine, ancre, anime };
}
