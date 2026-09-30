import * as THREE from 'three';

/**
 * Les couleurs et les textures de la scène 3D des duels.
 *
 * Les couleurs viennent des variables CSS du site (`app/globals.css`), lues au
 * moment où la scène se construit : le manteau d'un camp, la peau du bot, la
 * neige, le ciel. Chacune a sa valeur de repli, pour qu'une scène construite
 * hors du site (le banc d'essai) reste juste.
 *
 * Les textures sont dessinées à la volée sur des toiles : un damier, un sucre
 * d'orge, une écorce, des cernes, le grain de la neige. Rien à télécharger, et
 * le même dessin d'une fois sur l'autre — le hasard est semé.
 */

export function couleur(variable: string, repli: string): THREE.Color {
  let valeur = '';
  if (typeof document !== 'undefined') {
    valeur = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }
  const c = new THREE.Color();
  c.setStyle(/^#[0-9a-f]{3,8}$/i.test(valeur) ? valeur : repli);
  return c;
}

/** Une couleur en chaîne CSS, pour dessiner sur une toile. */
export function css(c: THREE.Color): string {
  return `#${c.getHexString()}`;
}

/** Un tirage déterministe (mulberry32). */
export function hasard(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toile(
  largeur: number,
  hauteur: number,
  dessine: (ctx: CanvasRenderingContext2D) => void,
  couleurs = true,
): THREE.CanvasTexture {
  const canevas = document.createElement('canvas');
  canevas.width = largeur;
  canevas.height = hauteur;
  dessine(canevas.getContext('2d')!);
  const t = new THREE.CanvasTexture(canevas);
  if (couleurs) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Le ciel : du bleu nuit en haut au bleu glacier à l'horizon. */
export function texCiel(haut: THREE.Color, bas: THREE.Color): THREE.CanvasTexture {
  return toile(4, 256, (ctx) => {
    const d = ctx.createLinearGradient(0, 0, 0, 256);
    d.addColorStop(0, css(haut));
    d.addColorStop(0.7, css(bas));
    d.addColorStop(1, css(bas.clone().lerp(new THREE.Color('#ffffff'), 0.35)));
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, 4, 256);
  });
}

/**
 * La bannière d'arrivée : un damier noir et blanc, et au centre une plaque
 * sombre où « ARRIVÉE » est écrit dans la police du site.
 */
export function texBanniere(nuit: THREE.Color, neige: THREE.Color, police: string): THREE.CanvasTexture {
  return toile(1024, 128, (ctx) => {
    const cote = 32;
    for (let y = 0; y < 128; y += cote) {
      for (let x = 0; x < 1024; x += cote) {
        ctx.fillStyle = ((x + y) / cote) % 2 === 0 ? css(nuit) : css(neige);
        ctx.fillRect(x, y, cote, cote);
      }
    }
    ctx.fillStyle = css(nuit);
    ctx.beginPath();
    ctx.roundRect(300, 14, 424, 100, 18);
    ctx.fill();
    ctx.strokeStyle = css(neige);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = css(neige);
    ctx.font = `900 74px ${police}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ARRIVÉE', 512, 68);
  });
}

/** Le damier peint au sol, sur la ligne. */
export function texDamier(nuit: THREE.Color, neige: THREE.Color): THREE.CanvasTexture {
  const t = toile(64, 256, (ctx) => {
    const cote = 32;
    for (let y = 0; y < 256; y += cote) {
      for (let x = 0; x < 64; x += cote) {
        ctx.fillStyle = ((x + y) / cote) % 2 === 0 ? css(nuit) : css(neige);
        ctx.fillRect(x, y, cote, cote);
      }
    }
  });
  return t;
}

/** Le tissu d'un drapeau d'arrivée : huit cases sur cinq. */
export function texDrapeau(nuit: THREE.Color, neige: THREE.Color): THREE.CanvasTexture {
  return toile(256, 160, (ctx) => {
    const cote = 32;
    for (let y = 0; y < 160; y += cote) {
      for (let x = 0; x < 256; x += cote) {
        ctx.fillStyle = ((x + y) / cote) % 2 === 0 ? css(nuit) : css(neige);
        ctx.fillRect(x, y, cote, cote);
      }
    }
  });
}

/** Le sucre d'orge des poteaux : des rayures en biais. */
export function texSucreDOrge(rouge: THREE.Color, blanc: THREE.Color): THREE.CanvasTexture {
  const t = toile(128, 128, (ctx) => {
    ctx.fillStyle = css(blanc);
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = css(rouge);
    for (let i = -2; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 128);
      ctx.lineTo(i * 64 + 32, 128);
      ctx.lineTo(i * 64 + 32 + 128, 0);
      ctx.lineTo(i * 64 + 128, 0);
      ctx.closePath();
      ctx.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  return t;
}

/** L'écorce d'une souche : des stries verticales, sombres et claires. */
export function texEcorce(bois: THREE.Color): THREE.CanvasTexture {
  const alea = hasard(71);
  const t = toile(256, 128, (ctx) => {
    ctx.fillStyle = css(bois);
    ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 90; i += 1) {
      const x = alea() * 256;
      const l = 2 + alea() * 6;
      const sombre = alea() < 0.6;
      ctx.fillStyle = sombre ? 'rgba(20,10,4,0.35)' : 'rgba(255,230,200,0.12)';
      ctx.fillRect(x, 0, l, 128);
    }
    for (let i = 0; i < 40; i += 1) {
      ctx.fillStyle = 'rgba(20,10,4,0.4)';
      ctx.fillRect(alea() * 256, alea() * 128, 1 + alea() * 3, 6 + alea() * 18);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Le dessus d'une souche : des cernes, du cœur à l'écorce. */
export function texCernes(bois: THREE.Color, ecorce: THREE.Color): THREE.CanvasTexture {
  return toile(256, 256, (ctx) => {
    ctx.fillStyle = css(bois);
    ctx.fillRect(0, 0, 256, 256);
    for (let r = 12; r < 118; r += 9 + (r % 5)) {
      ctx.strokeStyle = 'rgba(90,50,20,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(128 + Math.sin(r) * 2, 128 + Math.cos(r) * 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = css(ecorce);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(128, 128, 122, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Le grain de la neige tassée : un bruit doux, pour le relief. */
export function texGrain(graine: number): THREE.CanvasTexture {
  const alea = hasard(graine);
  const t = toile(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2200; i += 1) {
        const g = Math.floor(alea() * 255);
        ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
        const r = 1 + alea() * 4;
        ctx.beginPath();
        ctx.arc(alea() * 256, alea() * 256, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Un flocon qui tombe : un disque doux, blanc. */
export function texFlocon(): THREE.CanvasTexture {
  return toile(64, 64, (ctx) => {
    const d = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    d.addColorStop(0, 'rgba(255,255,255,1)');
    d.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    d.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** L'ombre de contact sous une pièce : un disque sombre qui s'éteint au bord. */
export function texOmbre(): THREE.CanvasTexture {
  return toile(128, 128, (ctx) => {
    const d = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    d.addColorStop(0, 'rgba(0,8,24,0.55)');
    d.addColorStop(0.55, 'rgba(0,8,24,0.28)');
    d.addColorStop(1, 'rgba(0,8,24,0)');
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, 128, 128);
  });
}
