import 'server-only';

/**
 * Les batailles de boosters.
 *
 * Deux camps misent le même nombre de sachets identiques, les ouvrent, et celui
 * dont les cartes totalisent la plus haute somme de raretés **remporte tout**.
 *
 * ## Ce qui n'est jamais laissé au client
 *
 * Le tirage, la comparaison, l'attribution. Le navigateur reçoit le résultat
 * complet une fois qu'il est acquis et ne fait que le mettre en scène — comme
 * pour l'ouverture d'un booster, et pour la même raison : rejouer la requête,
 * recharger la page ou fermer l'onglet ne change pas une carte.
 *
 * ## Le bot ne triche pas
 *
 * Il ouvre les **mêmes sachets** avec les **mêmes tables**, tirés par la même
 * fonction et la même source d'entropie que celles du joueur. Il gagne donc à
 * peu près une fois sur deux. « Dur à battre » veut dire « c'est un vrai
 * adversaire », pas « la maison est avantagée » — un site dont les taux affichés
 * sont ceux qui s'appliquent ne peut pas se permettre un adversaire truqué à
 * côté.
 *
 * Conséquence économique, et elle est voulue : jouer contre le bot est neutre.
 * Une fois sur deux on perd sa mise, une fois sur deux on la double. Le mode
 * n'enrichit personne, il ajoute du risque à ceux qui en veulent.
 */

import { CAMP_BOT, type Bataille, type Database } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { MANCHES_MAX, MANCHES_MIN, scoreCamp, vainqueur } from '@/lib/domain/bataille';
import { CARDS } from '@/lib/domain/catalog';
import { rollBooster, secureInt } from '@/lib/domain/rng';
import { credit, debit } from '@/lib/services/ledger';
import { resolvedBooster } from '@/lib/services/boosters';

export class BatailleError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BOUTIQUE_FERMEE'
      | 'BOOSTER_INCONNU'
      | 'MANCHES_INVALIDES'
      | 'BATAILLE_INCONNUE'
      | 'DEJA_RESOLUE'
      | 'PAS_TA_BATAILLE'
      | 'TA_PROPRE_BATAILLE',
  ) {
    super(message);
    this.name = 'BatailleError';
  }
}

/**
 * La rareté d'une carte, qu'elle vienne du catalogue ou de la collection.
 *
 * Les deux pools cohabitent dans un booster — cartes à effet figées d'un côté,
 * cartes Joueur et Moment créées en cours de saison de l'autre — et une bataille
 * compare indifféremment les unes et les autres.
 */
function raretesDe(db: Database, cardIds: readonly string[]): string[] {
  return cardIds.map((id) => {
    const effet = CARDS.find((c) => c.id === id);
    if (effet) return effet.rarity;
    return db.collectibles.find((c) => c.id === id)?.rarity ?? 'C';
  });
}

/**
 * Ouvre la liste de sachets pour un camp, et rend les cartes tirées.
 *
 * Les sachets d'un même camp sont mis bout à bout : l'affrontement compare des
 * lots, pas des manches gagnées. Les rangs de relance sont recalés sur ce lot
 * complet, pour que l'écran sache quelle colonne rejouer.
 */
function ouvrePour(
  db: Database,
  boosterIds: readonly string[],
): { cardIds: string[]; relances: number[] } {
  const pool = db.collectibles.reduce<Record<string, string[]>>((acc, item) => {
    (acc[item.rarity] ??= []).push(item.id);
    return acc;
  }, {});

  const cardIds: string[] = [];
  const relances: number[] = [];
  for (const id of boosterIds) {
    const booster = resolvedBooster(db, id);
    if (!booster) throw new BatailleError('Booster inconnu.', 'BOOSTER_INCONNU');
    const tirage = rollBooster(booster, pool as never);
    for (const rang of tirage.relances) relances.push(cardIds.length + rang);
    cardIds.push(...tirage.cards);
  }
  return { cardIds, relances };
}

