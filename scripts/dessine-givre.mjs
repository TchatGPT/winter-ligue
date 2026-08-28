/*
 * Pose les fougères de givre sur les tuiles de statistique.
 *
 * Le dessin vient de `fougeres.cjs` : des dendrites tracées branche par branche,
 * pas une texture de bruit. Deux tentatives précédentes partaient d'une
 * turbulence SVG et donnaient des taches ; le givre de vitre est une géométrie,
 * pas un grain — une tige qui pousse depuis le bord froid et se ramifie à
 * soixante degrés, l'angle du réseau hexagonal de la glace. C'est cet angle
 * qu'on reconnaît.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* Depuis la racine du dépôt : le script écrit dans la feuille de style et
   dans le composant, il doit pouvoir être rejoué après un changement de
   paramètre sans rien casser — il retire son propre bloc avant de le reposer. */
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';

/* Le dessin est fait aux dimensions d'une tuile : à cette taille, les fougères
   gardent la finesse qu'on leur a donnée au lieu d'être réduites en filaments. */
const L = 260;
const H = 130;

function hasard(graine) {
  let x = graine >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

function branche(traits, x, y, angle, longueur, niveau, rnd) {
  if (longueur < 2.4 || niveau > 3) return;
  const rad = (angle * Math.PI) / 180;
  const x2 = x + Math.cos(rad) * longueur;
  const y2 = y + Math.sin(rad) * longueur;
  traits.push({
    d: `M${x.toFixed(1)} ${y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`,
    n: niveau,
  });
  const combien = niveau === 0 ? 5 : 3;
  for (let i = 1; i <= combien; i += 1) {
    const t = i / (combien + 1);
    const px = x + Math.cos(rad) * longueur * t;
    const py = y + Math.sin(rad) * longueur * t;
    const fille = longueur * (0.52 - t * 0.22) * (0.8 + rnd() * 0.4);
    for (const sens of [-1, 1]) {
      branche(traits, px, py, angle + sens * (58 + rnd() * 8), fille, niveau + 1, rnd);
    }
  }
}

function dessin(graine) {
  const rnd = hasard(graine);
  const traits = [];
  const semer = (n, place, angle) => {
    for (let i = 0; i < n; i += 1) {
      if (rnd() < 0.24) continue;
      const t = (i + 0.5) / n + (rnd() - 0.5) * 0.07;
      const [x, y] = place(t);
      const r = rnd();
      const longueur = 8 + r * r * 30;
      branche(traits, x, y, angle + (rnd() - 0.5) * 40, longueur, 0, rnd);
    }
  };
  semer(18, (t) => [t * L, -2], 90);
  semer(18, (t) => [t * L, H + 2], -90);
  semer(10, (t) => [-2, t * H], 0);
  semer(10, (t) => [L + 2, t * H], 180);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}" viewBox="0 0 ${L} ${H}">` +
    '<g fill="none" stroke="%23ffffff" stroke-linecap="round">' +
    // Un chemin par niveau de ramification, et non un par segment : le
    // navigateur en dessine quatre au lieu de six mille, et la règle CSS pèse
    // le quart. Les segments d'un même niveau partagent épaisseur et opacité,
    // ils peuvent donc tenir dans un seul attribut `d`.
    [0, 1, 2, 3]
      .map((n) => {
        const d = traits
          .filter((t) => t.n === n)
          .map((t) => t.d)
          .join('');
        if (!d) return '';
        const w = Math.max(0.2, 0.62 - n * 0.15).toFixed(2);
        const o = Math.max(0.14, 0.52 - n * 0.1).toFixed(2);
        return `<path d="${d}" stroke-width="${w}" opacity="${o}"/>`;
      })
      .join('') +
    '</g></svg>'
  );
}

const encode = (svg) =>
  svg
    .replace(/"/g, "'")
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');

const regle = `
  /* -- Le givre des tuiles ------------------------------------------------ */

  /*
   * Des fougères de givre prises sur la face interne de la plaque.
   *
   * Elles sont **dessinées**, branche par branche, et non tirées d'une texture.
   * Deux versions antérieures partaient d'une turbulence SVG : une turbulence
   * fait des taches, et des taches claires sur un panneau sombre se lisent comme
   * de la saleté. Le givre de vitre n'est pas un grain, c'est une géométrie —
   * une tige qui pousse depuis le bord froid et se ramifie à soixante degrés,
   * l'angle du réseau hexagonal de la glace. C'est cet angle qu'on reconnaît,
   * et aucun bruit ne le produit.
   *
   * Elles partent des quatre bords vers l'intérieur, parce que c'est le cadre
   * qui est froid, et n'atteignent jamais le centre — là où se trouvent le
   * chiffre et son libellé. Un semis sur quatre ne prend pas : ce sont les
   * plages nues qui font croire à un phénomène plutôt qu'à un motif.
   */
  .glass-givre::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    pointer-events: none;
    background-image: url("data:image/svg+xml,${encode(dessin(21))}");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    opacity: 0.72;
    /* Un souffle de flou : les traits font moins d'un pixel de large, et sans
       lui ils scintillent d'un pixel à l'autre au redimensionnement. */
    filter: blur(0.25px);
  }

  /* Quatre orientations pour un seul dessin.

     Cinq tuiles alignées portant exactement le même givre, cela se remarque
     immédiatement. Un retournement suffit à faire une variante — et un tracé
     retourné reste du givre, là où un second dessin coûterait le double en
     poids de feuille de style. */
  .glass-givre:nth-child(4n + 2)::after {
    transform: scaleX(-1);
  }

  .glass-givre:nth-child(4n + 3)::after {
    transform: scaleY(-1);
  }

  .glass-givre:nth-child(4n)::after {
    transform: scale(-1);
  }
`;

let c = readFileSync(R + 'app/globals.css', 'utf8');
const ancre = "  /* La réflexion appuyée, pour les plaques qu'on veut voir briller. */";
const debut = c.indexOf('  /* -- Le givre des tuiles');
if (debut >= 0) c = c.slice(0, debut) + c.slice(c.indexOf(ancre, debut));
if (!c.includes(ancre)) throw new Error('ancre introuvable');
c = c.replace(ancre, regle + '\n' + ancre);
writeFileSync(R + 'app/globals.css', c);

const p = R + 'components/ui.tsx';
let t = readFileSync(p, 'utf8');
const de = '<div className="glass flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">';
const vers = '<div className="glass glass-givre flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">';
if (!t.includes(de) && !t.includes(vers)) throw new Error('StatTile introuvable');
writeFileSync(p, t.split(de).join(vers));

console.log('givre posé — ' + Math.round(encode(dessin(21)).length / 1024) + ' Ko de tracé');
