import { CARDS, GEMME_DU_PACK, getPack, joueursTires, packArt } from '@/lib/domain/catalog';
import { nextMilestone, prochainEvenement } from '@/lib/domain/rules';
import type { PackId } from '@/lib/domain/types';
import type { BoosterOverlay, DuelOverlay, SubsOverlay } from '@/lib/services/overlay';

/**
 * Des évènements inventés, pour l'aperçu de l'administration et le mode
 * `?demo=1` : ils ne lisent rien, n'écrivent rien, et ne ressemblent à aucune
 * donnée réelle.
 */

const PSEUDOS = ['Intel', 'Boréal', 'Givre_', 'NordKill', 'Yeti77', 'Stalagmite'];
const PACKS_DEMO: PackId[] = ['perso', 'commu', 'finisseur', 'folie'];

function auHasard<T>(liste: readonly T[]): T {
  return liste[Math.floor(Math.random() * liste.length)];
}

export function boosterDemo(n: number): BoosterOverlay {
  const packId = PACKS_DEMO[n % PACKS_DEMO.length];
  const pack = getPack(packId)!;
  const cartes = CARDS.filter((c) => c.packs.includes(packId));
  const carte = auHasard(cartes.length ? cartes : CARDS);
  const joueur = pack.portee === 'JOUEUR' ? auHasard(PSEUDOS) : null;
  // Le second tirage, comme le serveur le ferait : des joueurs distincts.
  const melange = [...PSEUDOS].sort(() => Math.random() - 0.5);
  const gagnants = joueur ? [] : melange.slice(0, joueursTires(carte.cible));
  return {
    id: `demo-booster-${n}-${Date.now()}`,
    at: new Date().toISOString(),
    pack: {
      id: pack.id,
      nom: pack.name,
      art: packArt(pack.id),
      gradient: pack.gradient,
      gemme: GEMME_DU_PACK[pack.id],
      weights: pack.weights,
    },
    pour: joueur ?? (packId === 'folie' ? 'toute la ligue' : 'la communauté'),
    tombeSur:
      joueur ?? (carte.cible === 'TOUS' ? 'toute la ligue' : gagnants.length ? gagnants.join(' et ') : melange[0]),
    tirage: gagnants.length ? { gagnants, joueurs: PSEUDOS } : null,
    carte: {
      cardId: carte.id,
      name: carte.name,
      rarity: carte.rarity,
      glyph: carte.glyph,
      description: carte.description,
      power: carte.power,
      nature: carte.nature,
      action: carte.subtitle,
    },
  };
}

export function duelDemo(n: number): DuelOverlay {
  return {
    id: `demo-duel-${n}-${Date.now()}`,
    at: new Date().toISOString(),
    hote: PSEUDOS[n % PSEUDOS.length],
    mise: auHasard([100, 250, 500, 1000]),
  };
}

/** Ce que le compteur de subs montre pour un total, calculé comme le serveur le calcule. */
export function vueSubsDemo(total: number, enCours: SubsOverlay['enCours'] = []): SubsOverlay {
  const prochain = nextMilestone(total);
  const evenement = prochainEvenement(total);
  return {
    total,
    prochain: prochain
      ? {
          label: prochain.milestone.label,
          description: prochain.milestone.description,
          restant: prochain.remaining,
          progression: prochain.progress,
        }
      : null,
    evenement: evenement
      ? { label: evenement.evenement.label, resume: evenement.evenement.resume, restant: evenement.remaining }
      : null,
    enCours,
  };
}