/**
 * Crée une bataille et met l'hôte à l'enjeu. À appeler dans une transaction.
 *
 * La mise est **débitée tout de suite**, avant que quiconque ne rejoigne. C'est
 * ce qui rend le lobby honnête : une bataille affichée est une bataille dont
 * l'hôte a déjà payé, et personne ne rejoint une mise qui n'existe pas.
 */
export function creeBataille(
  db: Database,
  hoteId: string,
  boosterIds: readonly string[],
): Bataille {
  if (boosterIds.length < MANCHES_MIN || boosterIds.length > MANCHES_MAX) {
    throw new BatailleError(
      `Un affrontement met en jeu entre ${MANCHES_MIN} et ${MANCHES_MAX} sachets.`,
      'MANCHES_INVALIDES',
    );
  }

  /*
   * La mise est la somme des prix **réglés**, sachet par sachet.
   *
   * Chaque prix est relu ici et non additionné côté client : le panier arrive du
   * navigateur, et un panier qui porterait son propre total permettrait de jouer
   * un Everest au prix d'un Givre.
   */
  let mise = 0;
  for (const id of boosterIds) {
    const booster = resolvedBooster(db, id);
    if (!booster) throw new BatailleError('Booster inconnu.', 'BOOSTER_INCONNU');
    mise += booster.price;
  }

  // Lève si le solde est insuffisant : la transaction est alors annulée.
  debit(db, hoteId, mise, 'MISE_BATAILLE', boosterIds.join(','));

  const bataille: Bataille = {
    id: newId(),
    boosterIds: [...boosterIds],
    manches: boosterIds.length,
    mise,
    hoteId,
    adversaireId: null,
    statut: 'ATTENTE',
    tirages: [],
    vainqueurId: null,
    creeeA: new Date().toISOString(),
    resolueA: null,
  };
  db.batailles.push(bataille);
  return bataille;
}

/**
 * Résout une bataille : les deux camps ouvrent, on compare, le vainqueur prend tout.
 *
 * Les exemplaires ne sont créés **qu'ici**, et seulement pour le vainqueur. Les
 * cartes du perdant n'ont jamais appartenu à personne — elles sont consignées
 * dans le tirage pour que la partie soit rejouable à l'écran et vérifiable dans
 * le journal, mais elles n'entrent dans aucune collection.
 */
function resout(db: Database, bataille: Bataille): Bataille {
  const camps = [bataille.hoteId, bataille.adversaireId!];
  const tirages = camps.map((camp) => {
    const { cardIds, relances } = ouvrePour(db, bataille.boosterIds);
    return { camp, cardIds, relances, score: scoreCamp(raretesDe(db, cardIds)) };
  });

  const gagnant = vainqueur(
    tirages.map((t) => ({ raretes: raretesDe(db, t.cardIds) })),
    // Le départage se fait sur la même entropie que le tirage : `Math.random`
    // n'a rien à faire dans une décision qui attribue des cartes.
    () => secureInt(1_000_000) / 1_000_000,
  );

  bataille.tirages = tirages;
  bataille.vainqueurId = tirages[gagnant].camp;
  bataille.statut = 'TERMINEE';
  bataille.resolueA = new Date().toISOString();

  // Le bot ne collectionne rien : s'il gagne, les cartes des deux camps
  // disparaissent, et c'est exactement ce que le joueur a accepté en misant.
  if (bataille.vainqueurId !== CAMP_BOT) {
    const toutes = tirages.flatMap((t) => t.cardIds);
    for (const cardId of toutes) {
      db.cards.push({
        id: newId(),
        playerId: bataille.vainqueurId,
        cardId,
        obtainedAt: new Date().toISOString(),
        source: 'BOOSTER',
        consumed: false,
        consumedAt: null,
        consumedOnGameId: null,
        consumedOnPlayerId: null,
        listingId: null,
        consumeKey: null,
      });
      const connue = db.discoveries.some(
        (d) => d.playerId === bataille.vainqueurId && d.cardId === cardId,
      );
      if (!connue) {
        db.discoveries.push({
          playerId: bataille.vainqueurId!,
          cardId,
          firstObtainedAt: new Date().toISOString(),
        });
      }
    }
  }

  return bataille;
}

