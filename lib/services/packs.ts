import 'server-only';

/**
 * Les packs : la file, l'ouverture, et ce qui en sort.
 *
 * ## Le principe
 *
 * Personne n'achète de pack. Ils sont **dus** — par les subs qu'un joueur a
 * offerts, par un palier de la saison, par une saison jouée jusqu'au bout — et
 * mis en file. La streameuse les ouvre à l'antenne, un par un, depuis l'écran
 * d'administration. Le tirage a lieu à ce moment-là, ici, dans la transaction ;
 * le rail à l'écran ne fait que révéler ce qui est déjà écrit.
 *
 * ## Ce qui n'est jamais laissé au client
 *
 * La rareté, la carte, sur qui elle tombe. Le navigateur envoie l'identifiant
 * d'un pack dû, ou un pack et un joueur ; il reçoit une ouverture complète.
 *
 * ## Le catalogue et les réglages
 *
 * Le catalogue de `lib/domain/catalog.ts` reste la référence. L'administration
 * peut lui superposer une table de raretés par pack ; retirer le réglage
 * suffit à retrouver le catalogue. `resolvedPack()` est la seule lecture
 * légitime dès qu'un pack sert au jeu.
 */

import type { Database, OuverturePack, PackDu, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getCard, getPack, PACKS } from '@/lib/domain/catalog';
import { pick, tirePack } from '@/lib/domain/rng';
import {
  chanceDe,
  packsPersoAcquis,
  PACKS_REGLES,
  poidsAvecChance,
  WEIGHT_TOTAL,
} from '@/lib/domain/rules';
import { rank, totalsFor } from '@/lib/domain/scoring';
import {
  type CardDefinition,
  type PackDefinition,
  type PackId,
  RARITIES,
  type Rarity,
} from '@/lib/domain/types';
import { audit, credit } from './ledger';
import { gamesOf } from './league';

export class PackError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'PACK_INCONNU'
      | 'TABLE_INVALIDE'
      | 'PACK_DU_INCONNU'
      | 'DEJA_OUVERT'
      | 'JOUEUR_REQUIS'
      | 'JOUEUR_INTROUVABLE'
      | 'AUCUN_BENEFICIAIRE',
  ) {
    super(message);
    this.name = 'PackError';
  }
}

/* ------------------------------- Réglages -------------------------------- */

/** Un pack, réglage appliqué, ou null si l'identifiant est inconnu. */
export function resolvedPack(db: Database, packId: string): PackDefinition | null {
  const base = getPack(packId);
  if (!base) return null;
  const reglage = db.reglagesPacks.find((r) => r.packId === base.id);
  return reglage ? { ...base, weights: reglage.weights } : base;
}

/** Tous les packs, réglages appliqués, dans l'ordre du catalogue. */
export function resolvedPacks(db: Database): PackDefinition[] {
  return PACKS.map((p) => resolvedPack(db, p.id)!);
}

/**
 * Vérifie une table de raretés, et lève si elle ne tient pas.
 *
 * La somme doit valoir **exactement** 100 000 : c'est la plage dans laquelle
 * `pickWeighted` tire. Une somme fausse rend les taux affichés mensongers
 * sans que personne puisse s'en apercevoir. D'où le refus net plutôt qu'une
 * normalisation silencieuse.
 */
export function verifieTable(weights: Record<string, number>): Record<Rarity, number> {
  const table = {} as Record<Rarity, number>;
  let somme = 0;

  for (const rarity of RARITIES) {
    const valeur = weights[rarity];
    if (!Number.isInteger(valeur) || valeur < 0) {
      throw new PackError(
        `Le poids de la rareté ${rarity} doit être un entier positif ou nul.`,
        'TABLE_INVALIDE',
      );
    }
    table[rarity] = valeur;
    somme += valeur;
  }

  if (somme !== WEIGHT_TOTAL) {
    const ecart = somme - WEIGHT_TOTAL;
    throw new PackError(
      `La table doit totaliser exactement ${WEIGHT_TOTAL.toLocaleString('fr-FR')} — il y a ${Math.abs(ecart).toLocaleString('fr-FR')} ${ecart > 0 ? 'de trop' : 'de moins'}.`,
      'TABLE_INVALIDE',
    );
  }

  return table;
}

/**
 * Enregistre le réglage d'un pack. À appeler dans une transaction.
 * Passer `null` remet le catalogue — la marche arrière reste à un geste.
 */
