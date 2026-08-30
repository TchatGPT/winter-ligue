import 'server-only';

/**
 * Les boosters tels qu'ils sont réellement vendus.
 *
 * Le catalogue de `lib/domain/catalog.ts` reste la source de vérité par défaut,
 * et il ne bouge pas : c'est une constante de domaine, pure et testée. Ce
 * module lui superpose les réglages décidés par l'administration — un prix, une
 * table de raretés — et rend le résultat.
 *
 * ## Pourquoi une couche par-dessus, et non des valeurs en base
 *
 * Déplacer les boosters en base aurait supprimé le catalogue, donc le point de
 * référence : plus moyen de savoir ce qu'était le réglage d'origine, ni de
 * revenir dessus, ni de faire tourner les tests d'équilibre sur autre chose que
 * l'état courant d'une base. Ici, effacer un réglage suffit à retrouver le
 * catalogue, et les tests continuent de vérifier les valeurs livrées.
 *
 * ## Ce qui compte vraiment
 *
 * `resolvedBooster()` doit être utilisé **partout où le booster sert au jeu** —
 * au débit comme au tirage. Afficher un prix modifié tout en tirant avec les
 * poids d'origine serait pire que de ne rien modifier du tout : l'écran et le
 * serveur raconteraient deux choses différentes, et c'est exactement le genre
 * d'écart qui fait accuser un site de tricher.
 */

import type { BoosterSetting, Database } from '@/lib/db/entities';
import { BOOSTERS, getBooster } from '@/lib/domain/catalog';
import { WEIGHT_TOTAL } from '@/lib/domain/rules';
import { RARITIES, type BoosterDefinition, type Rarity } from '@/lib/domain/types';

export class BoosterError extends Error {
  constructor(
    message: string,
    readonly code: 'BOOSTER_INCONNU' | 'PRIX_INVALIDE' | 'TABLE_INVALIDE',
  ) {
    super(message);
    this.name = 'BoosterError';
  }
}

/** Bornes du prix. Larges : c'est un garde-fou contre la faute de frappe. */
export const PRIX_MIN = 1;
export const PRIX_MAX = 1_000_000;

/** Applique le réglage d'un booster à sa définition de catalogue. */
function fusionne(base: BoosterDefinition, reglage: BoosterSetting | undefined): BoosterDefinition {
  if (!reglage) return base;
  return {
    ...base,
    price: reglage.price ?? base.price,
    weights: reglage.weights ?? base.weights,
  };
}

/** Tous les boosters, réglages appliqués, dans l'ordre du catalogue. */
export function resolvedBoosters(db: Database): BoosterDefinition[] {
  return BOOSTERS.map((b) =>
    fusionne(
      b,
      db.boosterSettings.find((r) => r.boosterId === b.id),
    ),
  );
}

/** Un booster, réglages appliqués, ou null si l'identifiant est inconnu. */
export function resolvedBooster(db: Database, boosterId: string): BoosterDefinition | null {
  const base = getBooster(boosterId);
  if (!base) return null;
  return fusionne(
    base,
    db.boosterSettings.find((r) => r.boosterId === boosterId),
  );
}

/**
 * Vérifie une table de raretés, et lève si elle ne tient pas.
 *
 * La somme doit valoir **exactement** 100 000. Ce n'est pas une coquetterie :
 * `pickWeighted` tire un entier dans cet intervalle et parcourt les poids
 * cumulés. Une somme inférieure laisse une plage sans carte — le tirage retombe
 * alors sur la dernière rareté, la plus rare, bien plus souvent qu'annoncé. Une
 * somme supérieure rend au contraire les dernières raretés inatteignables.
 *
 * Dans les deux cas les taux affichés deviennent faux, et un joueur n'a aucun
 * moyen de s'en apercevoir. D'où le refus net plutôt qu'une normalisation
 * silencieuse : l'administrateur doit voir son erreur, pas la voir corrigée.
 */
export function verifieTable(weights: Record<string, number>): Record<Rarity, number> {
  const table = {} as Record<Rarity, number>;
  let somme = 0;

  for (const rarity of RARITIES) {
    const valeur = weights[rarity];
    if (!Number.isInteger(valeur) || valeur < 0) {
      throw new BoosterError(
        `Le poids de la rareté ${rarity} doit être un entier positif ou nul.`,
        'TABLE_INVALIDE',
      );
    }
    table[rarity] = valeur;
    somme += valeur;
  }

  if (somme !== WEIGHT_TOTAL) {
    const ecart = somme - WEIGHT_TOTAL;
    throw new BoosterError(
      `La table doit totaliser exactement ${WEIGHT_TOTAL.toLocaleString('fr-FR')} — il y a ${Math.abs(ecart).toLocaleString('fr-FR')} ${ecart > 0 ? 'de trop' : 'de moins'}.`,
      'TABLE_INVALIDE',
    );
  }

  return table;
}

/**
 * Enregistre le réglage d'un booster. À appeler dans une transaction.
 *
 * Passer `null` sur un champ le remet au catalogue — c'est la marche arrière,
 * et elle doit rester à un geste.
 */
export function reglageBooster(
  db: Database,
  boosterId: string,
  patch: { price?: number | null; weights?: Record<string, number> | null },
): BoosterDefinition {
  const base = getBooster(boosterId);
  if (!base) throw new BoosterError('Booster inconnu.', 'BOOSTER_INCONNU');

  if (patch.price !== undefined && patch.price !== null) {
    if (!Number.isInteger(patch.price) || patch.price < PRIX_MIN || patch.price > PRIX_MAX) {
      throw new BoosterError(
        `Le prix doit être un entier entre ${PRIX_MIN} et ${PRIX_MAX.toLocaleString('fr-FR')}.`,
        'PRIX_INVALIDE',
      );
    }
  }

  const table =
    patch.weights === undefined || patch.weights === null
      ? undefined
      : verifieTable(patch.weights);

  const existant = db.boosterSettings.find((r) => r.boosterId === boosterId);
  const suivant: BoosterSetting = {
    boosterId,
    price: patch.price === null ? undefined : (patch.price ?? existant?.price),
    weights: patch.weights === null ? undefined : (table ?? existant?.weights),
    updatedAt: new Date().toISOString(),
  };

  // Un réglage qui ne règle plus rien est retiré, et non gardé vide : la
  // présence d'une ligne doit vouloir dire « ce booster est modifié ».
  const reste = db.boosterSettings.filter((r) => r.boosterId !== boosterId);
  db.boosterSettings =
    suivant.price === undefined && suivant.weights === undefined ? reste : [...reste, suivant];

  return fusionne(base, suivant);
}
