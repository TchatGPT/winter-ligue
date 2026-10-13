import * as THREE from 'three';

/**
 * La scène de l'accueil, en trois dimensions.
 *
 * Une nuit polaire : un ciel profond, des étoiles qui scintillent, trois
 * rideaux d'aurore boréale animés, une lune, des montagnes enneigées qui se
 * perdent dans la brume, et la neige qui tombe. Devant, les quatre boosters
 * flottent. Au chargement, la caméra descend du ciel ; les boosters montent
 * de la neige, l'un après l'autre.
 *
 * Un clic sur un booster l'amène au premier plan : ses cartes en jaillissent
 * en éventail, de vraies cartes — l'illustration peinte, le cadre de leur
 * rareté, leur nom. Survolée, une carte se soulève et penche vers le
 * pointeur. Un clic ailleurs les fait rentrer.
 *
 * Aucune dépendance à React : la scène se construit sur une toile, parle à la
 * page par des rappels, place elle-même les étiquettes des boosters, et se
 * détruit entièrement — géométries, matières, textures, contexte WebGL.
 */

export type Rarete3D = 'C' | 'R' | 'UR' | 'L';

export interface Carte3D {
  cardId: string;
  nom: string;
  sousTitre: string;
  rarete: Rarete3D;
  rareteLibelle: string;
  couleur: string;
  art: string | null;
  glyphe: string;
}

export interface Booster3D {
  id: string;
  nom: string;
  art: string | null;
  couleur: string;
  flanc: string;
  cartes: Carte3D[];
}

export interface Rappels3D {
  /** La scène est prête : l'interface peut apparaître. */
  pret(): void;
  survolBooster(id: string | null): void;
  choix(id: string | null): void;
  survolCarte(cardId: string | null): void;
}

export interface SceneAccueil {
  choisis(id: string | null): void;
  detruit(): void;
}

/* ------------------------------------------------------------------------ */
/*                                 Le bruit                                  */
/* ------------------------------------------------------------------------ */