export function reglagePack(
  db: Database,
  packId: string,
  weights: Record<string, number> | null,
): PackDefinition {
  const base = getPack(packId);
  if (!base) throw new PackError('Pack inconnu.', 'PACK_INCONNU');

  const reste = db.reglagesPacks.filter((r) => r.packId !== base.id);
  if (weights === null) {
    db.reglagesPacks = reste;
    return base;
  }
  const table = verifieTable(weights);
  db.reglagesPacks = [...reste, { packId: base.id, weights: table, updatedAt: new Date().toISOString() }];
  return { ...base, weights: table };
}

/* -------------------------------- La file -------------------------------- */

/** Met un pack en file. */
export function ajoutePackDu(
  db: Database,
  packId: PackId,
  joueurId: string | null,
  raison: string,
): PackDu {
  const du: PackDu = {
    id: newId(),
    packId,
    joueurId,
    raison,
    creeA: new Date().toISOString(),
    ouvertureId: null,
  };
  db.packsDus.push(du);
  return du;
}

/**
 * Attribue des subs offerts à un joueur, et met en file les packs Perso qu'ils
 * lui valent.
 *
 * Saisi par la modération aujourd'hui, par les notifications Twitch demain :
 * dans les deux cas, on ne fait qu'incrémenter et compter les multiples de
 * cinq franchis. Le pack n'est jamais ouvert ici.
 */
export function attribueSubsJoueur(
  db: Database,
  joueurId: string,
  delta: number,
  actor: string,
): { subsOfferts: number; packsAjoutes: number } {
  const player = db.players.find((p) => p.id === joueurId && p.active);
  if (!player) throw new PackError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
  if (!Number.isInteger(delta) || delta <= 0 || delta > 10_000) {
    throw new PackError('Nombre de subs invalide.', 'TABLE_INVALIDE');
  }

  const avant = packsPersoAcquis(player.subsOfferts);
  player.subsOfferts += delta;
  const apres = packsPersoAcquis(player.subsOfferts);

  for (let n = avant + 1; n <= apres; n += 1) {
    ajoutePackDu(db, 'perso', player.id, `${n * PACKS_REGLES.persoTousLes} subs offerts`);
  }

  audit(
    db,
    actor,
    'SUBS_JOUEUR',
    player.id,
    `+${delta} subs offerts (total ${player.subsOfferts})${
      apres > avant ? ` — ${apres - avant} pack(s) Perso en file` : ''
    }`,
  );

  return { subsOfferts: player.subsOfferts, packsAjoutes: apres - avant };
}

/**
 * Met en file le pack Finisseur d'un joueur qui vient d'atteindre son quota de
 * games. Une fois par joueur et par saison : la limite peut être relevée par
 * la modération, le pack n'en tombe pas une seconde fois.
 */
export function verifieFinisseur(db: Database, joueurId: string): PackDu | null {
  const jouees = gamesOf(db, joueurId).filter((g) => !g.skipped).length;
  if (jouees < db.config.maxGamesPerPlayer) return null;
  const deja = db.packsDus.some((p) => p.packId === 'finisseur' && p.joueurId === joueurId);
  if (deja) return null;
  return ajoutePackDu(db, 'finisseur', joueurId, `${jouees} games jouées`);
}

export interface PackDuVue {
  id: string;
  packId: PackId;
  nom: string;
  joueurId: string | null;
  pseudo: string | null;
  raison: string;
  creeA: string;
}

/** Les packs qui attendent d'être ouverts, le plus ancien en tête. */
export function fileDesPacks(db: Database): PackDuVue[] {
  return db.packsDus
    .filter((p) => p.ouvertureId === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA))
    .map((p) => ({
      id: p.id,
      packId: p.packId,
      nom: getPack(p.packId)?.name ?? p.packId,
      joueurId: p.joueurId,
      pseudo: p.joueurId ? (db.players.find((j) => j.id === p.joueurId)?.pseudo ?? null) : null,
      raison: p.raison,
      creeA: p.creeA,
    }));
}

/* ------------------------------- L'ouverture ----------------------------- */