/** Rejoint une bataille en attente, mise à l'appui, et la résout aussitôt. */
export function rejointBataille(db: Database, joueurId: string, batailleId: string): Bataille {
  const bataille = db.batailles.find((b) => b.id === batailleId);
  if (!bataille) throw new BatailleError('Bataille inconnue.', 'BATAILLE_INCONNUE');
  if (bataille.statut !== 'ATTENTE') {
    throw new BatailleError('Cette bataille est déjà jouée.', 'DEJA_RESOLUE');
  }
  if (bataille.hoteId === joueurId) {
    throw new BatailleError(
      'On ne rejoint pas sa propre bataille — lance contre le bot.',
      'TA_PROPRE_BATAILLE',
    );
  }

  debit(db, joueurId, bataille.mise, 'MISE_BATAILLE', bataille.boosterIds.join(','));
  bataille.adversaireId = joueurId;
  return resout(db, bataille);
}

/**
 * Lance la bataille contre le bot. Réservé à l'hôte.
 *
 * Le bot ne mise rien puisqu'il ne possède rien : ses sachets sont créés pour
 * l'occasion. C'est une pièce qu'on lance — perdre coûte la mise, gagner la
 * double — et l'espérance est neutre précisément parce qu'il tire aux mêmes
 * taux.
 */
export function batailleContreBot(db: Database, joueurId: string, batailleId: string): Bataille {
  const bataille = db.batailles.find((b) => b.id === batailleId);
  if (!bataille) throw new BatailleError('Bataille inconnue.', 'BATAILLE_INCONNUE');
  if (bataille.statut !== 'ATTENTE') {
    throw new BatailleError('Cette bataille est déjà jouée.', 'DEJA_RESOLUE');
  }
  if (bataille.hoteId !== joueurId) {
    throw new BatailleError('Seul l’hôte peut lancer contre le bot.', 'PAS_TA_BATAILLE');
  }

  bataille.adversaireId = CAMP_BOT;
  return resout(db, bataille);
}

/**
 * Annule une bataille que personne n'a rejointe, et rend la mise.
 *
 * Sans cette sortie, une bataille créée un soir sans adversaire immobiliserait
 * les flocons de l'hôte pour toujours. Elle n'est ouverte qu'à lui, et
 * seulement tant que rien n'a été tiré.
 */
export function annuleBataille(db: Database, joueurId: string, batailleId: string): Bataille {
  const bataille = db.batailles.find((b) => b.id === batailleId);
  if (!bataille) throw new BatailleError('Bataille inconnue.', 'BATAILLE_INCONNUE');
  if (bataille.statut !== 'ATTENTE') {
    throw new BatailleError('Cette bataille est déjà jouée.', 'DEJA_RESOLUE');
  }
  if (bataille.hoteId !== joueurId) {
    throw new BatailleError('Seul l’hôte peut annuler sa bataille.', 'PAS_TA_BATAILLE');
  }

  credit(db, joueurId, bataille.mise, 'REMBOURSEMENT_BATAILLE', bataille.id);
  bataille.statut = 'ANNULEE';
  bataille.resolueA = new Date().toISOString();
  return bataille;
}

/** Les batailles en attente d'adversaire, la plus récente en tête. */
export function batailleslibres(db: Database): Bataille[] {
  return db.batailles
    .filter((b) => b.statut === 'ATTENTE')
    .sort((a, b) => b.creeeA.localeCompare(a.creeeA));
}

/* ------------------------------ Vue client ------------------------------ */

export interface CampVue {
  /** L'identifiant du camp : celui d'un joueur, ou `BOT`. */
  id: string;
  pseudo: string;
  bot: boolean;
  /** Les cartes tirées, dans l'ordre du lot. Vide tant que rien n'est joué. */
  cartes: { cardId: string; relance: boolean }[];
  score: number;
}

export interface BatailleVue {
  id: string;
  /** Les sachets en jeu, dans l'ordre, avec de quoi les dessiner. */
  sachets: { id: string; nom: string; prix: number }[];
  manches: number;
  mise: number;
  statut: Bataille['statut'];
  hoteId: string;
  camps: CampVue[];
  vainqueurId: string | null;
  creeeA: string;
  resolueA: string | null;
}

