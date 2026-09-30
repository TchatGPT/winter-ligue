import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AXE, creeDecor, creeObstacle, LONGUEUR, palette, type GenreObstacle3D } from './decor';
import { couleur, texCernes, texEcorce, texGrain, texOmbre } from './matieres';
import { creePereNoel, type EtatCoureur, type PereNoel3D } from './pereNoel';

/**
 * Le moteur de la course en trois dimensions.
 *
 * Il ne décide de rien : la course est écrite d'avance
 * (`lib/domain/course.ts`), et l'arène lui donne à chaque image l'avancée de
 * chaque camp, le tressaut sur un obstacle, et qui est tombé. Lui met en
 * scène : les pères Noël et leurs boules qui grossissent, la caméra qui suit
 * la course, la boule qui éclate à la chute, les confettis à l'arrivée, et le
 * nom de chaque joueur au-dessus de sa tête.
 *
 * Aucune dépendance à React : il se construit sur une toile, et se détruit
 * entièrement — géométries, matières, textures, contexte WebGL.
 */

export type Camp3D = 'hote' | 'adversaire';

export interface Donnees3D {
  bots: Record<Camp3D, boolean>;
  obstacles: Record<Camp3D, { position: number; genre: GenreObstacle3D }[]>;
  /** Ce qui fait tomber le perdant, et où ; null avant que la course soit écrite. */
  chute: { camp: Camp3D; type: 'rocher' | 'eclate' | 'glisse'; position: number } | null;
}

export interface Moteur3D {
  pose(camp: Camp3D, p: number, saut: number, tombe: boolean): void;
  etat(camp: Camp3D, etat: EtatCoureur): void;
  redimensionne(largeur: number, hauteur: number): void;
  detruit(): void;
}

export interface Options3D {
  /** Où afficher le nom d'un joueur, en pixels de la toile. */
  etiquette?: (camp: Camp3D, x: number, y: number, visible: boolean) => void;
  /** La police des inscriptions (le panneau d'arrivée). */
  police?: string;
}

/** La boule part petite et finit plus grosse que lui. */
const rayonBoule = (p: number) => 0.2 + 0.5 * p;

interface Coureur {
  camp: Camp3D;
  z: number;
  santa: PereNoel3D;
  boule: THREE.Mesh;
  ombreBoule: THREE.Mesh;
  ombrePied: THREE.Mesh;
  p: number;
  pAvant: number;
  saut: number;
  tombe: boolean;
  etat: EtatCoureur;
  depuis: number;
  roule: number;
  vitesse: number;
  x: number;
}

interface Eclat {
  m: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  vie: number;
  taille: number;
}

