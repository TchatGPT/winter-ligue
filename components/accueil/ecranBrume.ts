'use client';

/**
 * L'écran de la display : la vidéo dessinée dans un `<canvas>` WebGL, puis
 * dissipée dans un brouillard (16/11/2026).
 *
 * `brume` va de 0 à 1 : de 0 à 0,45, un brouillard monte des bords et couvre
 * la scène ; de 0,45 à 1, il se déchire — des trouées s'ouvrent là où il est le
 * plus mince, s'agrandissent, et ne laissent que des volutes qui s'effacent :
 * la page apparaît dessous. Le bruit qui fait le brouillard bouge avec `temps`.
 * Tout se calcule ici, net à toutes les tailles d'écran.
 */

const SOMMETS = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const PIXELS = `
precision highp float;
uniform sampler2D video;
uniform float brume;
uniform float temps;
uniform vec2 taille;
varying vec2 uv;

float hachure(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float bruit(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hachure(i), hachure(i + vec2(1.0, 0.0)), u.x),
             mix(hachure(i + vec2(0.0, 1.0)), hachure(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * bruit(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 scene = texture2D(video, uv).rgb;
  vec2 q = (uv - 0.5) * vec2(taille.x / taille.y, 1.0);
  vec2 p = q * 2.4;
  float t = temps;
  // Un nuage qui roule : deux couches de bruit, l'une déformée par l'autre.
  float n1 = fbm(p + vec2(t * 0.07, -t * 0.03));
  float n2 = fbm(p * 1.6 + n1 * 1.4 - vec2(t * 0.11, t * 0.05));
  float nuage = clamp(n1 * 0.5 + n2 * 0.5, 0.0, 1.0);

  float monte = smoothstep(0.0, 0.45, brume);
  float leve = smoothstep(0.45, 1.0, brume);

  // Le brouillard arrive des bords vers le centre, épais et inégal.
  float bord = length(q * vec2(0.9, 1.25));
  float front = mix(1.25, -0.35, monte);
  float dens = smoothstep(front - 0.25, front + 0.15, bord + (nuage - 0.5) * 0.9);
  dens = clamp(dens * (0.75 + 0.35 * nuage), 0.0, 1.0);

  vec3 clair = vec3(0.93, 0.95, 0.99);
  vec3 ombre = vec3(0.70, 0.76, 0.86);
  vec3 brouillard = mix(ombre, clair, smoothstep(0.25, 0.85, n2));
  vec3 couleur = mix(scene, brouillard, dens);

  // Il se lève : des trouées s'ouvrent là où il est le plus mince.
  float trouee = smoothstep(nuage - 0.12, nuage + 0.12, leve * 1.35 - 0.12);
  float alpha = 1.0 - trouee;
  gl_FragColor = vec4(couleur * alpha, alpha);
}`;

export interface EcranBrume {
  /** Dessine l'image courante de la vidéo, avec le brouillard en cours. */
  dessine(brume: number, temps: number): void;
  libere(): void;
}

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

/** Prépare le canvas, ou rend `null` si WebGL manque : l'accueil saute alors la vidéo. */
export function ecranBrume(canvas: HTMLCanvasElement, video: HTMLVideoElement): EcranBrume | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const vs = shader(gl, gl.VERTEX_SHADER, SOMMETS);
  const fs = shader(gl, gl.FRAGMENT_SHADER, PIXELS);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const uBrume = gl.getUniformLocation(prog, 'brume');
  const uTemps = gl.getUniformLocation(prog, 'temps');
  const uTaille = gl.getUniformLocation(prog, 'taille');

  const tampon = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.clearColor(0, 0, 0, 0);

  return {
    dessine(brume, temps) {
      if (video.readyState < 2 || !video.videoWidth) return;
      const l = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== l || canvas.height !== h) {
        canvas.width = l;
        canvas.height = h;
      }
      gl.viewport(0, 0, l, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.uniform1f(uBrume, brume);
      gl.uniform1f(uTemps, temps);
      gl.uniform2f(uTaille, l, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    libere() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(tampon);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
