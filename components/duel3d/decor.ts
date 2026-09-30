import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  couleur,
  hasard,
  texBanniere,
  texCiel,
  texDamier,
  texDrapeau,
  texFlocon,
  texGrain,
  texSucreDOrge,
} from './matieres';

/**
 * Le décor de la course : une piste de neige tassée entre des congères, deux
 * couloirs, des sapins chargés de neige, des montagnes dans la brume, la neige
 * qui tombe — et l'arrivée : une ligne en damier au sol, deux poteaux en sucre
 * d'orge dont les drapeaux à damier claquent au vent, et le panneau
 * « ARRIVÉE » au bord de la piste, face à la caméra.
 *
 * La caméra filme la course de côté : c'est de là qu'on voit les pères Noël
 * pousser leur boule. Une arche en travers de la piste aurait été vue par la
 * tranche ; les drapeaux et le panneau, eux, lui font face.
 */

/** La longueur de la course, du départ à l'arrivée. */
export const LONGUEUR = 26;
/** L'axe de chaque couloir : l'hôte devant, l'adversaire derrière. */
export const AXE = { hote: 1.6, adversaire: -1.6 } as const;

export interface Palette {
  neige: THREE.Color;
  piste: THREE.Color;
  ombreNeige: THREE.Color;
  nuit: THREE.Color;
  cielHaut: THREE.Color;
  cielBas: THREE.Color;
  ecorce: THREE.Color;
  bois: THREE.Color;
  roche: THREE.Color;
  sapin: THREE.Color;
  glace: THREE.Color;
  montagne: THREE.Color;
  rouge: THREE.Color;
  or: THREE.Color;
  aurore: THREE.Color;
  givre: THREE.Color;
}

export function palette(): Palette {
  return {
    neige: couleur('--decor-neige', '#f3f8fd'),
    piste: couleur('--decor-piste', '#d2e1ef'),
    ombreNeige: couleur('--neige-3', '#cfe7f7'),
    nuit: couleur('--nuit', '#06284a'),
    cielHaut: couleur('--decor-ciel-haut', '#17365c'),
    cielBas: couleur('--decor-ciel-bas', '#b9d6ea'),
    ecorce: couleur('--decor-ecorce', '#5e3f2b'),
    bois: couleur('--decor-bois', '#d8b388'),
    roche: couleur('--decor-roche', '#7a8ba0'),
    sapin: couleur('--decor-sapin', '#1d5646'),
    glace: couleur('--decor-glace', '#a8dcf4'),
    montagne: couleur('--decor-montagne', '#5b7a99'),
    rouge: couleur('--noel-rouge', '#d63a44'),
    or: couleur('--gold', '#ffd97d'),
    aurore: couleur('--aurora', '#63eec4'),
    givre: couleur('--ice', '#8fdcff'),
  };
}

export interface Decor {
  groupe: THREE.Group;
  ciel: THREE.Texture;
  /** Les drapeaux, la neige qui tombe ; `centre` suit la caméra. */
  anime(t: number, dt: number, centre: number): void;
}