export function creeMoteur(toile: HTMLCanvasElement, donnees: Donnees3D, options: Options3D = {}): Moteur3D {
  const pal = palette();
  const renderer = new THREE.WebGLRenderer({ canvas: toile, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const decor = creeDecor(pal, options.police ?? 'sans-serif');
  scene.add(decor.groupe);
  scene.background = decor.ciel;
  scene.fog = new THREE.Fog(pal.cielBas, 18, 62);

  // Des reflets doux pour la glace, l'or et le cuir verni.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const piece = new RoomEnvironment();
  const environnement = pmrem.fromScene(piece, 0.04).texture;
  piece.dispose();
  scene.environment = environnement;
  scene.environmentIntensity = 0.45;

  /* ------------------------------ La lumière ------------------------------- */
  // Une fin de journée : un soleil chaud et rasant, le bleu du ciel dans les creux.
  scene.add(new THREE.HemisphereLight(pal.cielBas.clone().lerp(pal.nuit, 0.18), pal.neige, 0.62));
  const soleil = new THREE.DirectionalLight(couleur('--decor-soleil', '#ffd9ae'), 3.4);
  // L'ombre couvre ce que la caméra voit, pas plus : elle reste nette.
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  Object.assign(soleil.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 0.5, far: 45 });
  soleil.shadow.bias = -0.0003;
  soleil.shadow.normalBias = 0.025;
  soleil.shadow.radius = 3;
  scene.add(soleil, soleil.target);
  const contre = new THREE.DirectionalLight(pal.givre, 0.75);
  scene.add(contre, contre.target);

  /* ------------------------------ Les obstacles ---------------------------- */
  // La boule roule dessus et les écrase — sauf celui qui fait tomber le perdant.
  const textures = { ecorce: texEcorce(pal.ecorce), cernes: texCernes(pal.bois, pal.ecorce) };
  const obstacles: { camp: Camp3D; q: number; groupe: THREE.Group; ecrase: number; ecrasable: boolean }[] = [];
  (['hote', 'adversaire'] as Camp3D[]).forEach((camp, c) => {
    donnees.obstacles[camp].forEach((o, i) => {
      const g = creeObstacle(o.genre, i + 1 + c * 10, pal, textures);
      g.position.set(o.position * LONGUEUR, 0, AXE[camp]);
      scene.add(g);
      const fatal = donnees.chute !== null && donnees.chute.camp === camp && Math.abs(donnees.chute.position - o.position) < 1e-6;
      obstacles.push({ camp, q: o.position, groupe: g, ecrase: 0, ecrasable: o.genre !== 'glace' && !fatal });
    });
  });

  /* ------------------------------ Les coureurs ----------------------------- */
  const grainBoule = texGrain(5);
  grainBoule.repeat.set(3, 2);
  const neigeBoule = new THREE.MeshStandardMaterial({ color: pal.neige, roughness: 0.9, bumpMap: grainBoule, bumpScale: 2.2 });
  const ombreTex = texOmbre();
  const ombreMat = new THREE.MeshBasicMaterial({ map: ombreTex, transparent: true, depthWrite: false });
  const planOmbre = new THREE.PlaneGeometry(1, 1);
  planOmbre.rotateX(-Math.PI / 2);

  const tenue = (camp: Camp3D) => {
    const bot = donnees.bots[camp];
    return {
      manteau: bot
        ? couleur('--noel-acier', '#7f95ad')
        : camp === 'hote'
          ? couleur('--noel-rouge', '#d63a44')
          : couleur('--noel-vert', '#1f9a6c'),
      peau: bot ? couleur('--noel-acier-clair', '#c9d6e4') : couleur('--noel-peau', '#f3c9a5'),
      nez: bot ? couleur('--noel-acier', '#7f95ad') : couleur('--noel-nez', '#e58a7a'),
      fourrure: couleur('--noel-fourrure', '#f6fbff'),
      cuir: couleur('--noel-botte', '#17202e'),
      or: pal.or,
      robot: bot,
      yeux: pal.givre,
    };
  };

  const coureurs: Record<Camp3D, Coureur> = {} as Record<Camp3D, Coureur>;
  for (const camp of ['hote', 'adversaire'] as Camp3D[]) {
    const santa = creePereNoel(tenue(camp));
    scene.add(santa.racine);
    const boule = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), neigeBoule);
    boule.castShadow = true;
    scene.add(boule);
    const ombreBoule = new THREE.Mesh(planOmbre, ombreMat);
    const ombrePied = new THREE.Mesh(planOmbre, ombreMat);
    scene.add(ombreBoule, ombrePied);
    coureurs[camp] = {
      camp,
      z: AXE[camp],
      santa,
      boule,
      ombreBoule,
      ombrePied,
      p: 0,
      pAvant: 0,
      saut: 0,
      tombe: false,
      etat: 'depart',
      depuis: 0,
      roule: 0,
      vitesse: 0,
      x: 0,
    };
  }

  /* ------------------------------ Les éclats -------------------------------- */
  const eclats: Eclat[] = [];
  const geoEclat = new THREE.IcosahedronGeometry(1, 0);
  const matEclat = new THREE.MeshStandardMaterial({ color: pal.neige, roughness: 0.9, flatShading: true });
  const confettis: Eclat[] = [];
  const geoConfetti = new THREE.PlaneGeometry(0.07, 0.12);
  const matsConfetti = [pal.rouge, pal.or, pal.aurore, pal.givre, pal.neige].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, side: THREE.DoubleSide }),
  );

  function eclate(x: number, y: number, z: number, r: number, n: number, force: number) {
    for (let i = 0; i < n; i += 1) {
      const m = new THREE.Mesh(geoEclat, matEclat);
      const taille = r * (0.14 + Math.random() * 0.22);
      m.scale.setScalar(taille);
      m.position.set(x + (Math.random() - 0.5) * r, y + (Math.random() - 0.3) * r, z + (Math.random() - 0.5) * r);
      m.castShadow = true;
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      eclats.push({
        m,
        v: new THREE.Vector3(Math.cos(a) * force * (0.5 + Math.random()), force * (0.8 + Math.random() * 0.9), Math.sin(a) * force * 0.7),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        vie: 2.6 + Math.random(),
        taille,
      });
    }
  }

  function fete(x: number, z: number) {
    for (let i = 0; i < 120; i += 1) {
      const m = new THREE.Mesh(geoConfetti, matsConfetti[i % matsConfetti.length]);
      m.position.set(x + (Math.random() - 0.5) * 1.2, 2.2 + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.2);
      scene.add(m);
      confettis.push({
        m,
        v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        vie: 3.5 + Math.random() * 1.5,
        taille: 1,
      });
    }
  }

  /* ------------------------------ La caméra -------------------------------- */
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 220);
  let centre = 1.5;
  let recul = 1;
  const regard = new THREE.Vector3();
  const tete = new THREE.Vector3();
  const cible = new THREE.Vector3();
  const taille = { l: 1, h: 1 };

  function redimensionne(largeur: number, hauteur: number) {
    taille.l = Math.max(1, largeur);
    taille.h = Math.max(1, hauteur);
    renderer.setSize(taille.l, taille.h, false);
    camera.aspect = taille.l / taille.h;
    // Plus l'écran est étroit, plus la caméra recule, pour garder les deux couloirs.
    recul = THREE.MathUtils.clamp(Math.pow(2.1 / camera.aspect, 0.85), 1, 2.4);
    camera.updateProjectionMatrix();
  }
  redimensionne(toile.clientWidth || 800, toile.clientHeight || 360);

  /* ------------------------------ La boucle -------------------------------- */
  let avant = performance.now();
  let t = 0;
  let image = 0;
  let fini = false;

  function boucle(maintenant: number) {
    const dt = Math.min(0.05, (maintenant - avant) / 1000);
    avant = maintenant;
    t += dt;

    for (const c of Object.values(coureurs)) {
      c.depuis += dt;
      const r = rayonBoule(c.p);
      const bouleX = c.p * LONGUEUR - r;
      c.x = bouleX - r - 0.44;
      c.vitesse = THREE.MathUtils.lerp(c.vitesse, dt > 0 ? (c.p - c.pAvant) / dt : 0, 0.2);
      c.roule += ((c.p - c.pAvant) * LONGUEUR) / r;
      c.pAvant = c.p;

      c.santa.racine.position.set(c.x, 0, c.z);
      const hausse = c.saut * 0.32;
      c.boule.scale.setScalar(r);
      c.boule.position.set(bouleX, r + hausse, c.z);
      c.boule.rotation.z = -c.roule;
      c.ombreBoule.visible = c.boule.visible;
      c.ombreBoule.position.set(bouleX, 0.012, c.z);
      c.ombreBoule.scale.setScalar(r * (2.5 - c.saut * 0.6));
      c.ombrePied.position.set(c.x + (c.etat === 'chute' ? 0.5 : 0.05), 0.011, c.z);
      c.ombrePied.scale.set(c.etat === 'chute' ? 1.9 : 1.05, 1, c.etat === 'chute' ? 1.1 : 0.9);

      cible.set(bouleX - r * 0.78, r * 1.55 + hausse, c.z);
      c.santa.anime({
        t,
        dt,
        etat: c.etat,
        depuis: c.depuis,
        saut: c.saut,
        vitesse: c.vitesse,
        cible,
        chute: donnees.chute?.type === 'glisse' ? 'arriere' : 'avant',
      });
    }

    // Les obstacles que la boule a passés s'aplatissent dans la neige.
    for (const o of obstacles) {
      if (!o.ecrasable || o.ecrase >= 1) continue;
      const c = coureurs[o.camp];
      if (c.p < o.q + 0.024) continue;
      if (o.ecrase === 0) eclate(o.groupe.position.x, 0.35, o.groupe.position.z, 0.5, 7, 1.8);
      o.ecrase = Math.min(1, o.ecrase + dt / 0.22);
      const k = 1 - (1 - o.ecrase) * (1 - o.ecrase);
      o.groupe.scale.set(1 + 0.25 * k, 1 - 0.82 * k, 1 + 0.25 * k);
    }

    // Les éclats rebondissent, s'arrêtent, fondent.
    for (let i = eclats.length - 1; i >= 0; i -= 1) {
      const e = eclats[i];
      e.vie -= dt;
      e.v.y -= 9.8 * dt;
      e.m.position.addScaledVector(e.v, dt);
      if (e.m.position.y < e.taille) {
        e.m.position.y = e.taille;
        e.v.y *= -0.28;
        e.v.x *= 0.72;
        e.v.z *= 0.72;
        e.spin.multiplyScalar(0.8);
      }
      e.m.rotation.x += e.spin.x * dt;
      e.m.rotation.y += e.spin.y * dt;
      if (e.vie < 0.6) e.m.scale.setScalar(Math.max(0.001, e.taille * (e.vie / 0.6)));
      if (e.vie <= 0) {
        scene.remove(e.m);
        eclats.splice(i, 1);
      }
    }
    for (let i = confettis.length - 1; i >= 0; i -= 1) {
      const e = confettis[i];
      e.vie -= dt;
      e.v.y -= 3.2 * dt;
      e.v.multiplyScalar(1 - 0.9 * dt);
      e.m.position.addScaledVector(e.v, dt);
      e.m.position.x += Math.sin(t * 3 + i) * 0.4 * dt;
      e.m.rotation.x += e.spin.x * dt;
      e.m.rotation.y += e.spin.y * dt;
      if (e.m.position.y < 0.02) {
        e.m.position.y = 0.02;
        e.v.set(0, 0, 0);
        e.spin.set(0, 0, 0);
      }
      if (e.vie <= 0) {
        scene.remove(e.m);
        confettis.splice(i, 1);
      }
    }

    // La caméra suit la course : les deux coureurs, puis celui qui court encore.
    const a = coureurs.hote;
    const b = coureurs.adversaire;
    let vise: number;
    if (a.etat === 'chute' && b.etat !== 'chute') vise = b.x + 1.2;
    else if (b.etat === 'chute' && a.etat !== 'chute') vise = a.x + 1.2;
    else vise = (a.x + b.x) / 2 + 1.3;
    vise = THREE.MathUtils.clamp(vise, 1.8, LONGUEUR - 0.2);
    centre += (vise - centre) * (1 - Math.exp(-dt * 2.6));
    // De côté et d'assez haut pour que les deux couloirs se lisent l'un au-dessus
    // de l'autre, un peu en avant pour voir les visages.
    regard.set(centre + 0.2, 0.5, -0.1);
    camera.position.set(regard.x + 1.2, regard.y + 5.8 * recul, regard.z + 7.7 * recul);
    camera.lookAt(regard);

    soleil.position.set(centre - 11, 5.5, 5);
    soleil.target.position.set(centre, 0, 0);
    contre.position.set(centre + 8, 4, -10);
    contre.target.position.set(centre, 0.5, 0);

    decor.anime(t, dt, centre);
    renderer.render(scene, camera);

    // Les noms, au-dessus des bonnets.
    if (options.etiquette) {
      for (const c of Object.values(coureurs)) {
        c.santa.ancre.getWorldPosition(tete);
        tete.project(camera);
        const visible = tete.z < 1 && Math.abs(tete.x) < 1.2 && Math.abs(tete.y) < 1.2;
        options.etiquette(c.camp, (tete.x * 0.5 + 0.5) * taille.l, (-tete.y * 0.5 + 0.5) * taille.h, visible);
      }
    }

    if (!fini) image = requestAnimationFrame(boucle);
  }
  image = requestAnimationFrame(boucle);

  /* ------------------------------ Les commandes ---------------------------- */
  function pose(camp: Camp3D, p: number, saut: number, tombe: boolean) {
    const c = coureurs[camp];
    c.p = THREE.MathUtils.clamp(p, 0, 1);
    c.saut = tombe ? 0 : saut;
    c.tombe = tombe;
  }

  function etat(camp: Camp3D, nouveau: EtatCoureur) {
    const c = coureurs[camp];
    if (c.etat === nouveau) return;
    c.etat = nouveau;
    c.depuis = 0;
    if (nouveau === 'chute') {
      const r = rayonBoule(c.p);
      c.boule.visible = false;
      eclate(c.boule.position.x, c.boule.position.y, c.z, r, 16, 3.2);
    } else {
      c.boule.visible = true;
    }
    if (nouveau === 'victoire') fete(c.x + 0.8, c.z);
  }

  function detruit() {
    fini = true;
    cancelAnimationFrame(image);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const valeur of Object.values(mat)) if (valeur instanceof THREE.Texture) valeur.dispose();
        mat.dispose();
      }
    });
    decor.ciel.dispose();
    environnement.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { pose, etat, redimensionne, detruit };
}
