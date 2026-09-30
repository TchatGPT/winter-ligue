/**
 * La neige : des milliers de flocons texturés qui tombent, tournent et
 * dérivent dans un vent que la souris pousse d'un côté ou de l'autre.
 *
 * C'est le portage du pen « WebGL Mouse Controlled Snow » de ga-fleury :
 * les mêmes shaders, les mêmes tirages, la même logique de vent. Tout se
 * passe sur le GPU — un point par flocon, sa position calculée dans le
 * vertex shader à partir du temps — et le JavaScript ne fait que suivre la
 * souris et faire évoluer le vent. Pas de bibliothèque.
 *
 * L'onglet caché met la boucle en pause, et le temps ne saute pas à la
 * reprise.
 *
 * ## Le prix de la neige
 *
 * Tout le site est fait de plaques de verre floutées posées sur elle : chaque
 * image de neige oblige le navigateur à refaire chaque flou visible. La neige
 * se dessine donc à trente images par seconde au plus (elle tombe lentement,
 * l'œil n'y voit pas de différence), à la résolution de l'écran et non à celle
 * de la dalle, avec moitié moins de flocons que le pen, et elle se fige pendant
 * un défilement — le temps de faire glisser la page sans refaire les flous. Comme le pen, la neige tombe toujours, même sous « mouvement
 * réduit » : c'est le décor, pas une animation d'interface.
 */

export const NEIGE = {
  /** Le nombre de flocons pour un écran carré ; il suit le ratio de l'écran. */
  nombre: 3800,
  /** La gravité, et le vent : sa force au repos, ses bornes, son inertie. */
  gravite: 100,
  vent: { min: 0.1, max: 0.15, inertie: 0.01 },
  /** Le pixel ratio, plafonné : des flocons flous n'ont rien à gagner à la haute définition. */
  dprMax: 1,
  /** L'intervalle minimal entre deux images, en millisecondes : trente par seconde. */
  intervalle: 1000 / 30,
  /** Après un défilement, la neige reste figée ce temps-là, en millisecondes. */
  repriseApresDefilement: 180,
} as const;

const VERTEX = `
precision highp float;
attribute vec4 a_position;
attribute vec4 a_color;
attribute vec3 a_rotation;
attribute vec3 a_speed;
attribute float a_size;
uniform float u_time;
uniform mat4 u_projection;
uniform vec3 u_worldSize;
uniform float u_gravity;
uniform float u_wind;
varying vec4 v_color;
varying float v_rotation;
void main() {
  v_color = a_color;
  v_rotation = a_rotation.x + u_time * a_rotation.y;
  vec3 pos = a_position.xyz;
  pos.x = mod(pos.x + u_time + u_wind * a_speed.x, u_worldSize.x * 2.0) - u_worldSize.x;
  pos.y = mod(pos.y - u_time * a_speed.y * u_gravity, u_worldSize.y * 2.0) - u_worldSize.y;
  pos.x += sin(u_time * a_speed.z) * a_rotation.z;
  pos.z += cos(u_time * a_speed.z) * a_rotation.z;
  gl_Position = u_projection * vec4(pos.xyz, a_position.w);
  gl_PointSize = (a_size / gl_Position.w) * 100.0;
}`;

const FRAGMENT = `
precision highp float;
uniform sampler2D u_texture;
varying vec4 v_color;
varying float v_rotation;
void main() {
  vec2 rotated = vec2(
    cos(v_rotation) * (gl_PointCoord.x - 0.5) + sin(v_rotation) * (gl_PointCoord.y - 0.5) + 0.5,
    cos(v_rotation) * (gl_PointCoord.y - 0.5) - sin(v_rotation) * (gl_PointCoord.x - 0.5) + 0.5
  );
  vec4 flocon = texture2D(u_texture, rotated);
  gl_FragColor = vec4(flocon.rgb, flocon.a * v_color.a);
}`;