/** Un drapeau à damier, en tissu : il ondule, et sa lumière suit les plis. */
function drapeau(tex: THREE.Texture) {
  const geo = new THREE.PlaneGeometry(1.25, 0.82, 28, 12);
  geo.translate(0.625, 0, 0);
  const base = Float32Array.from(geo.attributes.position.array as Float32Array);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.75 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const anime = (t: number, dephasage: number) => {
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const u = base[i] / 1.25;
      const v = base[i + 1];
      pos[i + 2] = (Math.sin(u * 7 - t * 7.5 + dephasage) * 0.11 + Math.sin(v * 4 + t * 4.2) * 0.025) * u;
      pos[i + 1] = v - u * u * 0.08;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return { m, anime };
}

export function creeDecor(pal: Palette, police: string): Decor {
  const groupe = new THREE.Group();
  const alea = hasard(20251224);

  /* ------------------------------- Le sol ---------------------------------- */
  const grain = texGrain(3);
  grain.repeat.set(70, 30);
  const neige = new THREE.MeshStandardMaterial({ color: pal.neige, roughness: 0.93, bumpMap: grain, bumpScale: 1.4 });
  const solGeo = new THREE.PlaneGeometry(240, 100, 120, 50);
  solGeo.rotateX(-Math.PI / 2);
  const p = solGeo.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const loin = THREE.MathUtils.smoothstep(Math.abs(z), 3.4, 12);
    const relief = Math.sin(x * 0.21 + z * 0.13) * 0.55 + Math.sin(x * 0.07 - z * 0.31) * 0.8 + Math.sin(x * 0.53) * 0.12;
    p.setY(i, relief * loin + (z < -18 ? (-18 - z) * 0.12 : 0));
  }
  solGeo.computeVertexNormals();
  const sol = new THREE.Mesh(solGeo, neige);
  sol.position.x = LONGUEUR / 2;
  sol.receiveShadow = true;
  groupe.add(sol);

  // Les deux couloirs de neige tassée.
  const grainPiste = texGrain(9);
  grainPiste.repeat.set(36, 3);
  const piste = new THREE.MeshStandardMaterial({ color: pal.piste, roughness: 0.82, bumpMap: grainPiste, bumpScale: 0.9 });
  for (const z of [AXE.hote, AXE.adversaire]) {
    const bande = new THREE.Mesh(new THREE.PlaneGeometry(LONGUEUR + 16, 2.5), piste);
    bande.rotation.x = -Math.PI / 2;
    bande.position.set(LONGUEUR / 2, 0.004, z);
    bande.receiveShadow = true;
    groupe.add(bande);
  }

  // Les congères qui les bordent, et des mottes de neige le long.
  for (const z of [2.95, 0, -2.95]) {
    const congere = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, LONGUEUR + 16, 16, 1), neige);
    congere.rotation.z = Math.PI / 2;
    congere.scale.set(1, 1, 0.62);
    congere.position.set(LONGUEUR / 2, 0.02, z);
    congere.castShadow = true;
    congere.receiveShadow = true;
    groupe.add(congere);
  }
  const mottes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), neige, 120);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < 120; i += 1) {
    const z = [2.95, 0, -2.95][i % 3] + (alea() - 0.5) * 0.3;
    const r = 0.12 + alea() * 0.18;
    v.set(-8 + alea() * (LONGUEUR + 16), 0.03, z);
    s.set(r * (1.2 + alea() * 0.8), r * 0.7, r);
    q.setFromEuler(new THREE.Euler(0, alea() * Math.PI, 0));
    mottes.setMatrixAt(i, m4.compose(v, q, s));
  }
  mottes.castShadow = true;
  mottes.receiveShadow = true;
  groupe.add(mottes);

  /* ------------------------------ Les sapins ------------------------------- */
  const places: { x: number; z: number; e: number }[] = [];
  for (let i = 0; i < 70; i += 1) {
    places.push({ x: -16 + alea() * (LONGUEUR + 34), z: -5 - alea() * 11, e: 0.8 + alea() * 0.9 });
  }
  for (let i = 0; i < 10; i += 1) {
    const gauche = i % 2 === 0;
    places.push({ x: gauche ? -12 + alea() * 7 : LONGUEUR + 4 + alea() * 8, z: 4.2 + alea() * 3, e: 0.9 + alea() * 0.6 });
  }
  const verts = new THREE.MeshStandardMaterial({ color: pal.sapin, roughness: 0.85, flatShading: true });
  const tronc = new THREE.MeshStandardMaterial({ color: pal.ecorce, roughness: 0.95 });
  const etages = [
    { r: 0.95, h: 1.15, y: 1.0 },
    { r: 0.74, h: 0.98, y: 1.62 },
    { r: 0.5, h: 0.82, y: 2.18 },
  ];
  const pieces: { geo: THREE.BufferGeometry; mat: THREE.Material; y: number }[] = [
    { geo: new THREE.CylinderGeometry(0.09, 0.13, 0.6, 8), mat: tronc, y: 0.3 },
  ];
  for (const e of etages) {
    pieces.push({ geo: new THREE.ConeGeometry(e.r, e.h, 9), mat: verts, y: e.y });
    pieces.push({ geo: new THREE.ConeGeometry(e.r * 0.82, e.h * 0.62, 9), mat: neige, y: e.y + e.h * 0.2 });
  }
  for (const pc of pieces) {
    const inst = new THREE.InstancedMesh(pc.geo, pc.mat, places.length);
    places.forEach((pl, i) => {
      v.set(pl.x, pc.y * pl.e, pl.z);
      s.setScalar(pl.e);
      q.setFromEuler(new THREE.Euler(0, (i * 1.7) % Math.PI, 0));
      inst.setMatrixAt(i, m4.compose(v, q, s));
    });
    inst.castShadow = true;
    groupe.add(inst);
  }

  /* ----------------------------- Les montagnes ----------------------------- */
  const roche = new THREE.MeshStandardMaterial({ color: pal.montagne, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i += 1) {
    const r = 9 + alea() * 9;
    const h = 8 + alea() * 9;
    const x = -24 + i * 9 + alea() * 5;
    const z = -34 - alea() * 14;
    const mont = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), roche);
    mont.position.set(x, h / 2 - 1, z);
    mont.rotation.y = alea() * Math.PI;
    groupe.add(mont);
    const coiffe = new THREE.Mesh(new THREE.ConeGeometry(r * 0.44, h * 0.44, 7), neige);
    coiffe.position.set(x, h - 1 - h * 0.22 + 0.05, z);
    coiffe.rotation.y = mont.rotation.y;
    groupe.add(coiffe);
  }

  /* ------------------------------ Le départ -------------------------------- */
  const ligne = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 5.7),
    new THREE.MeshStandardMaterial({ color: pal.rouge, roughness: 0.6 }),
  );
  ligne.rotation.x = -Math.PI / 2;
  ligne.position.set(0, 0.008, 0);
  groupe.add(ligne);

  /* ------------------------------ L'arrivée -------------------------------- */
  const damier = texDamier(pal.nuit, pal.neige);
  damier.wrapS = THREE.RepeatWrapping;
  damier.wrapT = THREE.RepeatWrapping;
  damier.repeat.set(1, 2.4);
  const bandeArrivee = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 5.7),
    new THREE.MeshStandardMaterial({ map: damier, roughness: 0.7 }),
  );
  bandeArrivee.rotation.x = -Math.PI / 2;
  bandeArrivee.position.set(LONGUEUR + 0.31, 0.009, 0);
  bandeArrivee.receiveShadow = true;
  groupe.add(bandeArrivee);

  const sucre = new THREE.MeshStandardMaterial({ map: texSucreDOrge(pal.rouge, pal.neige), roughness: 0.35 });
  const orMat = new THREE.MeshStandardMaterial({ color: pal.or, roughness: 0.25, metalness: 1 });
  const tissu = texDrapeau(pal.nuit, pal.neige);
  const drapeaux: ReturnType<typeof drapeau>[] = [];
  for (const z of [3.3, -3.3]) {
    const poteau = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.4, 20), sucre);
    poteau.position.set(LONGUEUR + 0.31, 1.2, z);
    poteau.castShadow = true;
    groupe.add(poteau);
    const boule = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), orMat);
    boule.position.set(LONGUEUR + 0.31, 2.45, z);
    boule.castShadow = true;
    groupe.add(boule);
    const d = drapeau(tissu);
    d.m.position.set(LONGUEUR + 0.36, 1.95, z);
    groupe.add(d.m);
    drapeaux.push(d);
  }

  // Le panneau « ARRIVÉE », au bord de la piste, face à la caméra.
  const panneauMat = new THREE.MeshStandardMaterial({ map: texBanniere(pal.nuit, pal.neige, police), roughness: 0.55 });
  const tranche = new THREE.MeshStandardMaterial({ color: pal.nuit, roughness: 0.6 });
  const panneau = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.575, 0.08), [tranche, tranche, tranche, tranche, panneauMat, tranche]);
  panneau.position.set(LONGUEUR + 0.3, 1.05, -3.45);
  panneau.castShadow = true;
  groupe.add(panneau);
  for (const dx of [-1.9, 1.9]) {
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.05, 16), sucre);
    pied.position.set(LONGUEUR + 0.3 + dx, 0.52, -3.49);
    pied.castShadow = true;
    groupe.add(pied);
  }

  /* --------------------------- La neige qui tombe -------------------------- */
  const N = 900;
  const flocons = new Float32Array(N * 3);
  const vitesses = new Float32Array(N);
  for (let i = 0; i < N; i += 1) {
    flocons[i * 3] = (alea() - 0.5) * 30;
    flocons[i * 3 + 1] = alea() * 9;
    flocons[i * 3 + 2] = -9 + alea() * 16;
    vitesses[i] = 0.35 + alea() * 0.7;
  }
  const flGeo = new THREE.BufferGeometry();
  flGeo.setAttribute('position', new THREE.BufferAttribute(flocons, 3));
  const neigeQuiTombe = new THREE.Points(
    flGeo,
    new THREE.PointsMaterial({ size: 0.075, map: texFlocon(), transparent: true, depthWrite: false, opacity: 0.95 }),
  );
  groupe.add(neigeQuiTombe);

  const ciel = texCiel(pal.cielHaut, pal.cielBas);

  function anime(t: number, dt: number, centre: number) {
    drapeaux[0].anime(t, 0);
    drapeaux[1].anime(t, 1.7);
    neigeQuiTombe.position.x = centre;
    const pos = flGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < N; i += 1) {
      pos[i * 3 + 1] -= vitesses[i] * dt;
      pos[i * 3] += Math.sin(t * 0.8 + i) * 0.12 * dt;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] += 9;
    }
    flGeo.attributes.position.needsUpdate = true;
  }

  return { groupe, ciel, anime };
}