function hache(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function bruit(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hache(xi, yi);
  const b = hache(xi + 1, yi);
  const c = hache(xi, yi + 1);
  const d = hache(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Des crêtes : le bruit replié sur lui-même, comme des arêtes de montagne. */
function cretes(x: number, y: number): number {
  let somme = 0;
  let amplitude = 0.5;
  let frequence = 1;
  for (let o = 0; o < 5; o += 1) {
    const r = 1 - Math.abs(bruit(x * frequence, y * frequence) * 2 - 1);
    somme += r * r * amplitude;
    amplitude *= 0.5;
    frequence *= 2.03;
  }
  return somme;
}

function fbm(x: number, y: number): number {
  let somme = 0;
  let amplitude = 0.5;
  let frequence = 1;
  for (let o = 0; o < 4; o += 1) {
    somme += bruit(x * frequence, y * frequence) * amplitude;
    amplitude *= 0.5;
    frequence *= 2.1;
  }
  return somme;
}

const lisse = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sortie = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/* ------------------------------------------------------------------------ */
/*                               Les shaders                                 */
/* ------------------------------------------------------------------------ */

const BRUIT_GLSL = /* glsl */ `
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

function matiereCiel(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 horizon = vec3(0.075, 0.14, 0.30);
        vec3 zenith = vec3(0.006, 0.012, 0.045);
        vec3 c = mix(horizon, zenith, smoothstep(-0.04, 0.55, y));
        // Une lueur d'aurore, basse sur l'horizon.
        c += vec3(0.04, 0.22, 0.17) * exp(-abs(y - 0.1) * 9.0) * 0.55;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function matiereAurore(c1: string, c2: string, c3: string, force: number, decalage: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTemps: { value: 0 },
      uC1: { value: new THREE.Color(c1) },
      uC2: { value: new THREE.Color(c2) },
      uC3: { value: new THREE.Color(c3) },
      uForce: { value: force },
      uDecalage: { value: decalage },
    },
    vertexShader: /* glsl */ `
      uniform float uTemps;
      uniform float uDecalage;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.x * 0.025 + uTemps * 0.12 + uDecalage) * 9.0;
        p.y += sin(p.x * 0.04 + uTemps * 0.22 + uDecalage) * 2.5 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTemps;
      uniform vec3 uC1, uC2, uC3;
      uniform float uForce;
      uniform float uDecalage;
      varying vec2 vUv;
      ${BRUIT_GLSL}
      void main() {
        float x = vUv.x + uDecalage;
        float y = vUv.y;
        float t = uTemps;
        // Les rideaux : des raies verticales qui ondulent et glissent.
        float tord = n(vec2(x * 3.0, t * 0.07)) * 5.0;
        float rideaux = n(vec2(x * 46.0 + tord, t * 0.18));
        rideaux = pow(rideaux, 2.0);
        float voile = n(vec2(x * 5.0 - t * 0.025, 0.5 + uDecalage));
        float bas = smoothstep(0.0, 0.1, y);
        float haut = pow(1.0 - y, 1.7);
        float a = bas * haut * (0.25 + 0.75 * rideaux) * (0.25 + 0.75 * voile);
        // Le bord bas, plus vif : c'est lui qui dessine l'aurore.
        a += bas * (1.0 - smoothstep(0.02, 0.2, y)) * 0.7 * rideaux * voile;
        // Les extrémités du rideau s'éteignent.
        a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        vec3 c = mix(uC1, uC2, smoothstep(0.08, 0.5, y));
        c = mix(c, uC3, smoothstep(0.5, 1.0, y));
        gl_FragColor = vec4(c * a * uForce, a);
      }`,
  });
}

/* ------------------------------------------------------------------------ */
/*                                 Utilitaires                               */
/* ------------------------------------------------------------------------ */

function chargeImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resoudre) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resoudre(img);
    img.onerror = () => resoudre(null);
    img.src = src;
  });
}

/** Une texture de halo : un disque blanc qui s'efface. */
function texHalo(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function arrondi(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + l, y, x + l, y + h, r);
  ctx.arcTo(x + l, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + l, y, r);
  ctx.closePath();
}

/** La police d'affichage du site, résolue (next/font la nomme à sa façon). */
function policeAffichage(): string {
  const sonde = document.createElement('span');
  sonde.style.fontFamily = 'var(--font-display)';
  document.body.appendChild(sonde);
  const famille = getComputedStyle(sonde).fontFamily || 'sans-serif';
  sonde.remove();
  return famille;
}

/**
 * Une carte, peinte sur une toile : l'illustration dans sa fenêtre, le cadre
 * de sa rareté par-dessus, le médaillon, le nom et l'intitulé. Les mesures
 * sont celles du cadre du site (`.cadre-fenetre`, `.cadre-texte`).
 */
async function texCarte(c: Carte3D, police: string, anisotropie: number): Promise<THREE.CanvasTexture> {
  const L = 512;
  const H = Math.round((L * 2231) / 1514);
  const toile = document.createElement('canvas');
  toile.width = L;
  toile.height = H;
  const ctx = toile.getContext('2d')!;
  const [art, cadre] = await Promise.all([c.art ? chargeImage(c.art) : null, chargeImage(`/cadres/glace-${c.rarete}.webp`)]);

  const fx = L * 0.0713;
  const fy = H * 0.043;
  const fl = L * 0.858;
  const fh = H * 0.6921;
  ctx.save();
  arrondi(ctx, fx, fy, fl, fh, L * 0.03);
  ctx.clip();
  const fond = ctx.createLinearGradient(0, fy, 0, fy + fh);
  fond.addColorStop(0, '#0b1a33');
  fond.addColorStop(1, '#050b18');
  ctx.fillStyle = fond;
  ctx.fillRect(fx, fy, fl, fh);
  if (art) {
    // Couvrir la fenêtre, comme object-fit: cover.
    const echelle = Math.max(fl / art.width, fh / art.height);
    const al = art.width * echelle;
    const ah = art.height * echelle;
    ctx.drawImage(art, fx + (fl - al) / 2, fy + (fh - ah) / 2, al, ah);
  } else {
    ctx.font = `${Math.round(L * 0.26)}px system-ui, "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.glyphe, fx + fl / 2, fy + fh / 2);
  }
  ctx.restore();
  if (cadre) ctx.drawImage(cadre, 0, 0, L, H);

  // Le médaillon de rareté, à cheval sur la jointure.
  ctx.font = `900 ${Math.round(L * 0.036)}px ${police}`;
  const libelle = c.rareteLibelle.toUpperCase();
  const lt = ctx.measureText(libelle).width + L * 0.09;
  const my = H * 0.735;
  arrondi(ctx, L / 2 - lt / 2, my - L * 0.032, lt, L * 0.064, L * 0.032);
  ctx.fillStyle = '#0d1424';
  ctx.fill();
  ctx.lineWidth = L * 0.005;
  ctx.strokeStyle = c.couleur;
  ctx.stroke();
  ctx.fillStyle = '#eef4ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(libelle, L / 2, my + 1);

  // Le nom et l'intitulé, dans le panneau clair.
  const py = H * 0.77;
  const ph = H * 0.158;
  let taille = L * 0.082;
  ctx.font = `900 ${Math.round(taille)}px ${police}`;
  while (ctx.measureText(c.nom).width > L * 0.74 && taille > L * 0.05) {
    taille -= 2;
    ctx.font = `900 ${Math.round(taille)}px ${police}`;
  }
  ctx.fillStyle = '#16181f';
  ctx.fillText(c.nom, L / 2, py + ph * 0.38);
  ctx.font = `800 ${Math.round(L * 0.036)}px ${police}`;
  ctx.fillStyle = '#3a4258';
  ctx.fillText(c.sousTitre.toUpperCase(), L / 2, py + ph * 0.74);

  const t = new THREE.CanvasTexture(toile);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie;
  return t;
}

