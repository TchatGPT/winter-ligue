import 'server-only';

/**
 * Vue « mon compte » : cartes en attente, packs dus, flocons, games.
 *
 * Assemblée côté serveur puis envoyée telle quelle au rendu. Le grand livre
 * n'est envoyé qu'au joueur lui-même.
 */

import { chaineDeLaLigue } from '@/lib/auth/twitch';
import { CAMP_BOT, type Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { chanceDe, SEASON } from '@/lib/domain/rules';
import { estLaStreameuse } from '@/lib/domain/streameuse';
import { classementDe, gamesOf, totalsOf } from './league';
import {
  cartesEnAttenteDe,
  type CarteEnAttenteVue,
  type OuvertureVue,
  vueOuverture,
} from './packs';

export interface ProfileView {
  id: string;
  slug: string;
  pseudo: string;
  avatarUrl: string | null;
  twitchLogin: string | null;
  snowflakes: number;
  /** La chance que le solde donne aux packs ouverts pour ce joueur, de 0 à 1. */
  chance: number;
  /** Packs en file pour ce joueur, pas encore ouverts. */
  packsDus: { id: string; pack: string; raison: string; creeA: string }[];
  cartesEnAttente: CarteEnAttenteVue[];
  /** Les dernières ouvertures qui l'ont concerné. */
  ouvertures: OuvertureVue[];
  totals: ReturnType<typeof totalsOf>;
  games: {
    id: string;
    kills: number;
    placement: number | null;
    bonusPoints: number;
    score: number;
    skipped: boolean;
    playedAt: string;
    note: string | null;
    applied: { cardId: string; points: number }[];
  }[];
  ledger: { delta: number; balanceAfter: number; reason: string; createdAt: string }[];
}

function buildProfile(db: Database, playerId: string): ProfileView | null {
  const player = db.players.find((p) => p.id === playerId);
  if (!player) return null;

  return {
    id: player.id,
    slug: player.slug,
    pseudo: player.pseudo,
    avatarUrl: player.avatarUrl,
    twitchLogin: player.twitchLogin,
    snowflakes: player.snowflakes,
    chance: chanceDe(player.snowflakes),
    packsDus: db.packsDus
      .filter((p) => p.joueurId === playerId && p.ouvertureId === null)
      .map((p) => ({ id: p.id, pack: p.packId, raison: p.raison, creeA: p.creeA })),
    cartesEnAttente: cartesEnAttenteDe(db, playerId),
    ouvertures: [...db.ouvertures]
      .filter((o) => o.joueurId === playerId || o.beneficiaires.includes(playerId))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, 8)
      .map((o) => vueOuverture(db, o)),
    totals: totalsOf(db, playerId),
    games: gamesOf(db, playerId).map((g) => ({
      id: g.id,
      kills: g.kills,
      placement: g.placement,
      bonusPoints: g.bonusPoints,
      score: g.score,
      skipped: g.skipped,
      playedAt: g.playedAt,
      note: g.note,
      applied: g.applied.map((a) => ({ cardId: a.cardId, points: a.points })),
    })),
    ledger: db.ledger
      .filter((e) => e.playerId === playerId)
      .slice(-25)
      .reverse()
      .map((e) => ({
        delta: e.delta,
        balanceAfter: e.balanceAfter,
        reason: e.reason,
        createdAt: e.createdAt,
      })),
  };
}

/** Profil du joueur connecté. */
export async function getProfile(playerId: string): Promise<ProfileView | null> {
  return getStore().read((db) => buildProfile(db as Database, playerId));
}

/** Vue publique d'un joueur : sans le grand livre. */
export async function getPublicProfile(slug: string): Promise<Omit<ProfileView, 'ledger'> | null> {
  return getStore().read((db) => {
    const player = db.players.find((p) => p.slug === slug);
    if (!player) return null;
    const full = buildProfile(db as Database, player.id);
    if (!full) return null;
    const { ledger: _ledger, ...visible } = full;
    return visible;
  });
}

