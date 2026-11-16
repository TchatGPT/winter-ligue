'use client';

/**
 * Une vidéo détourée dans un `<canvas>` : la vidéo porte l'image et, à côté
 * (dessous ou à droite), sa transparence en niveaux de gris ; un petit shader
 * WebGL les recompose. Ça marche partout où il y a du H.264 et WebGL — Safari compris,
 * qui ignore la transparence du VP9.
 */

const SOMMETS = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const PIXELS = `
precision mediump float;
uniform sampler2D video;
uniform float droite;
varying vec2 uv;
void main() {
  vec2 a = mix(vec2(uv.x, uv.y * 0.5), vec2(uv.x * 0.5, uv.y), droite);
  vec2 b = mix(vec2(uv.x, 0.5 + uv.y * 0.5), vec2(0.5 + uv.x * 0.5, uv.y), droite);
  vec3 couleur = texture2D(video, a).rgb;
  float alpha = texture2D(video, b).r;
  gl_FragColor = vec4(couleur * alpha, alpha);
}`;

export interface Detoureur {
  /** Dessine l'image courante de la vidéo. */
  dessine(): void;
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
export function detoureur(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  alpha: 'dessous' | 'droite',
): Detoureur | null {
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
  gl.uniform1f(gl.getUniformLocation(prog, 'droite'), alpha === 'droite' ? 1 : 0);

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
    dessine() {
      if (video.readyState < 2 || !video.videoWidth) return;
      const l = alpha === 'droite' ? video.videoWidth / 2 : video.videoWidth;
      const h = alpha === 'droite' ? video.videoHeight : video.videoHeight / 2;
      if (canvas.width !== l || canvas.height !== h) {
        canvas.width = l;
        canvas.height = h;
      }
      gl.viewport(0, 0, l, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
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
