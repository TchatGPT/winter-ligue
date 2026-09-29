import 'server-only';

/**
 * Vue « mon compte » : cartes en attente, packs dus, flocons, games.
 *
 * Assemblée côté serveur puis envoyée telle quelle au rendu. Le grand livre
 * n'est envoyé qu'au joueur lui-même.
 */

import type { Database } from '@/lib/db/entities';
import { getStore } from '@/lib/db/store';
import { chanceDe, packsPersoAcquis, PACKS_REGLES } from '@/lib/domain/rules';
import { gamesOf, totalsOf } from './league';
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
  subsOfferts: number;
  /** Subs qu'il reste à offrir avant le prochain Booster Perso. */
  subsAvantPack: number;
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

  const acquis = packsPersoAcquis(player.subsOfferts);
  const subsAvantPack = (acquis + 1) * PACKS_REGLES.persoTousLes - player.subsOfferts;

  return {
    id: player.id,
    slug: player.slug,
    pseudo: player.pseudo,
    avatarUrl: player.avatarUrl,
    twitchLogin: player.twitchLogin,
    snowflakes: player.snowflakes,
    chance: chanceDe(player.snowflakes),
    subsOfferts: player.subsOfferts,
    subsAvantPack,
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