/* ------------------------------ Les obstacles ------------------------------ */

export type GenreObstacle3D = 'rocher' | 'souche' | 'glace';

/** Une roche taillée : des facettes, et de la neige posée dessus. */
function roc(rayon: number, graine: number, applatir: number): THREE.BufferGeometry {
  const alea = hasard(graine);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(rayon, 1);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const k = 0.82 + alea() * 0.34;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * applatir, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export function creeObstacle(
  genre: GenreObstacle3D,
  graine: number,
  pal: Palette,
  textures: { ecorce: THREE.Texture; cernes: THREE.Texture },
): THREE.Group {
  const g = new THREE.Group();
  const neige = new THREE.MeshStandardMaterial({ color: pal.neige, roughness: 0.9 });

  if (genre === 'souche') {
    const ecorce = new THREE.MeshStandardMaterial({ map: textures.ecorce, roughness: 0.92 });
    const cernes = new THREE.MeshStandardMaterial({ map: textures.cernes, roughness: 0.8 });
    const tronc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.37, 0.42, 26, 1), [ecorce, cernes, ecorce]);
    tronc.position.y = 0.21;
    tronc.rotation.y = graine;
    tronc.castShadow = true;
    g.add(tronc);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + graine;
      const racine = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 8), ecorce);
      racine.position.set(Math.cos(a) * 0.36, 0.05, Math.sin(a) * 0.36);
      racine.rotation.set(0, -a, Math.PI / 2 - 0.35);
      racine.castShadow = true;
      g.add(racine);
    }
    // Un bonnet de neige posé de travers : les cernes restent visibles d'un côté.
    const coiffe = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), neige);
    coiffe.scale.set(1, 0.42, 1);
    coiffe.position.set(-0.05, 0.42, 0.03);
    coiffe.castShadow = true;
    g.add(coiffe);
  } else if (genre === 'rocher') {
    const pierre = new THREE.MeshStandardMaterial({ color: pal.roche, roughness: 0.88, flatShading: true });
    const bloc = new THREE.Mesh(roc(0.42, 11 + graine * 7, 0.78), pierre);
    bloc.position.y = 0.26;
    bloc.rotation.y = graine;
    bloc.castShadow = true;
    g.add(bloc);
    const neigePlate = new THREE.MeshStandardMaterial({ color: pal.neige, roughness: 0.9, flatShading: true });
    const coiffe = new THREE.Mesh(roc(0.33, 23 + graine * 5, 0.42), neigePlate);
    coiffe.position.y = 0.47;
    coiffe.castShadow = true;
    g.add(coiffe);
  } else {
    const glace = new THREE.MeshPhysicalMaterial({
      color: pal.glace,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      transparent: true,
      opacity: 0.88,
      envMapIntensity: 1.6,
    });
    const plaque = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.035, 48), glace);
    plaque.scale.set(0.78, 1, 0.58);
    plaque.position.y = 0.018;
    plaque.receiveShadow = true;
    g.add(plaque);
    const fente = new THREE.MeshBasicMaterial({ color: pal.neige, transparent: true, opacity: 0.55 });
    for (const [x, z, a, l] of [
      [-0.15, 0.05, 0.5, 0.42],
      [0.2, -0.08, -0.7, 0.3],
      [0.05, 0.15, 1.9, 0.22],
    ]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.012), fente);
      f.rotation.set(-Math.PI / 2, 0, a);
      f.position.set(x, 0.037, z);
      g.add(f);
    }
    const bord = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 48), neige);
    bord.rotation.x = Math.PI / 2;
    bord.scale.set(0.8, 0.6, 0.7);
    bord.position.y = 0.01;
    g.add(bord);
  }
  return g;
}