/**
 * Ce qu'une bataille montre au navigateur.
 *
 * Tout y est déjà décidé : les cartes des deux camps, les scores, le vainqueur.
 * Le client ne fait que mettre en scène. Renvoyer le tirage complet plutôt que
 * le seul verdict est délibéré — c'est ce qui permet de rejouer les rouleaux, et
 * ce qui rend le résultat vérifiable à l'œil par les deux joueurs.
 */
export function vueBataille(db: Database, bataille: Bataille): BatailleVue {
  const nomDe = (id: string): string => {
    if (id === CAMP_BOT) return 'Le Bot';
    return db.players.find((p) => p.id === id)?.pseudo ?? 'Joueur inconnu';
  };

  const camps: CampVue[] = bataille.tirages.map((tirage) => ({
    id: tirage.camp,
    pseudo: nomDe(tirage.camp),
    bot: tirage.camp === CAMP_BOT,
    cartes: tirage.cardIds.map((cardId, i) => ({
      cardId,
      relance: tirage.relances.includes(i),
    })),
    score: tirage.score,
  }));

  // Tant que rien n'est tiré, il n'y a qu'un camp à montrer : l'hôte qui attend.
  if (camps.length === 0) {
    camps.push({ id: bataille.hoteId, pseudo: nomDe(bataille.hoteId), bot: false, cartes: [], score: 0 });
  }

  return {
    id: bataille.id,
    sachets: bataille.boosterIds.map((id) => {
      const b = resolvedBooster(db, id);
      return { id, nom: b?.name ?? id, prix: b?.price ?? 0 };
    }),
    manches: bataille.manches,
    mise: bataille.mise,
    statut: bataille.statut,
    hoteId: bataille.hoteId,
    camps,
    vainqueurId: bataille.vainqueurId,
    creeeA: bataille.creeeA,
    resolueA: bataille.resolueA,
  };
}

/**
 * Les batailles à montrer sur la page : celles qui attendent, et les dernières
 * jouées.
 *
 * Les terminées restent affichées un moment parce qu'elles sont la meilleure
 * réponse au « est-ce que ça marche vraiment ? » — on voit les deux tirages
 * côte à côte, et qui a gagné.
 */
export function tableauBatailles(db: Database, recentes = 12): BatailleVue[] {
  const attente = db.batailles
    .filter((b) => b.statut === 'ATTENTE')
    .sort((a, b) => b.creeeA.localeCompare(a.creeeA));
  const jouees = db.batailles
    .filter((b) => b.statut === 'TERMINEE')
    .sort((a, b) => (b.resolueA ?? '').localeCompare(a.resolueA ?? ''))
    .slice(0, recentes);
  return [...attente, ...jouees].map((b) => vueBataille(db, b));
}

/**
 * Les plus gros affrontements des sept derniers jours.
 *
 * Classés sur le **pot**, c'est-à-dire les deux mises réunies : c'est ce qui a
 * réellement changé de mains, et c'est la seule mesure qu'un joueur peut
 * vérifier lui-même en regardant la partie. Trier sur la valeur des cartes
 * gagnées reviendrait à classer sur la chance ; trier sur le score de raretés
 * ferait remonter des affrontements à cinq Givre où personne n'a rien risqué.
 *
 * Sept jours glissants, et non « depuis lundi » : un tableau qui se vide chaque
 * lundi matin n'a rien à montrer au moment où le plus de monde le regarde.
 */
export function topSemaine(db: Database, combien = 5): BatailleVue[] {
  const depuis = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return db.batailles
    .filter((b) => b.statut === 'TERMINEE' && b.resolueA !== null)
    .filter((b) => new Date(b.resolueA!).getTime() >= depuis)
    .sort((a, b) => b.mise - a.mise || (b.resolueA ?? '').localeCompare(a.resolueA ?? ''))
    .slice(0, combien)
    .map((b) => vueBataille(db, b));
}