/** La caméra du pen : 60° de champ, à 100 unités, perspective. */
const CAMERA = { fov: 60, near: 1, far: 10000, z: 100 };

function projection(aspect: number): Float32Array {
  const fovRad = CAMERA.fov * (Math.PI / 180);
  const f = Math.tan(Math.PI * 0.5 - 0.5 * fovRad);
  const rangeInv = 1 / (CAMERA.near - CAMERA.far);
  const m = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (CAMERA.near + CAMERA.far) * rangeInv, -1,
    0, 0, CAMERA.near * CAMERA.far * rangeInv * 2, 0,
  ]);
  m[14] += CAMERA.z;
  m[15] += CAMERA.z;
  return m;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('neige : shader', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export interface Neige {
  detruit: () => void;
  /** Résolu au premier rendu avec la texture : le signal du fondu. */
  prete: Promise<void>;
}

export function monteNeige(holder: HTMLElement, textureUrl: string): Neige | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  holder.appendChild(canvas);

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('neige : programme', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  /* ---- les tampons : un par attribut ---- */
  const tampons: Record<string, { buffer: WebGLBuffer; size: number }> = {};
  const attribut = (nom: string, size: number) => {
    const index = gl.getAttribLocation(program, nom);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, size, gl.FLOAT, false, 0, 0);
    tampons[nom] = { buffer, size };
  };
  attribut('a_position', 3);
  attribut('a_color', 4);
  attribut('a_rotation', 3);
  attribut('a_speed', 3);
  attribut('a_size', 1);
  const pose = (nom: string, data: number[]) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, tampons[nom].buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  };

  /* ---- les uniforms ---- */
  const u = {
    time: gl.getUniformLocation(program, 'u_time'),
    projection: gl.getUniformLocation(program, 'u_projection'),
    worldSize: gl.getUniformLocation(program, 'u_worldSize'),
    gravity: gl.getUniformLocation(program, 'u_gravity'),
    wind: gl.getUniformLocation(program, 'u_wind'),
    texture: gl.getUniformLocation(program, 'u_texture'),
  };
  gl.uniform1f(u.gravity, NEIGE.gravite);
  gl.uniform1i(u.texture, 0);

  /* ---- la texture du flocon ---- */
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  let textureChargee = false;
  // Le composant peut être démonté avant que l'image n'arrive (le double
  // montage de React en dev) : on ne touche plus à une texture supprimée.
  let detruite = false;
  const image = new Image();
  image.onload = () => {
    if (detruite) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textureChargee = true;
  };
  image.src = textureUrl;

  gl.enable(gl.BLEND);
  gl.enable(gl.CULL_FACE);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  /* ---- le monde : retiré à chaque redimensionnement, comme dans le pen ---- */
  let count = 0;
  const redimensionne = () => {
    const w = holder.offsetWidth || window.innerWidth;
    const h = holder.offsetHeight || window.innerHeight;
    const dpi = Math.min(NEIGE.dprMax, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = w * dpi;
    canvas.height = h * dpi;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    gl.viewport(0, 0, w * dpi, h * dpi);
    gl.uniformMatrix4fv(u.projection, false, projection(w / h));

    // z de −80 à 80, la caméra à 100 : la hauteur visible à z = −80 est 110
    const height = 110;
    const width = (w / h) * height;
    const depth = 80;
    const position: number[] = [];
    const color: number[] = [];
    const size: number[] = [];
    const rotation: number[] = [];
    const speed: number[] = [];
    count = Math.round((w / h) * NEIGE.nombre);
    for (let i = 0; i < count; i += 1) {
      position.push(-width + Math.random() * width * 2, -height + Math.random() * height * 2, Math.random() * depth * 2);
      // x, y, sinusoïde
      speed.push(1 + Math.random(), 1 + Math.random(), Math.random() * 10);
      // angle, vitesse, sinusoïde
      rotation.push(Math.random() * 2 * Math.PI, Math.random() * 20, Math.random() * 10);
      color.push(1, 1, 1, 0.1 + Math.random() * 0.2);
      size.push(5 * Math.random() * 5 * ((h * dpi) / 1000));
    }
    gl.uniform3f(u.worldSize, width, height, depth);
    pose('a_position', position);
    pose('a_color', color);
    pose('a_rotation', rotation);
    pose('a_size', size);
    pose('a_speed', speed);
  };
  redimensionne();
  window.addEventListener('resize', redimensionne);

  /* ---- la souris et le vent ---- */
  const souris = { x: 0, y: 0 };
  const surSouris = (e: PointerEvent) => {
    souris.x = e.clientX;
    souris.y = e.clientY;
  };
  window.addEventListener('pointermove', surSouris, { passive: true });

  /* ---- le défilement : la neige se fige le temps qu'il dure ---- */
  let figeeJusqua = 0;
  const surDefilement = () => {
    figeeJusqua = performance.now() + NEIGE.repriseApresDefilement;
  };
  window.addEventListener('scroll', surDefilement, { passive: true, capture: true });
  const vent: { courant: number; force: number; cible: number } = { courant: 0, force: NEIGE.vent.min, cible: NEIGE.vent.min };

  /* ---- la boucle ---- */
  let id = 0;
  let cache = document.hidden;
  const debut = performance.now();
  let perdu = 0; // le temps passé caché, retiré de l'horloge
  let cacheDepuis = 0;
  let precedent = debut;
  let dernierDessin = 0;
  let resoudPrete: () => void = () => {};
  const prete = new Promise<void>((r) => {
    resoudPrete = r;
  });
  let signale = false;

  const image_ = (maintenant: number) => {
    id = 0;
    if (cache) return;
    // Trente images par seconde au plus, et rien pendant un défilement : la
    // neige garde son horloge, elle ne fait que se dessiner moins souvent.
    if (maintenant - dernierDessin < NEIGE.intervalle || maintenant < figeeJusqua) {
      id = requestAnimationFrame(image_);
      return;
    }
    dernierDessin = maintenant;
    const elapsed = (maintenant - debut - perdu) / 5000;
    const delta = maintenant - precedent;
    precedent = maintenant;

    // le vent : il tend vers sa cible, et sa cible suit la souris ; de
    // temps en temps, il tourne tout seul
    vent.force += (vent.cible - vent.force) * NEIGE.vent.inertie;
    vent.courant += vent.force * (delta * 0.2);
    const normalise = (souris.x / window.innerWidth) * 10 - 7;
    vent.cible = normalise * (NEIGE.vent.max - NEIGE.vent.min) + NEIGE.vent.min;
    if (Math.random() > 0.995) {
      vent.cible = (NEIGE.vent.min + Math.random() * (NEIGE.vent.max - NEIGE.vent.min)) * (Math.random() > 0.5 ? -1 : 1);
    }

    gl.uniform1f(u.time, elapsed);
    gl.uniform1f(u.wind, vent.courant);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, count);

    if (textureChargee && !signale) {
      signale = true;
      resoudPrete();
    }
    id = requestAnimationFrame(image_);
  };
  const visibilite = () => {
    if (document.hidden) {
      cache = true;
      cacheDepuis = performance.now();
    } else if (cache) {
      cache = false;
      perdu += performance.now() - cacheDepuis;
      precedent = performance.now();
      if (!id) id = requestAnimationFrame(image_);
    }
  };
  document.addEventListener('visibilitychange', visibilite);
  id = requestAnimationFrame(image_);

  return {
    prete,
    detruit: () => {
      detruite = true;
      if (id) cancelAnimationFrame(id);
      document.removeEventListener('visibilitychange', visibilite);
      window.removeEventListener('pointermove', surSouris);
      window.removeEventListener('scroll', surDefilement, { capture: true });
      window.removeEventListener('resize', redimensionne);
      for (const t of Object.values(tampons)) gl.deleteBuffer(t.buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      holder.removeChild(canvas);
    },
  };
}
