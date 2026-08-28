/**
 * Dessine la congère du bas des tuiles, et l'écrit dans la feuille de style.
 *
 *     node scripts/dessine-neige.mjs
 *
 * Le tracé est généré ici plutôt qu'écrit à la main : une image SVG en `data:`
 * doit être encodée pour l'URL, et une erreur d'encodage ne se signale pas — la
 * règle est simplement ignorée. Le script retire son propre bloc avant de le
 * reposer, il peut donc être rejoué après un changement de paramètre.
 *
 * ## Ce qui est dessiné
 *
 * De la neige accumulée : une masse molle, sans arêtes, faite de lobes ronds
 * qui se recouvrent — plus haute là où elle s'entasse, contre l'angle droit, et
 * s'amincissant en s'en éloignant. Plus quelques flocons au-dessus.
 *
 * Trois versions se sont trompées avant celle-ci, et chacune se trompait de
 * phénomène plutôt que de réglage : une turbulence SVG, qui ne fait que des
 * taches ; des fougères de givre de vitre, qui ressemblent à une plante ; des
 * cristaux prismatiques, trop durs. La neige tassée n'a rien de tout cela.
 *
 * Le dessin est une chaîne de disques posés le long d'un profil montant. Leur
 * union donne le bord bosselé sans qu'on ait à le tracer, et c'est ce bord qui
 * fait toute la différence avec un aplat.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + '/';

/** Le dessin fait la largeur d'une tuile, et la hauteur de la bande enneigée. */
const L = 260;
const H = 88;

/** Un générateur reproductible : deux exécutions doivent rendre la même image. */
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

const n2 = (v) => v.toFixed(1);

/**
 * Le profil de la congère.
 *
 * Nul à gauche, maximal contre l'angle droit. La puissance 2,6 fait une courbe
 * qui reste longtemps basse puis se redresse vite : c'est ainsi que la neige
 * s'entasse contre un obstacle, pas en pente régulière.
 */
const profil = (t) => Math.pow(t, 2.6);

function amas(rnd, { depart, hauteur, densite, rayon, plat = false }) {
  const lobes = [];
  for (let i = 0; i < densite; i += 1) {
    const t = i / (densite - 1);
    const x = depart + t * (L + 20 - depart);
    // Le socle est de hauteur à peu près constante ; la congère, elle, s'entasse.
    const h = (plat ? 0.5 + rnd() * 0.5 : profil(t)) * hauteur;
    // Le rayon suit la hauteur : une congère mince est faite de petits lobes.
    const r = rayon * (plat ? 1 : 0.42 + 0.58 * profil(t)) * (0.72 + rnd() * 0.56);
    // Le centre est enfoncé sous le sol : seule la calotte dépasse, ce qui évite
    // les lobes en forme de bulles posées les unes sur les autres.
    const cy = H + r * 0.55 - h;
    lobes.push(`<circle cx="${n2(x + (rnd() - 0.5) * 14)}" cy="${n2(cy)}" r="${n2(r)}"/>`);
  }
  return lobes.join('');
}

/** Un flocon à six branches, avec ses barbes. */
function flocon(x, y, r, rnd) {
  const traits = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i * 60 + rnd() * 6) * (Math.PI / 180);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    traits.push(`M${n2(x)} ${n2(y)}L${n2(x + dx)} ${n2(y + dy)}`);
    for (const s of [-1, 1]) {
      const b = a + s * 0.9;
      traits.push(
        `M${n2(x + dx * 0.58)} ${n2(y + dy * 0.58)}` +
          `L${n2(x + dx * 0.58 + Math.cos(b) * r * 0.34)} ${n2(y + dy * 0.58 + Math.sin(b) * r * 0.34)}`,
      );
    }
  }
  return traits.join('');
}

