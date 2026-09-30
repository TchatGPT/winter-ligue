import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cleDerivee } from '@/lib/auth/session';
import { getStore, type FluxOverlay } from '@/lib/db/store';
import { GEMME_DU_PACK, getCard, getPack, packArt } from '@/lib/domain/catalog';
import { nextMilestone, prochainEvenement } from '@/lib/domain/rules';
import type { PackId, Rarity } from '@/lib/domain/types';

/**
 * Les overlays OBS du stream : ce qu'ils ont le droit de lire, et comment.
 *
 * ## La clé du lien
 *
 * Une source OBS n'a pas de session : l'overlay s'ouvre par un lien qui porte
 * une clé, comme ceux des outils d'alertes. La clé est signée avec une clé
 * dérivée d'`AUTH_SECRET` et porte une **génération** : l'administration en
 * change, et tous les liens donnés jusque-là cessent de marcher — c'est la
 * parade si un lien a fuité à l'écran.
 *
 * Une clé mal signée est refusée sans toucher à la base ; une clé bien signée
 * mais d'une ancienne génération l'est après une lecture. La clé n'ouvre que
 * ce que le stream montre de toute façon : le compteur de subs, les boosters
 * ouverts à l'antenne et les duels lancés. Aucun solde, aucun identifiant.
 */

/** La clé d'overlay d'une génération : `3-` suivi de 32 caractères signés. */
export function cleOverlay(generation: number): string {
  const sceau = createHmac('sha256', cleDerivee('overlay'))
    .update(`generation:${generation}`)
    .digest('base64url')
    .slice(0, 32);
  return `${generation}-${sceau}`;
}

/** La génération que porte une clé bien signée, ou null. */
export function generationDe(cle: string | null | undefined): number | null {
  if (!cle) return null;
  const m = /^(\d{1,6})-[A-Za-z0-9_-]{32}$/.exec(cle);
  if (!m) return null;
  const generation = Number(m[1]);
  const a = Buffer.from(cle);
  const b = Buffer.from(cleOverlay(generation));
  return a.length === b.length && timingSafeEqual(a, b) ? generation : null;
}

/* --------------------------------- Vues ---------------------------------- */

export interface CarteOverlay {
  cardId: string;
  name: string;
  rarity: Rarity;
  glyph: string;
  description: string;
  power: number;
  nature: 'bonus' | 'malus';
  action: string;
}

export interface BoosterOverlay {
  id: string;
  at: string;
  pack: {
    id: PackId;
    nom: string;
    art: string | null;
    gradient: [string, string];
    gemme: Rarity;
    weights: Record<Rarity, number>;
  };
  /** Pour qui le booster s'ouvre, en toutes lettres : « Intel », « la communauté »… */
  pour: string;
  /** Sur qui la carte est tombée, dit après la révélation. */
  tombeSur: string;
  carte: CarteOverlay;
}

export interface DuelOverlay {
  id: string;
  at: string;
  hote: string;
  mise: number;
}

export interface SubsOverlay {
  total: number;
  prochain: { label: string; description: string; restant: number; progression: number } | null;
  evenement: { label: string; resume: string; restant: number } | null;
  enCours: { label: string; endsAt: string }[];
}

/** « A », « A et B », « A, B et C ». */
function liste(noms: string[]): string {
  if (noms.length <= 1) return noms[0] ?? '';
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
}

export function vueCarte(cardId: string): CarteOverlay | null {
  const c = getCard(cardId);
  if (!c) return null;
  return {
    cardId: c.id,
    name: c.name,
    rarity: c.rarity,
    glyph: c.glyph,
    description: c.description,
    power: c.power,
    nature: c.nature,
    action: c.subtitle,
  };
}

export function vueBoosters(flux: FluxOverlay): BoosterOverlay[] {
  const vues: BoosterOverlay[] = [];
  for (const o of flux.ouvertures) {
    const pack = getPack(o.packId);
    const carte = vueCarte(o.cardId);
    if (!pack || !carte) continue;
    const touteLaLigue = !o.joueur && getCard(o.cardId)?.cible === 'TOUS';
    const autres = o.nbBeneficiaires - o.beneficiaires.length;
    vues.push({
      id: o.id,
      at: o.openedAt,
      pack: {
        id: pack.id,
        nom: pack.name,
        art: packArt(pack.id),
        gradient: pack.gradient,
        gemme: GEMME_DU_PACK[pack.id],
        weights: pack.weights,
      },
      pour: o.joueur ?? (pack.id === 'folie' ? 'toute la ligue' : 'la communauté'),
      tombeSur: touteLaLigue
        ? 'toute la ligue'
        : autres > 0
          ? `${o.beneficiaires.join(', ')} et ${autres} autre${autres > 1 ? 's' : ''}`
          : liste(o.beneficiaires),
      carte,
    });
  }
  return vues;
}

export function vueDuels(flux: FluxOverlay): DuelOverlay[] {
  return flux.duels.map((d) => ({ id: d.id, at: d.creeA, hote: d.hote, mise: d.mise }));
}

export function vueSubs(flux: FluxOverlay): SubsOverlay {
  const prochain = nextMilestone(flux.totalSubs);
  const evenement = prochainEvenement(flux.totalSubs);
  return {
    total: flux.totalSubs,
    prochain: prochain
      ? {
          label: prochain.milestone.label,
          description: prochain.milestone.description,
          restant: prochain.remaining,
          progression: prochain.progress,
        }
      : null,
    evenement: evenement
      ? {
          label: evenement.evenement.label,
          resume: evenement.evenement.resume,
          restant: evenement.remaining,
        }
      : null,
    enCours: flux.evenements,
  };
}

/* --------------------------------- Accès --------------------------------- */

export type AccesOverlay =
  | { ok: true; cle: string; depart: string; demo: boolean; subs: SubsOverlay }
  | { ok: false; motif: 'invalide' | 'revoque' };

/**
 * Ce qu'une page d'overlay a le droit d'afficher, d'après son adresse.
 *
 * `?demo=1` joue des évènements inventés, sans rien lire : c'est l'aperçu de
 * l'administration, et le moyen de placer la source dans OBS. Sinon la clé doit
 * être bien signée, et de la génération en cours.
 */
export async function accesOverlay(params: { [k: string]: string | string[] | undefined }): Promise<AccesOverlay> {
  const depart = new Date().toISOString();
  if (params.demo === '1') {
    return { ok: true, cle: '', depart, demo: true, subs: vueSubs({ ...FLUX_VIDE, totalSubs: 42 }) };
  }
  const cle = typeof params.cle === 'string' ? params.cle : null;
  const generation = generationDe(cle);
  if (generation === null || !cle) return { ok: false, motif: 'invalide' };
  const flux = await getStore().fluxOverlay(depart);
  if (flux.generation !== generation) return { ok: false, motif: 'revoque' };
  return { ok: true, cle, depart, demo: false, subs: vueSubs(flux) };
}

const FLUX_VIDE: FluxOverlay = {
  maintenant: new Date(0).toISOString(),
  generation: 0,
  totalSubs: 0,
  ouvertures: [],
  duels: [],
  evenements: [],
};