/** Le joueur en tête du classement à cet instant, ou null s'il n'y a personne. */
export function teteDuClassement(db: Database): Player | null {
  const actifs = db.players.filter((p) => p.active);
  if (actifs.length === 0) return null;
  const classes = rank(
    actifs.map((player) => ({
      player,
      totals: totalsFor(db.games.filter((g) => g.playerId === player.id)),
    })),
  );
  return classes[0]?.player ?? null;
}

/** Sur qui la carte d'un pack collectif tombe. */
function beneficiairesDe(db: Database, card: CardDefinition): Player[] {
  const actifs = db.players.filter((p) => p.active);
  if (actifs.length === 0) return [];
  switch (card.cible) {
    case 'TOUS':
      return actifs;
    case 'HASARD':
      return [pick(actifs)];
    case 'DEUX': {
      // Deux joueurs distincts. À un seul joueur actif, la carte n'a pas de
      // sens : on le dit plutôt que de faire jouer quelqu'un contre lui-même.
      if (actifs.length < 2) return [];
      const premier = pick(actifs);
      const second = pick(actifs.filter((p) => p.id !== premier.id));
      return [premier, second];
    }
    case 'TETE': {
      const tete = teteDuClassement(db);
      return tete ? [tete] : [];
    }
  }
}

export interface DemandeOuverture {
  /** Un pack de la file… */
  packDuId?: string;
  /** …ou un pack ouvert à la main, pour un joueur s'il en faut un. */
  packId?: PackId;
  joueurId?: string;
  idempotencyKey: string;
}

/**
 * Ouvre un pack. À appeler dans une transaction.
 *
 * Tout se décide ici : la rareté, poussée par la chance du joueur si le pack
 * est pour lui ; la carte ; sur qui elle tombe. Une carte de flocons est
 * créditée dans l'instant ; toute autre carte se pose sur la prochaine game
 * de chacun de ses bénéficiaires.
 */
export function ouvrePack(db: Database, demande: DemandeOuverture, ouvertPar: string): OuverturePack {
  const deja = db.ouvertures.find((o) => o.idempotencyKey === demande.idempotencyKey);
  if (deja) return deja;

  let du: PackDu | null = null;
  let packId = demande.packId ?? null;
  let joueurId = demande.joueurId ?? null;

  if (demande.packDuId) {
    du = db.packsDus.find((p) => p.id === demande.packDuId) ?? null;
    if (!du) throw new PackError('Ce pack n’est pas dans la file.', 'PACK_DU_INCONNU');
    if (du.ouvertureId) throw new PackError('Ce pack a déjà été ouvert.', 'DEJA_OUVERT');
    packId = du.packId;
    joueurId = du.joueurId;
  }

  const pack = packId ? resolvedPack(db, packId) : null;
  if (!pack) throw new PackError('Pack inconnu.', 'PACK_INCONNU');

  let joueur: Player | null = null;
  let chance = 0;
  if (pack.portee === 'JOUEUR') {
    if (!joueurId) throw new PackError('Ce pack s’ouvre pour un joueur.', 'JOUEUR_REQUIS');
    joueur = db.players.find((p) => p.id === joueurId && p.active) ?? null;
    if (!joueur) throw new PackError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
    chance = chanceDe(joueur.snowflakes);
  }

  const cardId = tirePack(pack, poidsAvecChance(pack.weights, chance));
  const card = getCard(cardId)!;

  const beneficiaires = joueur ? [joueur] : beneficiairesDe(db, card);
  if (beneficiaires.length === 0) {
    throw new PackError(
      card.cible === 'DEUX'
        ? 'Il faut deux joueurs actifs pour cette carte.'
        : 'Aucun joueur actif pour recevoir la carte.',
      'AUCUN_BENEFICIAIRE',
    );
  }
  // Les deux cartes d'une paire partagent un identifiant : c'est lui qui
  // permet à la seconde game saisie de retrouver la première.
  const paireId = card.cible === 'DEUX' && !joueur ? newId() : null;

  const now = new Date().toISOString();
  const ouverture: OuverturePack = {
    id: newId(),
    packId: pack.id,
    cardId,
    rarity: card.rarity,
    joueurId: joueur ? joueur.id : null,
    beneficiaires: beneficiaires.map((b) => b.id),
    chance,
    ouvertPar,
    openedAt: now,
    idempotencyKey: demande.idempotencyKey,
  };
  db.ouvertures.push(ouverture);
  if (du) du.ouvertureId = ouverture.id;

  for (const b of beneficiaires) {
    if (card.effect.kind === 'snowflakes') {
      credit(db, b.id, card.effect.value, 'CARTE', ouverture.id);
      db.cartesEnAttente.push({
        id: newId(),
        joueurId: b.id,
        cardId,
        ouvertureId: ouverture.id,
        creeA: now,
        consommeeA: now,
        gameId: null,
        resultat: `+${card.effect.value} flocons`,
        paireId: null,
      });
    } else {
      db.cartesEnAttente.push({
        id: newId(),
        joueurId: b.id,
        cardId,
        ouvertureId: ouverture.id,
        creeA: now,
        consommeeA: null,
        gameId: null,
        resultat: null,
        paireId,
      });
    }
  }

  audit(
    db,
    ouvertPar,
    'PACK_OUVERT',
    joueur ? joueur.id : null,
    `${pack.name} → ${card.name} (${card.rarity}) pour ${
      joueur
        ? joueur.pseudo
        : card.cible === 'TOUS'
          ? `${beneficiaires.length} joueur(s)`
          : beneficiaires.map((b) => b.pseudo).join(' et ')
    }${chance > 0 ? ` — chance ${Math.round(chance * 100)} %` : ''}`,
  );

  return ouverture;
}