/* ------------------------------------------------------------------------ */
/*                                  La scène                                 */
/* ------------------------------------------------------------------------ */

const LARGEUR_BOOSTER = 1.25;
const HAUTEUR_BOOSTER = LARGEUR_BOOSTER * 1.865;
const LARGEUR_CARTE = 1.0;
const HAUTEUR_CARTE = LARGEUR_CARTE * 1.4736;
const FOV = 38;

interface EtatBooster {
  def: Booster3D;
  groupe: THREE.Group;
  corps: THREE.Mesh;
  halo: THREE.Sprite;
  base: THREE.Vector3;
  echelleBase: number;
  pos: THREE.Vector3;
  echelle: number;
  survol: number;
  apparition: number;
}

interface EtatCarte {
  def: Carte3D;
  /** Son rang dans l'éventail : de gauche à droite, chacune devant la précédente. */
  rang: number;
  maille: THREE.Mesh;
  pivot: THREE.Group;
  angle: number;
  sortie: number;
  survol: number;
  incl: THREE.Vector2;
}

export function creeSceneAccueil(
  toile: HTMLCanvasElement,
  boosters: Booster3D[],
  rappels: Rappels3D,
  etiquettes: () => Map<string, HTMLElement>,
): SceneAccueil {
  const mobile = window.innerWidth < 700;
  const rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true, powerPreference: 'high-performance' });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  rendu.outputColorSpace = THREE.SRGBColorSpace;
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 1.05;
  const anisotropie = Math.min(8, rendu.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c1a38, 0.0115);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 900);

  const aDetruire: { dispose(): void }[] = [];
  const garde = <T extends { dispose(): void }>(x: T) => {
    aDetruire.push(x);
    return x;
  };

  /* -------------------------------- Le ciel ------------------------------- */
  const ciel = new THREE.Mesh(garde(new THREE.SphereGeometry(600, 32, 16)), garde(matiereCiel()));
  scene.add(ciel);

  // Les étoiles, sur la voûte, qui scintillent chacune à son rythme.
  let etoilesMat: THREE.ShaderMaterial;
  {
    const n = mobile ? 1400 : 2600;
    const pos = new Float32Array(n * 3);
    const taille = new Float32Array(n);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const u = Math.random() * Math.PI * 2;
      const y = 0.04 + Math.pow(Math.random(), 0.7) * 0.96;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(u) * r * 520, y * 520, Math.sin(u) * r * 520], i * 3);
      taille[i] = 0.6 + Math.pow(Math.random(), 4) * 2.6;
      phase[i] = Math.random() * 6.28;
    }
    const g = garde(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aTaille', new THREE.BufferAttribute(taille, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const m = (etoilesMat = garde(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        uniforms: { uTemps: { value: 0 }, uDpr: { value: rendu.getPixelRatio() } },
        vertexShader: /* glsl */ `
          attribute float aTaille; attribute float aPhase;
          uniform float uTemps; uniform float uDpr;
          varying float vA;
          void main() {
            vA = 0.55 + 0.45 * sin(uTemps * (1.2 + aPhase * 0.3) + aPhase);
            gl_PointSize = aTaille * uDpr;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), smoothstep(0.5, 0.0, d) * vA);
          }`,
      }),
    ));
    scene.add(new THREE.Points(g, m));
  }

  // La lune, et son halo.
  const tHalo = garde(texHalo());
  {
    const lune = new THREE.Sprite(garde(new THREE.SpriteMaterial({ map: tHalo, color: 0xf2f6ff, fog: false, depthWrite: false })));
    lune.position.set(-150, 150, -420);
    lune.scale.setScalar(26);
    scene.add(lune);
    const voile = new THREE.Sprite(
      garde(
        new THREE.SpriteMaterial({
          map: tHalo,
          color: 0x7fa6ff,
          fog: false,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    voile.position.copy(lune.position);
    voile.scale.setScalar(140);
    scene.add(voile);
  }

  // Les rideaux d'aurore.
  const aurores: THREE.ShaderMaterial[] = [];
  for (const [y, z, l, h, rot, c1, c2, c3, force, dec] of [
    [26, -300, 760, 150, 0.04, '#2bffb2', '#1fd6c8', '#8a5cff', 2.4, 0],
    [40, -370, 820, 170, -0.08, '#3dffa8', '#7a6bff', '#ff5ec4', 1.5, 3.7],
    [20, -250, 520, 110, 0.12, '#25e0d2', '#3fa6ff', '#9b6bff', 1.3, 7.1],
  ] as const) {
    const m = garde(matiereAurore(c1, c2, c3, force, dec));
    aurores.push(m);
    const ruban = new THREE.Mesh(garde(new THREE.PlaneGeometry(l, h, 220, 1)), m);
    ruban.position.set(0, y + h / 2, z);
    ruban.rotation.y = rot;
    ruban.rotation.x = 0.18;
    scene.add(ruban);
  }

  /* ------------------------------ Le relief ------------------------------- */
  {
    const segX = mobile ? 140 : 220;
    const segZ = mobile ? 90 : 150;
    const g = garde(new THREE.PlaneGeometry(520, 360, segX, segZ));
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -150);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const z = p.getZ(i);
      // Devant, un champ de neige en douces congères ; au loin, les montagnes.
      let y = fbm(x * 0.035, z * 0.035) * 1.6;
      const loin = lisse(-30, -120, z);
      y += loin * cretes(x * 0.012 + 3.1, z * 0.012) * 38;
      y += lisse(-120, -230, z) * cretes(x * 0.008, z * 0.008 + 7) * 34;
      // Un col au centre, dans l'axe : les sommets encadrent la vue.
      y *= 1 - 0.45 * Math.exp(-(x * x) / 2200) * loin;
      p.setY(i, y - 3.2);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    const couleurs = new Float32Array(p.count * 3);
    const neige = new THREE.Color('#a9bee4');
    const roche = new THREE.Color('#141c33');
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 1) {
      c.copy(roche).lerp(neige, lisse(0.62, 0.86, n.getY(i)));
      couleurs.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
    const sol = new THREE.Mesh(
      g,
      garde(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true })),
    );
    scene.add(sol);
  }

  /* ------------------------------ La lumière ------------------------------ */
  scene.add(new THREE.HemisphereLight(0x7d9cff, 0x0a1022, 0.75));
  const clairDeLune = new THREE.DirectionalLight(0xc6d8ff, 1.5);
  clairDeLune.position.set(-40, 60, -30);
  scene.add(clairDeLune);
  const reflet = new THREE.DirectionalLight(0x47ffc0, 0.55);
  reflet.position.set(30, 25, -60);
  scene.add(reflet);
  const face = new THREE.DirectionalLight(0xdfe9ff, 0.35);
  face.position.set(0, 3, 12);
  scene.add(face);

  /* ------------------------------- La neige ------------------------------- */
  const neigeMat = garde(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTemps: { value: 0 }, uDpr: { value: rendu.getPixelRatio() }, uHauteur: { value: 22 } },
      vertexShader: /* glsl */ `
        attribute float aVitesse; attribute float aTaille; attribute float aPhase;
        uniform float uTemps; uniform float uDpr; uniform float uHauteur;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTemps * aVitesse, uHauteur) - 4.0;
          p.x += sin(uTemps * 0.55 + aPhase) * 0.45 + uTemps * 0.22 * aVitesse;
          p.x = mod(p.x + 36.0, 72.0) - 36.0;
          p.z += cos(uTemps * 0.4 + aPhase) * 0.35;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aTaille * uDpr * (210.0 / -mv.z);
          vA = smoothstep(70.0, 14.0, -mv.z) * smoothstep(0.4, 2.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.93, 0.96, 1.0), smoothstep(0.5, 0.05, d) * vA * 0.85);
        }`,
    }),
  );
  {
    const n = mobile ? 1600 : 3600;
    const pos = new Float32Array(n * 3);
    const vit = new Float32Array(n);
    const tai = new Float32Array(n);
    const pha = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      pos.set([(Math.random() - 0.5) * 72, Math.random() * 22, -50 + Math.random() * 60], i * 3);
      vit[i] = 0.5 + Math.random() * 0.9;
      tai[i] = 0.45 + Math.pow(Math.random(), 4) * 1.7;
      pha[i] = Math.random() * 6.28;
    }
    const g = garde(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVitesse', new THREE.BufferAttribute(vit, 1));
    g.setAttribute('aTaille', new THREE.BufferAttribute(tai, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(pha, 1));
    const flocons = new THREE.Points(g, neigeMat);
    flocons.frustumCulled = false;
    scene.add(flocons);
  }

  /* ------------------------------ Les boosters ----------------------------- */
  const chargeur = new THREE.TextureLoader();
  const etats: EtatBooster[] = boosters.map((def, i) => {
    const groupe = new THREE.Group();
    const flanc = new THREE.MeshStandardMaterial({ color: def.flanc });
    const faceMat = garde(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.15,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
      }),
    );
    if (def.art) {
      const t = chargeur.load(def.art, () => {
        faceMat.needsUpdate = true;
      });
      garde(t);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropie;
      faceMat.map = t;
      faceMat.emissiveMap = t;
    } else {
      faceMat.color.set(def.flanc);
    }
    // Le sachet est une image découpée (ses bords sont dentelés) : une seule
    // face, visible des deux côtés.
    flanc.dispose();
    const corps = new THREE.Mesh(garde(new THREE.PlaneGeometry(LARGEUR_BOOSTER, HAUTEUR_BOOSTER)), faceMat);
    corps.userData.booster = def.id;
    groupe.add(corps);
    const halo = new THREE.Sprite(
      garde(
        new THREE.SpriteMaterial({
          map: tHalo,
          color: def.couleur,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    );
    halo.position.z = -0.2;
    halo.scale.set(LARGEUR_BOOSTER * 3.4, HAUTEUR_BOOSTER * 2, 1);
    groupe.add(halo);
    scene.add(groupe);
    return {
      def,
      groupe,
      corps,
      halo,
      base: new THREE.Vector3(),
      echelleBase: 1,
      pos: new THREE.Vector3(0, -8, 0),
      echelle: 1,
      survol: 0,
      apparition: i,
    };
  });

  /* ------------------------------- Les cartes ------------------------------ */
  const police = policeAffichage();
  const eventail = new THREE.Group();
  scene.add(eventail);
  let cartes: EtatCarte[] = [];
  let choisi: string | null = null;
  let jeton = 0;

  async function poseCartes(def: Booster3D) {
    const moi = ++jeton;
    retireCartes();
    try {
      await document.fonts.load(`900 40px ${police}`);
    } catch {
      // Sans la police, la carte s'écrit dans celle de repli.
    }
    const textures = await Promise.all(def.cartes.map((c) => texCarte(c, police, anisotropie)));
    if (moi !== jeton) {
      textures.forEach((t) => t.dispose());
      return;
    }
    const n = def.cartes.length;
    const pas = Math.min(0.17, 1.4 / Math.max(1, n));
    const geo = new THREE.PlaneGeometry(LARGEUR_CARTE, HAUTEUR_CARTE);
    cartes = def.cartes.map((c, k) => {
      const pivot = new THREE.Group();
      const maille = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: textures[k], transparent: true, alphaTest: 0.04, toneMapped: false }),
      );
      maille.userData.carte = c.cardId;
      pivot.add(maille);
      eventail.add(pivot);
      return {
        def: c,
        rang: k,
        maille,
        pivot,
        angle: (k - (n - 1) / 2) * pas,
        sortie: -k * 0.05,
        survol: 0,
        incl: new THREE.Vector2(),
      };
    });
  }

  function retireCartes() {
    for (const c of cartes) {
      eventail.remove(c.pivot);
      const m = c.maille.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
    }
    if (cartes[0]) cartes[0].maille.geometry.dispose();
    cartes = [];
  }

  /* ------------------------------- La mise en place ------------------------ */
  let aspect = 1;
  const cibleCamera = new THREE.Vector3();
  const cibleVise = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 16, 30);
  const camVise = new THREE.Vector3(0, 22, -120);

  /** Où sont les boosters, et d'où les regarde-t-on, selon la forme de l'écran. */
  function disposition() {
    const l = toile.clientWidth || window.innerWidth;
    const h = toile.clientHeight || window.innerHeight;
    rendu.setSize(l, h, false);
    aspect = l / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    // Une seule rangée, partout : plus serrée sur un écran en hauteur.
    const ecart = aspect >= 0.95 ? 2.4 : 1.42;
    etats.forEach((e, i) => {
      e.base.set((i - (etats.length - 1) / 2) * ecart, 0, 0);
      e.echelleBase = 1;
    });
    const etendue = ecart * (etats.length - 1) + LARGEUR_BOOSTER;
    const d = Math.max(12, (etendue * (aspect >= 0.95 ? 1.3 : 1.1)) / (2 * tan * aspect));
    // Les boosters dans le bas de l'écran, sous le titre.
    cibleVise.set(0, (aspect >= 0.95 ? 0.37 : 0.42) * d * tan, 0);
    cibleCamera.set(0, cibleVise.y + 0.6, d);
  }

  /** Le cadrage d'un booster ouvert et de son éventail. */
  function cadrageChoisi(n: number) {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const pas = Math.min(0.17, 1.4 / Math.max(1, n));
    const amax = ((n - 1) / 2) * pas;
    const rayon = 2.25 + HAUTEUR_CARTE * 0.45;
    const largeur = 2 * (rayon * Math.sin(amax) + LARGEUR_CARTE * 0.62);
    // Le booster ouvert est grossi de 1,12 et posé 0,2 plus bas.
    const haut = -0.2 + (0.9 - 2.25 + rayon + HAUTEUR_CARTE * 0.65 + 0.35) * 1.12;
    const bas = -0.2 - (HAUTEUR_BOOSTER / 2) * 1.12;
    const hauteur = haut - bas;
    // La légende occupe le bas de l'écran : le cadrage se tient au-dessus.
    const d = Math.max((largeur * 1.12 * 1.2) / (2 * tan * aspect), (hauteur * 1.55) / (2 * tan), 7);
    const centre = (haut + bas) / 2;
    // En portrait, la légende pèse moins : l'éventail se centre.
    cibleVise.set(0, centre - (aspect >= 0.95 ? 0.2 : 0.06) * d * tan, 0);
    cibleCamera.set(0, cibleVise.y + 0.35, d);
  }

  /* ------------------------------- Le pointeur ----------------------------- */
  const pointeur = new THREE.Vector2(0, 0);
  const pointeurLisse = new THREE.Vector2(0, 0);
  const rayon = new THREE.Raycaster();
  let survolBooster: string | null = null;
  let survolCarte: string | null = null;
  let pointeurBouge = false;
  let dansLaPage = false;

  const surInteractif = (cible: EventTarget | null) =>
    cible instanceof Element && Boolean(cible.closest('a, button, input, select, textarea, [data-pas-3d]'));

  // Rapporté à la toile, pas à la fenêtre : sur un téléphone, les deux diffèrent.
  const ndc = (x: number, y: number) => {
    const r = toile.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  };

  function vise(point: THREE.Vector2): { booster: string | null; carte: string | null; uv: THREE.Vector2 | null } {
    rayon.setFromCamera(point, camera);
    if (choisi) {
      const touche = rayon.intersectObjects(
        cartes.map((c) => c.maille),
        false,
      )[0];
      if (touche) return { booster: null, carte: touche.object.userData.carte as string, uv: touche.uv ?? null };
    }
    const visibles = etats.filter((e) => !choisi || e.def.id === choisi).map((e) => e.corps);
    const touche = rayon.intersectObjects(visibles, false)[0];
    return { booster: touche ? (touche.object.userData.booster as string) : null, carte: null, uv: null };
  }

  let uvSurvol: THREE.Vector2 | null = null;
  const bouge = (e: PointerEvent) => {
    pointeur.copy(ndc(e.clientX, e.clientY));
    pointeurBouge = true;
    dansLaPage = !surInteractif(e.target) && window.scrollY < window.innerHeight * 0.7;
  };
  const clic = (e: MouseEvent) => {
    if (surInteractif(e.target) || window.scrollY > window.innerHeight * 0.7) return;
    const v = vise(ndc(e.clientX, e.clientY));
    if (v.booster) {
      if (v.booster !== choisi) choisis(v.booster);
      return;
    }
    if (v.carte) {
      // Au doigt, pas de survol : toucher une carte la lit.
      if (v.carte !== survolCarte) {
        survolCarte = v.carte;
        rappels.survolCarte(v.carte);
      }
      return;
    }
    if (choisi) choisis(null);
  };
  window.addEventListener('pointermove', bouge, { passive: true });
  window.addEventListener('click', clic);

  /* --------------------------------- Le choix ------------------------------ */
  function choisis(id: string | null) {
    if (id === choisi) return;
    choisi = id;
    const def = etats.find((e) => e.def.id === id)?.def ?? null;
    if (def) {
      void poseCartes(def);
      cadrageChoisi(def.cartes.length);
    } else {
      jeton += 1;
      for (const c of cartes) c.sortie = Math.min(c.sortie, 1);
      disposition();
    }
    if (survolCarte) {
      survolCarte = null;
      rappels.survolCarte(null);
    }
    rappels.choix(id);
  }

  /* -------------------------------- L'animation ---------------------------- */
  disposition();
  const auRedimensionnement = () => {
    disposition();
    if (choisi) cadrageChoisi(etats.find((e) => e.def.id === choisi)?.def.cartes.length ?? 0);
  };
  window.addEventListener('resize', auRedimensionnement);

  const horloge = new THREE.Clock();
  let temps = 0;
  let intro = 0;
  let image = 0;
  let pretSignale = false;
  const tmp = new THREE.Vector3();
  const vise3 = new THREE.Vector3();

  function anime() {
    image = requestAnimationFrame(anime);
    if (document.hidden) return;
    const dt = Math.min(0.05, horloge.getDelta());
    temps += dt;
    intro = Math.min(1, intro + dt / 3.6);
    const k = (v: number) => 1 - Math.exp(-dt * v);

    for (const m of aurores) m.uniforms.uTemps.value = temps;
    neigeMat.uniforms.uTemps.value = temps;
    etoilesMat.uniforms.uTemps.value = temps;

    // Le survol : un rayon par image, seulement si le pointeur a bougé.
    if (pointeurBouge) {
      pointeurBouge = false;
      const v = dansLaPage && intro > 0.75 ? vise(pointeur) : { booster: null, carte: null, uv: null };
      if (v.booster !== survolBooster) {
        survolBooster = v.booster;
        rappels.survolBooster(survolBooster);
      }
      if (v.carte !== survolCarte) {
        survolCarte = v.carte;
        rappels.survolCarte(survolCarte);
      }
      uvSurvol = v.uv;
      document.body.style.cursor = v.booster && v.booster !== choisi ? 'pointer' : '';
    }
    pointeurLisse.lerp(pointeur, k(3));

    // Les boosters : ils montent de la neige, flottent, se soulèvent au survol.
    etats.forEach((e, i) => {
      const montee = sortie((intro * 3.6 - 1.1 - i * 0.18) / 1.3);
      const estChoisi = e.def.id === choisi;
      const cache = choisi !== null && !estChoisi;
      const flotte = Math.sin(temps * 0.9 + i * 1.7) * 0.09;
      e.survol += ((survolBooster === e.def.id && !estChoisi ? 1 : 0) - e.survol) * k(10);
      if (estChoisi) tmp.set(0, -0.2, 0.6);
      else tmp.copy(e.base).add(new THREE.Vector3(0, flotte + e.survol * 0.18, 0));
      if (cache) tmp.y -= 7;
      tmp.y -= (1 - montee) * 7;
      e.pos.lerp(tmp, k(estChoisi || cache ? 4.5 : 9));
      e.groupe.position.copy(e.pos);
      const echelle = (estChoisi ? 1.12 : e.echelleBase) * (1 + e.survol * 0.06);
      e.echelle += (echelle - e.echelle) * k(8);
      e.groupe.scale.setScalar(e.echelle);
      e.groupe.rotation.y = estChoisi
        ? Math.sin(temps * 0.6) * 0.06 + pointeurLisse.x * 0.12
        : -e.pos.x * 0.05 + Math.sin(temps * 0.5 + i) * 0.08 + pointeurLisse.x * 0.1;
      e.groupe.rotation.z = Math.sin(temps * 0.7 + i * 2.3) * 0.025;
      e.groupe.rotation.x = -pointeurLisse.y * 0.06;
      (e.halo.material as THREE.SpriteMaterial).opacity = (0.22 + e.survol * 0.55 + (estChoisi ? 0.35 : 0)) * montee;
    });

    // L'éventail : il naît en haut du booster ouvert, les cartes en sortent l'une après l'autre.
    const ouvert = etats.find((e) => e.def.id === choisi);
    if (ouvert) eventail.position.set(ouvert.pos.x, ouvert.pos.y + 1.02 * ouvert.echelle, ouvert.pos.z - 0.09);
    eventail.scale.setScalar(ouvert ? ouvert.echelle / 1.12 : 1);
    const ferme = choisi === null;
    cartes = cartes.filter((c) => {
      c.sortie += dt * (ferme ? -2.6 : 1.5);
      if (ferme && c.sortie <= 0) {
        eventail.remove(c.pivot);
        (c.maille.material as THREE.MeshBasicMaterial).map?.dispose();
        (c.maille.material as THREE.MeshBasicMaterial).dispose();
        return false;
      }
      const s = sortie(Math.min(1, Math.max(0, c.sortie)));
      const estSurvol = survolCarte === c.def.cardId;
      c.survol += ((estSurvol ? 1 : 0) - c.survol) * k(12);
      // Le pivot, loin sous la carte : les cartes se rangent en arc.
      const descente = 2.25;
      const longueur = descente + HAUTEUR_CARTE * 0.45 + c.survol * 0.35;
      const a = c.angle * s;
      c.pivot.position.set(
        Math.sin(a) * longueur * s,
        -descente + Math.cos(a) * longueur * s - (1 - s) * 0.4,
        // Derrière le booster ; la survolée passe devant tout.
        -0.12 + c.rang * 0.006 + c.survol * 0.5,
      );
      c.pivot.rotation.z = -a;
      // Survolée, elle penche vers le pointeur.
      const cibleX = estSurvol && uvSurvol ? (uvSurvol.y - 0.5) * -0.5 : 0;
      const cibleY = estSurvol && uvSurvol ? (uvSurvol.x - 0.5) * 0.6 : 0;
      c.incl.x += (cibleX - c.incl.x) * k(10);
      c.incl.y += (cibleY - c.incl.y) * k(10);
      c.maille.rotation.set(c.incl.x, c.incl.y, 0);
      c.maille.scale.setScalar((0.55 + 0.45 * s) * (1 + c.survol * 0.1));
      c.maille.renderOrder = estSurvol ? 10 : 0;
      (c.maille.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s * 1.6);
      return true;
    });

    // La caméra : la descente du ciel, puis la parallaxe et le défilement.
    const e = sortie(intro);
    const defile = Math.min(1.4, window.scrollY / Math.max(1, window.innerHeight));
    vise3.copy(cibleCamera);
    vise3.x += pointeurLisse.x * 0.45;
    // En descendant la page, la caméra lève les yeux vers l'aurore : le ciel
    // sombre derrière le texte, plutôt que la neige claire.
    vise3.y += pointeurLisse.y * 0.25 + defile * 1.2;
    tmp.copy(cibleVise);
    tmp.y += defile * 4.5;
    camPos.lerp(new THREE.Vector3(0, 16, 30).lerp(vise3, e), intro < 1 ? 1 : k(3.2));
    camVise.lerp(new THREE.Vector3(0, 22, -120).lerp(tmp, e), intro < 1 ? 1 : k(3.2));
    camera.position.copy(camPos);
    camera.lookAt(camVise);

    // Les étiquettes des boosters, sous chacun, à l'écran.
    const tags = etiquettes();
    const l = toile.clientWidth;
    const h = toile.clientHeight;
    etats.forEach((s) => {
      const tag = tags.get(s.def.id);
      if (!tag) return;
      tmp.copy(s.pos);
      tmp.y -= (HAUTEUR_BOOSTER / 2) * s.echelle + 0.18;
      tmp.project(camera);
      const visible = choisi === null && intro > 0.82 && tmp.z < 1;
      tag.style.transform = `translate(${((tmp.x + 1) / 2) * l}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, 0)`;
      tag.style.opacity = visible ? String(Math.min(1, (intro - 0.82) * 6)) : '0';
      tag.dataset.survol = survolBooster === s.def.id ? '1' : '';
    });

    rendu.render(scene, camera);
    if (!pretSignale) {
      pretSignale = true;
      rappels.pret();
    }
  }
  anime();

  return {
    choisis,
    detruit() {
      cancelAnimationFrame(image);
      window.removeEventListener('pointermove', bouge);
      window.removeEventListener('click', clic);
      window.removeEventListener('resize', auRedimensionnement);
      document.body.style.cursor = '';
      jeton += 1;
      retireCartes();
      for (const x of aDetruire) x.dispose();
      rendu.dispose();
      rendu.forceContextLoss();
    },
  };
}
