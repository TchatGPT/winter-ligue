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

import { chaineDeLaLigue } from '@/lib/auth/twitch';
import type { Database, OuverturePack, PackDu, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { getCard, getPack, joueursTires, momentDe, PACKS } from '@/lib/domain/catalog';
import { pick, tirePack } from '@/lib/domain/rng';
import {
  chanceDe,
  poidsAvecChance,
  tailleDeLaQueue,
  WEIGHT_TOTAL,
} from '@/lib/domain/rules';
import { rank, totalsFor } from '@/lib/domain/scoring';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import {
  type CardDefinition,
  type MomentCarte,
  type PackDefinition,
  type PackId,
  RARITIES,
  type Rarity,
} from '@/lib/domain/types';
import { gamesSansCarte, regleCartesSansAttendre } from './effects';
import { audit } from './ledger';
import { aJoueToutesSesGames, gamesOf } from './league';

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
      | 'STREAMEUSE'
      | 'AUCUN_DU'
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
 * Le compteur de Boosters Perso d'un joueur, réglé à la main par la
 * modération — comme les roues perso de la Summer Ligue.
 *
 * Un Booster Perso se donne pour chaque sub T3, pris ou offert, et pour des
 * subs offerts (un tous les `PACKS_REGLES.persoTousLes`) — voir
 * `packsPersoAcquis` —, et peut passer d'un joueur à un autre quand
 * celui qui l'a gagné l'offre : un − chez l'un, un + chez l'autre. Le compteur,
 * c'est le nombre de Boosters Perso en file pour ce joueur, pas encore ouverts :
 * `+` en met un en file, `−` retire le plus récent. La streameuse n'en reçoit
 * pas, et personne ne règle le sien. Chaque geste est au journal.
 */
export function ajusteBoostersPerso(
  db: Database,
  joueurId: string,
  sens: 'plus' | 'moins',
  auteur: string,
): { boostersPerso: number } {
  const joueur = db.players.find((p) => p.id === joueurId && p.active);
  if (!joueur) throw new PackError('Joueur introuvable.', 'JOUEUR_INTROUVABLE');
  if (estLaStreameuse(joueur, chaineDeLaLigue())) {
    throw new PackError('La streameuse ne joue pas : pas de Booster Perso pour elle.', 'STREAMEUSE');
  }

  const enFile = () => db.packsDus.filter((p) => p.packId === 'perso' && p.joueurId === joueurId && p.ouvertureId === null);
  if (sens === 'plus') {
    ajoutePackDu(db, 'perso', joueurId, 'ajouté par la modération');
  } else {
    const dernier = enFile().sort((a, b) => b.creeA.localeCompare(a.creeA))[0];
    if (!dernier) throw new PackError(`${joueur.pseudo} n’a pas de Booster Perso en attente.`, 'PACK_DU_INCONNU');
    db.packsDus = db.packsDus.filter((p) => p.id !== dernier.id);
  }

  const n = enFile().length;
  audit(
    db,
    auteur,
    sens === 'plus' ? 'BOOSTER_PERSO_AJOUTE' : 'BOOSTER_PERSO_RETIRE',
    joueurId,
    `${joueur.pseudo} : ${n} Booster(s) Perso en attente`,
  )
  return { boostersPerso: n };
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

/**
 * Ouvre le plus ancien booster dû de ce type — pour ce joueur, si le booster
 * va à quelqu'un. C'est la seule porte de l'écran Boosters : on n'ouvre que
 * ce qui est dû. Un Commu ou un Folie attend son palier de subs, un Perso que
 * la modération l'ait ajouté au compteur du joueur, un Finisseur que le joueur
 * ait joué toutes ses games. Rien ne s'ouvre « de rien ».
 *
 * Rejouer la même clé rend la même ouverture, même une fois la file vidée.
 */
export function ouvreProchainDu(
  db: Database,
  demande: { packId: PackId; joueurId?: string; idempotencyKey: string },
  ouvertPar: string,
): OuverturePack {
  const deja = db.ouvertures.find((o) => o.idempotencyKey === demande.idempotencyKey);
  if (deja) return deja;
  const pack = getPack(demande.packId);
  if (!pack) throw new PackError('Pack inconnu.', 'PACK_INCONNU');
  if (pack.portee === 'JOUEUR' && !demande.joueurId) {
    throw new PackError('Ce pack s’ouvre pour un joueur.', 'JOUEUR_REQUIS');
  }
  const du = db.packsDus
    .filter(
      (p) =>
        p.packId === pack.id &&
        p.ouvertureId === null &&
        (pack.portee !== 'JOUEUR' || p.joueurId === demande.joueurId),
    )
    .sort((a, b) => a.creeA.localeCompare(b.creeA))[0];
  if (!du) {
    throw new PackError(
      pack.portee === 'JOUEUR'
        ? `Aucun ${pack.name} à ouvrir pour ce joueur.`
        : `Aucun ${pack.name} à ouvrir : le palier de subs n’est pas encore atteint.`,
      'AUCUN_DU',
    );
  }
  return ouvrePack(db, { packDuId: du.id, idempotencyKey: demande.idempotencyKey }, ouvertPar);
}

/**
 * Les joueurs en lice : actifs, et la streameuse n'en est pas. Elle administre
 * la ligue, elle n'y joue pas — une carte tombée sur elle serait perdue.
 */
export function joueursEnLice(db: Database): Player[] {
  const chaine = chaineDeLaLigue();
  return db.players.filter((p) => p.active && !estLaStreameuse(p, chaine));
}

/**
 * Peut-il encore recevoir une carte ? Il lui faut une game à jouer, ou une game
 * déjà jouée encore sans carte. Un joueur qui a fini sa saison et dont toutes
 * les games portent une carte ne peut plus rien en faire.
 */
export function peutRecevoir(db: Database, player: Player): boolean {
  return !aJoueToutesSesGames(db, player) || gamesSansCarte(db, player.id).length > 0;
}

/**
 * Ceux sur qui le sort peut tomber : les joueurs en lice qui peuvent encore
 * recevoir une carte. Si personne ne le peut, tous les joueurs en lice — un
 * booster s'ouvre toujours.
 */
function bassin(db: Database): Player[] {
  const enLice = joueursEnLice(db);
  const prets = enLice.filter((p) => peutRecevoir(db, p));
  return prets.length > 0 ? prets : enLice;
}

/** Des joueurs, du premier au dernier du classement. */
function classes(db: Database, joueurs: Player[]): Player[] {
  return rank(
    joueurs.map((player) => ({
      player,
      totals: totalsFor(db.games.filter((g) => g.playerId === player.id)),
    })),
  ).map((r) => r.player);
}

/** Les joueurs en lice, du premier au dernier du classement. */
const classement = (db: Database): Player[] => classes(db, joueursEnLice(db));

/** Le joueur en tête du classement à cet instant, ou null s'il n'y a personne. */
export function teteDuClassement(db: Database): Player | null {
  return classement(db)[0] ?? null;
}

/** Les derniers du classement : le dernier tiers, un joueur au moins, trois au plus. */
export function queueDuClassement(db: Database): Player[] {
  const classes = classement(db);
  return classes.slice(classes.length - tailleDeLaQueue(classes.length));
}

/**
 * Sur qui la carte d'un pack collectif tombe.
 *
 * Une carte pour toute la ligue va à tous les joueurs en lice. Les autres ne
 * tombent que sur ceux qui peuvent encore la recevoir (`bassin`) : tirée sur
 * un joueur qui a fini sa saison et n'a plus de game libre, elle serait perdue
 * — et la tête du classement deviendrait intouchable en finissant la première.
 */
function beneficiairesDe(db: Database, card: CardDefinition): Player[] {
  const enLice = joueursEnLice(db);
  if (enLice.length === 0) return [];
  const prets = bassin(db);
  switch (card.cible) {
    case 'TOUS':
      return enLice;
    case 'HASARD':
      return [pick(prets)];
    case 'DEUX': {
      // Deux joueurs distincts. À un seul joueur en lice, la carte n'a pas de
      // sens : on le dit plutôt que de faire jouer quelqu'un contre lui-même.
      const parmi = prets.length >= 2 ? prets : enLice;
      if (parmi.length < 2) return [];
      const premier = pick(parmi);
      const second = pick(parmi.filter((p) => p.id !== premier.id));
      return [premier, second];
    }
    case 'TETE': {
      const tete = classes(db, prets)[0];
      return tete ? [tete] : [];
    }
    case 'QUEUE': {
      const ordre = classes(db, prets);
      return ordre.slice(ordre.length - tailleDeLaQueue(ordre.length));
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
 * est pour lui ; la carte ; sur qui elle tombe. La carte est posée sur chacun
 * de ses bénéficiaires, puis ce qui peut se régler sans attendre l'est — des
 * flocons, un créneau, une immunité, une game déjà jouée à relever. Le reste
 * attend la prochaine game.
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
    if (estLaStreameuse(joueur, chaineDeLaLigue())) {
      throw new PackError(
        'La streameuse ne joue pas dans la ligue : aucun booster ne s’ouvre pour elle.',
        'STREAMEUSE',
      );
    }
    chance = chanceDe(joueur.snowflakes);
  }

  const cardId = tirePack(pack, poidsAvecChance(pack.weights, chance));
  const card = getCard(cardId)!;

  const beneficiaires = joueur ? [joueur] : beneficiairesDe(db, card);
  if (beneficiaires.length === 0) {
    throw new PackError(
      card.cible === 'DEUX'
        ? 'Il faut deux joueurs actifs pour cette carte.'
        : 'Aucun joueur en lice pour recevoir la carte.',
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
  // Ce qui n'attend pas une game se règle maintenant, à l'antenne.
  for (const b of beneficiaires) regleCartesSansAttendre(db, b.id);

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
          : beneficiaires.map((b) => b.pseudo).join(', ')
    }${chance > 0 ? ` — chance ${Math.round(chance * 100)} %` : ''}`,
  );

  return ouverture;
}

/* --------------------------- Le tirage des joueurs ----------------------- */

/**
 * Le second tirage d'une ouverture, tel que l'écran le rejoue : qui a été tiré,
 * et parmi qui.
 *
 * Il n'existe que pour un booster de la ligue dont la carte tombe sur des
 * joueurs tirés au sort (`joueursTires`) : tout le monde, la tête ou la queue
 * du classement ne se tirent pas, et un booster ouvert pour un joueur va à ce
 * joueur. Le serveur a tiré dans la transaction de l'ouverture
 * (`beneficiairesDe`) ; l'écran ne fait que dérouler ce tirage, comme le rail
 * déroule la carte.
 */
export interface TirageJoueurs {
  /** Les joueurs tirés, dans l'ordre du tirage. */
  gagnants: string[];
  /** Ceux qui défilent devant le repère : les joueurs en lice. */
  joueurs: string[];
}

export function tirageDe(db: Database, o: OuverturePack): TirageJoueurs | null {
  if (o.joueurId !== null) return null;
  const card = getCard(o.cardId);
  if (!card || joueursTires(card.cible) === 0 || o.beneficiaires.length === 0) return null;
  const pseudoDe = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
  return {
    gagnants: o.beneficiaires.map(pseudoDe),
    joueurs: joueursEnLice(db).map((p) => p.pseudo),
  };
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
  /** L'intitulé de l'action : « Multiplicateur game », « Joker »… */
  action: string;
  /** Quand la carte se joue : à la prochaine game, sur une game jouée, tout de suite. */
  moment: MomentCarte;
  /**
   * Ce que la carte a déjà fait, joueur par joueur : ce qui s'est réglé à
   * l'ouverture, ou depuis. Six au plus — une carte tombée sur toute la ligue
   * ne les liste pas tous.
   */
  effets: { pseudo: string; resultat: string }[];
  /** Combien de joueurs ont vu la carte se régler. */
  regles: number;
  /** Combien de joueurs attendent encore que la carte se règle. */
  enAttente: number;
}

export function vueOuverture(db: Database, o: OuverturePack): OuvertureVue {
  const card = getCard(o.cardId);
  const pseudoDe = (id: string) => db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
  const actifs = joueursEnLice(db).length;
  // « Toute la ligue » ne se dit que si la carte visait tout le monde : deux
  // joueurs tirés au sort dans une ligue de deux ne sont pas « la ligue ».
  const tous =
    o.joueurId === null && card?.cible === 'TOUS' && o.beneficiaires.length >= actifs;
  const posees = db.cartesEnAttente.filter((c) => c.ouvertureId === o.id);
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
    action: card?.subtitle ?? '',
    moment: card ? momentDe(card.effect) : 'PROCHAINE',
    effets: posees
      .filter((c) => c.consommeeA !== null && c.resultat)
      .slice(0, 6)
      .map((c) => ({ pseudo: pseudoDe(c.joueurId), resultat: c.resultat! })),
    regles: posees.filter((c) => c.consommeeA !== null).length,
    enAttente: posees.filter((c) => c.consommeeA === null).length,
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
  /** L'intitulé de l'action. */
  action: string;
  /** Ce qu'elle attend : la prochaine game, ou une game déjà jouée à relever. */
  moment: MomentCarte;
  rarity: Rarity;
  glyph: string;
  description: string;
  nature: 'bonus' | 'malus';
  power: number;
  packId: PackId;
  pack: string;
  creeA: string;
}

/** Les cartes qu'un joueur a reçues et qui attendent encore, dans l'ordre d'arrivée. */
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
        action: card?.subtitle ?? '',
        moment: card ? momentDe(card.effect) : 'PROCHAINE',
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
