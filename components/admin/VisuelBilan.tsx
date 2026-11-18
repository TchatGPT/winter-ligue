'use client';

import { useEffect, useRef, useState } from 'react';
import type { BilanSaison } from '@/lib/services/bilanSaison';

/**
 * Le visuel du bilan de la saison (18/11/2026) : une carte aux couleurs de la
 * Winter Ligue, à copier pour Discord — ou à télécharger. À gauche, la carte
 * du champion sur l'illustration de l'Aurore Triomphale (une couronne de glace
 * sous l'aurore) ; derrière, la même, floutée ; par-dessus, des plaques de
 * verre dépoli comme celles de l'overlay, et les quatre boosters de la ligue
 * rendus en 3D dans Blender (la vidéo de l'accueil, détourée). Les chiffres
 * viennent du serveur (`bilanSaison`) ; rien ne se calcule ici.
 */

const L = 1600;
const H = 1000;

/** Des images du site, de même origine : l'image se copie sans être « salie ». */
const ILLUSTRATION = '/cartes/couronnes-de-givre.webp';
const BOOSTERS_3D = '/bilan/boosters-3d.webp';

interface Teintes {
  bg: string;
  nuit: string;
  ice: string;
  aurora: string;
  violet: string;
  gold: string;
  argent: string;
  bronze: string;
  ink: string;
  muted: string;
  danger: string;
  neige: string;
  frost: string;
}

/** Les couleurs du site, lues sur ses variables CSS. */
function teintes(): Teintes {
  const s = getComputedStyle(document.documentElement);
  const v = (nom: string) => s.getPropertyValue(nom).trim();
  return {
    bg: v('--bg'),
    nuit: v('--nuit'),
    ice: v('--ice'),
    aurora: v('--aurora'),
    violet: v('--violet'),
    gold: v('--gold'),
    argent: v('--noel-acier-clair'),
    bronze: v('--bois-clair'),
    ink: v('--ink'),
    muted: v('--neige-3'),
    danger: v('--danger'),
    neige: v('--neige-1'),
    frost: v('--frost'),
  };
}

/** La famille d'une police du site, telle que le navigateur l'a chargée. */
function famille(variable: string): string {
  const sonde = document.createElement('span');
  sonde.style.fontFamily = `var(${variable})`;
  document.body.appendChild(sonde);
  const f = getComputedStyle(sonde).fontFamily;
  sonde.remove();
  return f || 'sans-serif';
}