/* ------------------------------- Les vues -------------------------------- */

export interface OuvertureVue {
  id: string;
  packId: PackId;
  pack: string;
  cardId: string;
  nom: string;
  rarity: Rarity;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  power: number;
  /** Pour qui le pack a été ouvert. */
  joueurId: string | null;
  pseudo: string | null;
  /** Sur qui la carte est tombée, en pseudos. Vide pour « tout le monde ». */
  beneficiaires: string[];
  tous: boolean;
  chance: number;
  openedAt: string;
}

export function vueOuverture(db: Database, o: OuverturePack): OuvertureVue {
  const card = getCard(o.cardId);
  const pseudoDe = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
  const actifs = db.players.filter((p) => p.active).length;
  // « Toute la ligue » ne se dit que si la carte visait tout le monde : deux
  // joueurs tirés au sort dans une ligue de deux ne sont pas « la ligue ».
  const tous =
    o.joueurId === null && card?.cible === 'TOUS' && o.beneficiaires.length >= actifs;
  return {
    id: o.id,
    packId: o.packId,
    pack: getPack(o.packId)?.name ?? o.packId,
    cardId: o.cardId,
    nom: card?.name ?? o.cardId,
    rarity: o.rarity,
    glyph: card?.glyph ?? '❄',
    description: card?.description ?? '',
    nature: card?.nature ?? 'bonus',
    power: card?.power ?? 0,
    joueurId: o.joueurId,
    pseudo: o.joueurId ? pseudoDe(o.joueurId) : null,
    beneficiaires: tous ? [] : o.beneficiaires.map(pseudoDe),
    tous,
    chance: o.chance,
    openedAt: o.openedAt,
  };
}

/** Les dernières ouvertures, la plus récente en tête. */
export function dernieresOuvertures(db: Database, combien = 12): OuvertureVue[] {
  return [...db.ouvertures]
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .slice(0, combien)
    .map((o) => vueOuverture(db, o));
}

export interface CarteEnAttenteVue {
  id: string;
  cardId: string;
  nom: string;
  rarity: Rarity;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  power: number;
  packId: PackId;
  pack: string;
  creeA: string;
}

/** Les cartes posées sur la prochaine game d'un joueur, dans l'ordre d'arrivée. */
export function cartesEnAttenteDe(db: Database, joueurId: string): CarteEnAttenteVue[] {
  return db.cartesEnAttente
    .filter((c) => c.joueurId === joueurId && c.consommeeA === null)
    .sort((a, b) => a.creeA.localeCompare(b.creeA))
    .map((c) => {
      const card = getCard(c.cardId);
      const ouverture = db.ouvertures.find((o) => o.id === c.ouvertureId);
      const packId = ouverture?.packId ?? 'perso';
      return {
        id: c.id,
        cardId: c.cardId,
        nom: card?.name ?? c.cardId,
        rarity: card?.rarity ?? 'C',
        glyph: card?.glyph ?? '❄',
        description: card?.description ?? '',
        nature: card?.nature ?? 'bonus',
        power: card?.power ?? 0,
        packId,
        pack: getPack(packId)?.name ?? packId,
        creeA: c.creeA,
      };
    });
}
