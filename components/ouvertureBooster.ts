'use client';

import { type RefObject, useEffect, useRef } from 'react';
import type { CarteRailPack } from '@/components/RailPack';
import { CARDS } from '@/lib/domain/catalog';

/**
 * L'ouverture d'un booster rendue dans Blender (15/11/2026), la même sur le
 * site et dans l'overlay : le booster monte, sa bande se déchire lentement et
 * tombe, et cinq cartes du booster en jaillissent. Là, la vidéo s'arrête : le
 * mélange se joue sur les vraies cartes du rail (`joueMelange`).
 *
 * Une vidéo VP9 à fond transparent, du plateau entier de l'overlay (1920 ×
 * 1080), rendue par `scratchpad/blender/ouverture/rendu.sh`. Sa fin est
 * mesurée sur le rail : cartes de 420 px, une tous les 448, la troisième
 * centrée à x = 946,6 et y = 631,4.
 */
export const VIDEOS_OUVERTURE: Partial<Record<string, string>> = {
  perso: '/boosters/ouverture-perso.webm',
  commu: '/boosters/ouverture-commu.webm',
  folie: '/boosters/ouverture-folie.webm',
  finisseur: '/boosters/ouverture-finisseur.webm',
};

/**
 * Les douze premières cartes de la bande, après la toute première : celles
 * que montre la fin de la vidéo, dans l'ordre. Le rail les reprend telles
 * quelles. À changer avec la vidéo.
 */
const BANDE_DE_DEPART: Partial<Record<string, string[]>> = {
  perso: [
    'chocolat-chaud', 'souffle-polaire', 'ouragan-blanc', 'vortex-polaire', 'bonhomme-de-neige', 'congere',
    'bocal-de-givre', 'marche-gelee', 'vent-porteur', 'lanterne-givree', 'coulee-de-neige', 'cime-gelee',
  ],
  finisseur: [
    'sommet-atteint', 'drapeau-plante', 'troc-des-neiges', 'statue-de-givre', 'soudure-de-glace', 'neige-fondue',
    'remontee', 'abri-de-glace', 'eboulement', 'neige-fondue', 'remontee', 'abri-de-glace',
  ],
  commu: [
    'flocon-de-plus', 'triple-echo', 'trois-glacons', 'miroir-des-cimes', 'petits-pas', 'neige-melee',
    'deneigement', 'degel-double', 'cime-eclatante', 'contre-vent', 'voleur-d-hiver', 'givre-errant',
  ],
  folie: [
    'morsure-du-froid', 'pluie-de-jokers', 'barillet-de-glace', 'blizzard-general', 'grand-gel', 'nuit-blanche',
    'cryogenisation', 'morsure-du-froid', 'pluie-de-jokers', 'grand-gel', 'nuit-blanche', 'cryogenisation',
  ],
};

/** La place de la carte du milieu dans la vidéo, sur le plateau de 1920 × 1080. */
export const REPERE_VIDEO = { x: 946.6, y: 631.4, largeurCarte: 420, largeur: 1920, hauteur: 1080 };

/** La durée d'une image de la vidéo (30 i/s). */
const IMAGE = 1 / 30;

export function bandeDeDepart(packId: string): CarteRailPack[] {
  return (BANDE_DE_DEPART[packId] ?? [])
    .map((id) => CARDS.find((c) => c.id === id))
    .filter((c) => c !== undefined)
    .map((c) => ({
      cardId: c.id,
      name: c.name,
      rarity: c.rarity,
      glyph: c.glyph,
      description: c.description,
      power: c.power,
      nature: c.nature,
    }));
}

/**
 * Guette la fin de la vidéo, image par image, et prévient à sa dernière image
 * (le mélange prend la suite sur les cartes du rail — `joueMelange`).
 */
export function useFinVideo(video: RefObject<HTMLVideoElement | null>, actif: boolean, finie: () => void): void {
  const rappel = useRef(finie);
  useEffect(() => {
    rappel.current = finie;
  });
  useEffect(() => {
    if (!actif) return;
    let fini = false;
    let image = 0;
    const guette = () => {
      const v = video.current;
      if (!fini && v && Number.isFinite(v.duration) && v.duration > 0) {
        if (v.ended || v.currentTime >= v.duration - IMAGE - 0.004) {
          fini = true;
          rappel.current();
          return;
        }
      }
      image = requestAnimationFrame(guette);
    };
    image = requestAnimationFrame(guette);
    // Un filet : une vidéo qui ne vient pas ne bloque pas l'ouverture.
    const filet = setTimeout(() => {
      if (!fini) {
        fini = true;
        rappel.current();
      }
    }, 12000);
    return () => {
      cancelAnimationFrame(image);
      clearTimeout(filet);
    };
  }, [actif, video]);
}