function charge(src: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

/** Un hasard reproductible : la même neige à chaque dessin. */
function hasard(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const nombre = (n: number) => n.toLocaleString('fr-FR');

/**
 * Une couleur du site, rendue transparente. Le navigateur la lit, quelle que
 * soit son écriture : la feuille de style minifiée écrit `#fff` pour `#ffffff`.
 */
let lecteur: CanvasRenderingContext2D | null = null;
function alpha(couleur: string, a: number): string {
  lecteur ??= document.createElement('canvas').getContext('2d');
  if (!lecteur) return couleur;
  lecteur.fillStyle = '#000';
  lecteur.fillStyle = couleur;
  const lue = String(lecteur.fillStyle);
  const hex = lue.startsWith('#') && lue.length === 7 ? lue.slice(1) : null;
  if (!hex) return lue;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

type Police = { taille: number; poids: number; famille: string; espace?: number };

/** Écrit un texte qui tient dans `max` : il rapetisse s'il le faut. */
function texte(
  ctx: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  police: Police,
  couleur: string,
  max: number,
  aligne: CanvasTextAlign = 'left',
) {
  let taille = police.taille;
  const pose = () => {
    ctx.font = `${police.poids} ${taille}px ${police.famille}`;
    ctx.letterSpacing = `${(police.espace ?? 0) * taille}px`;
  };
  pose();
  while (ctx.measureText(t).width > max && taille > 10) {
    taille -= 1;
    pose();
  }
  ctx.fillStyle = couleur;
  ctx.textAlign = aligne;
  ctx.fillText(t, x, y);
  ctx.letterSpacing = '0px';
}

/** Dessine une image qui couvre le cadre donné, centrée sur (fx, fy) de l'image, de 0 à 1. */
function couvre(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  l: number,
  h: number,
  fx = 0.5,
  fy = 0.5,
) {
  const e = Math.max(l / img.width, h / img.height);
  const il = img.width * e;
  const ih = img.height * e;
  ctx.drawImage(img, x + (l - il) * fx, y + (h - ih) * fy, il, ih);
}

/**
 * Une plaque de verre dépoli, comme celles de l'overlay : le fond déjà flou
 * transparaît, à peine éclairci, sous une arête claire et un reflet en haut.
 */
function verre(ctx: CanvasRenderingContext2D, x: number, y: number, l: number, h: number, c: Teintes, accent?: string) {
  const r = 20;
  ctx.save();
  arrondi(ctx, x, y, l, h, r);
  ctx.clip();
  const fond = ctx.createLinearGradient(x, y, x, y + h);
  fond.addColorStop(0, alpha(c.frost, 0.13));
  fond.addColorStop(0.5, alpha(c.frost, 0.06));
  fond.addColorStop(1, alpha(c.frost, 0.04));
  ctx.fillStyle = fond;
  ctx.fillRect(x, y, l, h);
  if (accent) {
    const lueur = ctx.createRadialGradient(x, y, 0, x, y, Math.max(l, h) * 0.9);
    lueur.addColorStop(0, alpha(accent, 0.2));
    lueur.addColorStop(1, alpha(accent, 0));
    ctx.fillStyle = lueur;
    ctx.fillRect(x, y, l, h);
  }
  ctx.restore();
  arrondi(ctx, x + 0.5, y + 0.5, l - 1, h - 1, r);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = alpha(c.frost, 0.2);
  ctx.stroke();
  // Le reflet de l'arête haute.
  const reflet = ctx.createLinearGradient(x, y, x + l, y);
  reflet.addColorStop(0, alpha(c.neige, 0));
  reflet.addColorStop(0.5, alpha(c.neige, 0.45));
  reflet.addColorStop(1, alpha(c.neige, 0));
  ctx.fillStyle = reflet;
  ctx.fillRect(x + r, y + 1, l - 2 * r, 1.2);
}

async function dessine(canvas: HTMLCanvasElement, b: BilanSaison) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const c = teintes();
  const display = famille('--font-display');
  const sans = famille('--font-sans');
  await Promise.all([
    document.fonts.load(`900 80px ${display}`),
    document.fonts.load(`800 40px ${display}`),
    document.fonts.load(`600 24px ${sans}`),
  ]).catch(() => undefined);
  const [art, boosters] = await Promise.all([charge(ILLUSTRATION), charge(BOOSTERS_3D)]);
  const D = (taille: number, poids = 900, espace = 0): Police => ({ taille, poids, famille: display, espace });
  const S = (taille: number, poids = 600): Police => ({ taille, poids, famille: sans });

  /* ------------------------- Le fond : l'aurore, floutée ------------------------- */
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, L, H);
  if (art) {
    ctx.save();
    ctx.filter = 'blur(26px) saturate(1.25)';
    couvre(ctx, art, -60, -60, L + 120, H + 120, 0.5, 0.2);
    ctx.restore();
  }
  const voile = ctx.createLinearGradient(0, 0, L, 0);
  voile.addColorStop(0, alpha(c.bg, 0.35));
  voile.addColorStop(0.45, alpha(c.bg, 0.62));
  voile.addColorStop(1, alpha(c.bg, 0.72));
  ctx.fillStyle = voile;
  ctx.fillRect(0, 0, L, H);
  const bas = ctx.createLinearGradient(0, H * 0.55, 0, H);
  bas.addColorStop(0, alpha(c.bg, 0));
  bas.addColorStop(1, alpha(c.bg, 0.6));
  ctx.fillStyle = bas;
  ctx.fillRect(0, 0, L, H);
  for (const [x, y, r, teinte, a] of [
    [1150, -80, 620, c.aurora, 0.16],
    [1500, 300, 520, c.violet, 0.12],
  ] as const) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r);
    halo.addColorStop(0, alpha(teinte, a));
    halo.addColorStop(1, alpha(teinte, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, L, H);
  }
  // Une neige fine, qui tombe devant le fond.
  const r = hasard(2026);
  for (let i = 0; i < 140; i += 1) {
    const t = r();
    ctx.beginPath();
    ctx.arc(r() * L, r() * H, 0.6 + t * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = alpha(c.neige, 0.1 + t * 0.4);
    ctx.fill();
  }

  /* ------------------------- La carte du champion ------------------------- */
  const cx = 56;
  const cy = 56;
  const cl = 500;
  const ch = 888;
  const cr = 30;
  const champion = b.tete[0];
  ctx.save();
  ctx.shadowColor = alpha(c.bg, 0.75);
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  arrondi(ctx, cx, cy, cl, ch, cr);
  ctx.fillStyle = c.nuit;
  ctx.fill();
  ctx.restore();
  ctx.save();
  arrondi(ctx, cx, cy, cl, ch, cr);
  ctx.clip();
  if (art) couvre(ctx, art, cx, cy, cl, ch, 0.5, 0.35);
  const ombreHaut = ctx.createLinearGradient(0, cy, 0, cy + 220);
  ombreHaut.addColorStop(0, alpha(c.bg, 0.7));
  ombreHaut.addColorStop(1, alpha(c.bg, 0));
  ctx.fillStyle = ombreHaut;
  ctx.fillRect(cx, cy, cl, 220);
  const ombreBas = ctx.createLinearGradient(0, cy + ch * 0.45, 0, cy + ch);
  ombreBas.addColorStop(0, alpha(c.bg, 0));
  ombreBas.addColorStop(0.55, alpha(c.bg, 0.78));
  ombreBas.addColorStop(1, alpha(c.bg, 0.95));
  ctx.fillStyle = ombreBas;
  ctx.fillRect(cx, cy + ch * 0.45, cl, ch * 0.55);
  ctx.restore();
  // Le cadre : un filet d'or, puis un filet de givre à l'intérieur.
  const or = ctx.createLinearGradient(cx, cy, cx + cl, cy + ch);
  or.addColorStop(0, c.gold);
  or.addColorStop(0.45, c.frost);
  or.addColorStop(0.55, c.gold);
  or.addColorStop(1, c.gold);
  arrondi(ctx, cx, cy, cl, ch, cr);
  ctx.lineWidth = 4;
  ctx.strokeStyle = or;
  ctx.stroke();
  arrondi(ctx, cx + 12, cy + 12, cl - 24, ch - 24, cr - 10);
  ctx.lineWidth = 1;
  ctx.strokeStyle = alpha(c.frost, 0.35);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  texte(ctx, 'WINTER LIGUE', cx + 40, cy + 64, D(26, 800, 0.18), c.ice, cl - 80);
  texte(ctx, b.saison.nom.toUpperCase(), cx + 40, cy + 98, D(22, 700, 0.08), c.frost, cl - 80);
  if (champion) {
    texte(ctx, 'CHAMPION DE LA SAISON', cx + 40, cy + ch - 222, D(24, 800, 0.16), c.gold, cl - 80);
    texte(ctx, champion.pseudo.toUpperCase(), cx + 38, cy + ch - 140, D(84, 900), c.gold, cl - 76);
    const chips: [string, string][] = [
      [nombre(champion.points), 'pts'],
      [String(champion.top1), 'Top 1'],
      [nombre(champion.kills), 'kills'],
      [String(champion.games), 'games'],
    ];
    const pl = (cl - 80 - 3 * 10) / 4;
    chips.forEach(([v, n], i) => {
      const x = cx + 40 + i * (pl + 10);
      const y = cy + ch - 112;
      verre(ctx, x, y, pl, 66, c, c.gold);
      texte(ctx, v, x + pl / 2, y + 36, D(30, 900), c.neige, pl - 16, 'center');
      texte(ctx, n.toUpperCase(), x + pl / 2, y + 56, D(15, 700, 0.1), c.muted, pl - 16, 'center');
    });
  } else {
    texte(ctx, 'La saison commence', cx + 40, cy + ch - 120, D(48, 900), c.gold, cl - 80);
  }

  /* ------------------------- L'en-tête ------------------------- */
  const x0 = 600;
  const lr = L - 56 - x0;
  if (boosters) {
    const bl = 350;
    const bh = (boosters.height / boosters.width) * bl;
    ctx.save();
    ctx.shadowColor = alpha(c.bg, 0.7);
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    ctx.drawImage(boosters, L - 40 - bl, 22, bl, bh);
    ctx.restore();
  }
  texte(ctx, 'BILAN DE LA SAISON', x0, 122, D(78, 900), c.neige, 570);
  texte(ctx, b.saison.periode.toUpperCase(), x0 + 2, 162, D(24, 700, 0.12), c.ice, 560);

  /* ------------------------- Les chiffres ------------------------- */
  const tuiles: [string, string, string][] = [
    [nombre(b.subs), 'subs', c.violet],
    [nombre(b.joueurs), 'joueurs', c.ice],
    [nombre(b.games), 'games', c.ice],
    [nombre(b.kills), 'kills', c.aurora],
    [nombre(b.top1), 'Top 1', c.gold],
    [nombre(b.top3), 'Top 3', c.gold],
    [b.killsParGame.toLocaleString('fr-FR'), 'kills / game', c.aurora],
    [b.pointsParGame.toLocaleString('fr-FR'), 'points / game', c.ice],
  ];
  const ecart = 14;
  const tl = (lr - 3 * ecart) / 4;
  const th = 104;
  tuiles.forEach(([valeur, nom, teinte], i) => {
    const x = x0 + (i % 4) * (tl + ecart);
    const y = 206 + Math.floor(i / 4) * (th + ecart);
    verre(ctx, x, y, tl, th, c, teinte);
    texte(ctx, valeur, x + tl / 2, y + 60, D(50, 900), teinte, tl - 24, 'center');
    texte(ctx, nom.toUpperCase(), x + tl / 2, y + 88, D(17, 700, 0.12), c.muted, tl - 24, 'center');
  });

  /* ------------------------- Le reste du classement ------------------------- */
  const yb = 206 + 2 * (th + ecart) + 10;
  const hb = 56 + 888 - yb;
  const demi = (lr - ecart) / 2;
  const finale = b.saison.finalistes > 0;
  verre(ctx, x0, yb, demi, hb, c, c.gold);
  texte(
    ctx,
    finale ? `LES ${b.saison.finalistes} FINALISTES` : `LE TOP ${Math.max(b.tete.length, 1)}`,
    x0 + 28,
    yb + 44,
    D(24, 800, 0.14),
    c.gold,
    demi - 56,
  );
  const suite = b.tete.slice(1, 6);
  const pas = (hb - 70) / Math.max(5, suite.length);
  suite.forEach((j, i) => {
    const y = yb + 70 + i * pas;
    const medaille = j.rang === 2 ? c.argent : j.rang === 3 ? c.bronze : c.ice;
    ctx.beginPath();
    ctx.arc(x0 + 46, y + pas / 2 - 2, 19, 0, Math.PI * 2);
    ctx.fillStyle = alpha(medaille, 0.18);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = medaille;
    ctx.stroke();
    texte(ctx, String(j.rang), x0 + 46, y + pas / 2 + 7, D(24, 900), medaille, 30, 'center');
    texte(ctx, j.pseudo, x0 + 80, y + pas / 2 + 2, D(30, 800), c.neige, demi - 230);
    texte(ctx, `${j.top1} Top 1 · ${nombre(j.kills)} kills`, x0 + 80, y + pas / 2 + 24, S(15), c.muted, demi - 230);
    texte(ctx, `${nombre(j.points)}`, x0 + demi - 28, y + pas / 2 + 4, D(32, 900), c.ink, 120, 'right');
    texte(ctx, 'PTS', x0 + demi - 28, y + pas / 2 + 24, D(14, 700, 0.12), c.muted, 120, 'right');
  });
  if (suite.length === 0) texte(ctx, 'Le classement se remplit…', x0 + 28, yb + 100, S(20), c.muted, demi - 56);

  /* ------------------------- Les distinctions ------------------------- */
  const distinctions: [string, string, string, string][] = [];
  if (b.meilleureGame)
    distinctions.push(['MEILLEURE GAME', b.meilleureGame.pseudo, `${b.meilleureGame.score} pts · ${b.meilleureGame.kills} kills`, c.gold]);
  if (b.plusGrosKiller) distinctions.push(['PLUS GROS KILLER', b.plusGrosKiller.pseudo, `${nombre(b.plusGrosKiller.kills)} kills`, c.aurora]);
  if (b.roiDuTop1) distinctions.push(['ROI DU TOP 1', b.roiDuTop1.pseudo, `${b.roiDuTop1.top1} Top 1`, c.ice]);
  if (b.lanterne) distinctions.push(['LANTERNE ROUGE', b.lanterne.pseudo, `${nombre(b.lanterne.points)} pts · ${b.lanterne.games} games`, c.danger]);
  const dx = x0 + demi + ecart;
  const dh = (hb - 3 * 12) / 4;
  distinctions.slice(0, 4).forEach(([titre, qui, detail, teinte], i) => {
    const y = yb + i * (dh + 12);
    verre(ctx, dx, y, demi, dh, c, teinte);
    texte(ctx, titre, dx + 26, y + 34, D(17, 800, 0.14), teinte, demi - 52);
    texte(ctx, qui, dx + 26, y + 70, D(34, 800), c.neige, demi - 52);
    texte(ctx, detail, dx + 26, y + dh - 16, S(16), c.muted, demi - 52);
  });

  /* ------------------------- Le pied ------------------------- */
  texte(
    ctx,
    `${nombre(b.boostersOuverts)} boosters ouverts  ·  ${nombre(b.duels)} duels  ·  ${b.tauxTop1.toLocaleString('fr-FR')} % des games en Top 1`,
    x0,
    H - 26,
    S(19),
    c.frost,
    lr - 260,
  );
  texte(ctx, 'WINTER-LIGUE.COM', L - 56, H - 26, D(22, 800, 0.14), c.ice, 260, 'right');
}

export function VisuelBilan({ bilan }: { bilan: BilanSaison }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pret, setPret] = useState(false);
  const [etat, setEtat] = useState<{ kind: 'ok' | 'erreur'; text: string } | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    let vivant = true;
    void dessine(canvas.current, bilan).then(() => vivant && setPret(true));
    return () => {
      vivant = false;
    };
  }, [bilan]);

  const png = () =>
    new Promise<Blob>((ok, ko) => canvas.current?.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/png'));

  async function copie() {
    setEtat(null);
    try {
      // La promesse directement : Safari veut que l'écriture parte du clic.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]);
      setEtat({ kind: 'ok', text: 'Image copiée : colle-la dans Discord (Ctrl + V).' });
    } catch {
      setEtat({ kind: 'erreur', text: 'Ce navigateur ne copie pas les images : télécharge-la plutôt.' });
    }
  }

  async function telecharge() {
    const blob = await png();
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(blob);
    lien.download = `winter-ligue-bilan-saison-${bilan.saison.numero}.png`;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 2000);
  }

  return (
    <div className="bilan-visuel">
      <canvas ref={canvas} width={L} height={H} className="bilan-visuel-image" aria-label="Le bilan de la saison en image" />
      <div className="bilan-visuel-gestes">
        <button type="button" className="btn btn-ice" disabled={!pret} onClick={() => void copie()}>
          Copier l’image
        </button>
        <button type="button" className="btn" disabled={!pret} onClick={() => void telecharge()}>
          Télécharger
        </button>
        {etat && (
          <p className={`bilan-visuel-etat ${etat.kind === 'ok' ? 'text-aurora' : 'text-danger'}`} role="status">
            {etat.text}
          </p>
        )}
      </div>
    </div>
  );
}