/* -------------------------------------------------------------------------- */
/* La fiche d'un joueur                                                        */
/* -------------------------------------------------------------------------- */

export interface DuelFiche {
  id: string;
  adversaire: string;
  bot: boolean;
  gagne: boolean;
  mise: number;
  resolueA: string;
}

/**
 * Tout ce que montre la page d'un joueur, en une seule lecture de la base :
 * son profil public, sa place au classement, ses créneaux de games et ses
 * duels.
 */
export interface FicheJoueur {
  profil: Omit<ProfileView, 'ledger'>;
  role: 'joueur' | 'admin';
  /** La streameuse : hors classement, elle ne joue pas de game. */
  streameuse: boolean;
  /**
   * Sa place, ou null hors classement. `ecart` : l'avance sur le premier
   * non qualifié s'il est qualifié, sinon ce qui lui manque pour la finale.
   */
  rang: { position: number; sur: number; finaliste: boolean; ecart: number | null } | null;
  /** Les games qui comptent pour lui : le plafond de la saison, plus ses créneaux gagnés. */
  creneaux: number;
  duels: { joues: number; gagnes: number; perdus: number; net: number; derniers: DuelFiche[] };
}

export async function getFicheJoueur(slug: string): Promise<FicheJoueur | null> {
  return getStore().read((lue) => {
    const db = lue as Database;
    const player = db.players.find((p) => p.slug === slug);
    if (!player) return null;
    const complet = buildProfile(db, player.id);
    if (!complet) return null;
    const { ledger: _ledger, ...profil } = complet;

    // Le classement, calculé comme sur la page d'accueil.
    const classement = classementDe(db);
    const i = classement.findIndex((r) => r.id === player.id);
    let rang: FicheJoueur['rang'] = null;
    if (i >= 0) {
      const ligne = classement[i];
      const qualifies = SEASON.finalistCount;
      let ecart: number | null = null;
      if (ligne.finalist) {
        const premierHors = classement[qualifies];
        if (premierHors) ecart = ligne.totals.totalScore - premierHors.totals.totalScore;
      } else {
        const dernierQualifie = classement[qualifies - 1];
        if (dernierQualifie) ecart = dernierQualifie.totals.totalScore - ligne.totals.totalScore;
      }
      rang = { position: ligne.rank, sur: classement.length, finaliste: ligne.finalist, ecart };
    }

    // Ses duels joués, du plus récent au plus ancien.
    const nomDe = (id: string | null) =>
      id === CAMP_BOT ? 'le Bot' : (db.players.find((p) => p.id === id)?.pseudo ?? 'un joueur');
    const joues = db.batailles
      .filter(
        (b) =>
          b.statut === 'TERMINEE' &&
          b.resolueA !== null &&
          (b.hoteId === player.id || b.adversaireId === player.id),
      )
      .sort((a, b) => (b.resolueA ?? '').localeCompare(a.resolueA ?? ''));
    const gagnes = joues.filter((b) => b.vainqueurId === player.id).length;

    return {
      profil,
      role: player.role,
      streameuse: estLaStreameuse(player, chaineDeLaLigue()),
      rang,
      creneaux: db.config.maxGamesPerPlayer + (player.creneauxBonus ?? 0),
      duels: {
        joues: joues.length,
        gagnes,
        perdus: joues.length - gagnes,
        // Le gagnant récupère sa mise et prend celle de l'autre : +mise, ou −mise.
        net: joues.reduce((total, b) => total + (b.vainqueurId === player.id ? b.mise : -b.mise), 0),
        derniers: joues.slice(0, 4).map((b) => {
          const adversaireId = b.hoteId === player.id ? b.adversaireId : b.hoteId;
          return {
            id: b.id,
            adversaire: nomDe(adversaireId),
            bot: adversaireId === CAMP_BOT,
            gagne: b.vainqueurId === player.id,
            mise: b.mise,
            resolueA: b.resolueA ?? b.creeeA,
          };
        }),
      },
    };
  });
}