function dessin(graine) {
  const rnd = hasard(graine);

  /*
   * Un socle bas et franc, puis la congère.
   *
   * Le socle court sur toute la largeur à quelques pixels de haut : ce sont les
   * petits tas blancs le long du bord. Une version antérieure en faisait une
   * seconde congère translucide, et une masse claire à 34 % posée sur du bleu
   * nuit ne donne pas de la neige pâle, elle donne du gris. Mieux vaut peu de
   * neige franche que beaucoup de neige délavée.
   */
  const socle = amas(rnd, { depart: -20, hauteur: 9, densite: 30, rayon: 9, plat: true });
  const congere = amas(rnd, { depart: 46, hauteur: 50, densite: 20, rayon: 18 });

  // Les flocons se tiennent au-dessus de la congère, là où elle est haute.
  const flocons = [];
  for (let i = 0; i < 8; i += 1) {
    const t = 0.34 + rnd() * 0.66;
    const y = H - profil(t) * 50 - 6 - rnd() * 22;
    flocons.push(flocon(t * L, y, 2.4 + rnd() * 3, rnd));
  }

  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${L}' height='${H}' viewBox='0 0 ${L} ${H}'>` +
    '<defs>' +
    "<linearGradient id='n' x1='0' y1='0' x2='0.25' y2='1'>" +
    "<stop offset='0' stop-color='%23ffffff'/>" +
    "<stop offset='0.45' stop-color='%23eef6ff'/>" +
    "<stop offset='1' stop-color='%23d7e6f5'/>" +
    '</linearGradient>' +
    "<linearGradient id='f' x1='0' y1='0' x2='0.2' y2='1'>" +
    "<stop offset='0' stop-color='%23e9f3ff'/>" +
    "<stop offset='1' stop-color='%23c9dcef'/>" +
    '</linearGradient>' +
    '</defs>' +
    `<g fill='url(%23f)' opacity='0.8'>${socle}</g>` +
    `<g fill='url(%23n)' opacity='0.94'>${congere}</g>` +
    "<g fill='none' stroke='%23ffffff' stroke-width='0.8' stroke-linecap='round' opacity='0.72'>" +
    `<path d='${flocons.join('')}'/>` +
    '</g></svg>'
  );
}

/*
 * L'encodage pour l'URL.
 *
 * Les guillemets doubles doivent devenir simples : la valeur est écrite
 * `url("…")` dans la feuille de style, et le moindre guillemet double à
 * l'intérieur y referme la chaîne. Le symptôme est spectaculaire — la règle
 * entière devient invalide et le serveur de développement refuse la feuille —
 * mais la cause tient à un seul caractère, ici celui des attributs des cercles.
 */
const encode = (svg) =>
  svg.replace(/"/g, "'").replace(/</g, '%3C').replace(/>/g, '%3E');

const regle = `
  /* -- La neige du bas des tuiles ----------------------------------------- */

  /*
   * Une congère au bas de la tuile, et quelques flocons.
   *
   * Elle est **dessinée**, lobe par lobe — voir \`scripts/dessine-neige.mjs\`
   * pour ce qui distingue de la neige tassée d'un cristal, et pourquoi trois
   * tentatives précédentes se trompaient de phénomène plutôt que de réglage.
   *
   * Elle s'entasse contre l'angle droit et s'amincit vers la gauche, où le
   * chiffre est écrit : c'est ce qui lui permet d'être franche sans rien cacher.
   */
  .glass-neige::after {
    content: '';
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 66px;
    z-index: -1;
    pointer-events: none;
    border-end-start-radius: inherit;
    border-end-end-radius: inherit;
    overflow: hidden;
    background-image: url("data:image/svg+xml,${encode(dessin(5))}");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: bottom;
  }

  /* Une tuile sur deux porte un second tracé.

     Cinq tuiles alignées portant le même amas au même endroit, cela se
     remarque immédiatement. Un retournement horizontal aurait suffi et ne
     coûtait rien — mais il ramène la congère du côté gauche, c'est-à-dire
     exactement là où le chiffre est écrit. Six kilo-octets de plus valent
     mieux qu'un nombre à moitié enfoui. */
  .glass-neige:nth-child(even)::after {
    background-image: url("data:image/svg+xml,${encode(dessin(23))}");
  }
`;

let c = readFileSync(R + 'app/globals.css', 'utf8');
const ancre = "  /* La réflexion appuyée, pour les plaques qu'on veut voir briller. */";
for (const titre of ['  /* -- Le givre', '  /* -- La neige du bas des tuiles']) {
  const debut = c.indexOf(titre);
  if (debut >= 0) c = c.slice(0, debut) + c.slice(c.indexOf(ancre, debut));
}
if (!c.includes(ancre)) throw new Error('ancre introuvable');
writeFileSync(R + 'app/globals.css', c.replace(ancre, regle + '\n' + ancre));

const composant = R + 'components/ui.tsx';
let t = readFileSync(composant, 'utf8');
t = t.split('glass glass-givre flex flex-col').join('glass glass-neige flex flex-col');
const de = '<div className="glass flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">';
const vers = '<div className="glass glass-neige flex flex-col px-4 py-3.5 sm:px-5 sm:py-4">';
if (!t.includes(de) && !t.includes(vers)) throw new Error('StatTile introuvable');
writeFileSync(composant, t.split(de).join(vers));

console.log(`neige posée — ${Math.round(encode(dessin(5)).length / 1024)} Ko de tracé`);
