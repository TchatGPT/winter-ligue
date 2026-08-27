import 'server-only';

/**
 * Le pool de cartes, toutes natures confondues.
 *
 * Deux origines cohabitent, et c'est délibéré :
 *
 *   — les **cartes à effet** sont figées dans `lib/domain/catalog.ts`. Chacune
 *     doit être équilibrée contre le classement, ce qui limite volontairement
 *     leur nombre à 24 ;
 *   — les **cartes de collection** (Joueur, Moment) vivent en base. Elles
 *     n'ont aucun effet, donc aucun risque d'équilibrage — c'est ce qui permet
 *     d'avoir un pool profond sans multiplier les combos à surveiller.
 *
 * Ce module est le seul endroit qui sait résoudre un identifiant vers une
 * carte affichable, quelle que soit son origine.
 */

import type { Collectible, Database, Player } from '@/lib/db/entities';
import { newId } from '@/lib/db/store';
import { cardArt, EFFECT_CARDS, getCard } from '@/lib/domain/catalog';
import type { CardKind, Rarity, ResolvedCard, ThemeId } from '@/lib/domain/types';

/** Préfixe des identifiants de cartes de collection, pour les distinguer d'un coup d'œil. */
export const JOUEUR_PREFIX = 'joueur-';
export const MOMENT_PREFIX = 'moment-';

/** Rareté par défaut d'une carte Joueur, si la modération n'en choisit pas. */
export const DEFAULT_PLAYER_RARITY: Rarity = 'PC';

function fromCollectible(item: Collectible, player: Player | undefined): ResolvedCard {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    subtitle: item.subtitle,
    description: item.description,
    rarity: item.rarity,
    glyph: item.glyph,
    art: item.art,
    theme: null,
    nature: null,
    power: null,
    playerId: item.playerId,
    playerSlug: player ? player.slug : null,
  };
}

/**
 * Résout un identifiant vers une carte affichable.
 *
 * Retourne null pour un identifiant inconnu — ce qui arrive légitimement quand
 * un joueur est désinscrit alors que sa carte circule encore : l'appelant
 * décide alors s'il l'ignore ou l'affiche en carte fantôme.
 */
export function resolveCard(db: Database, cardId: string): ResolvedCard | null {
  const effect = getCard(cardId);
  if (effect) {
    return {
      id: effect.id,
      kind: 'EFFET',
      name: effect.name,
      subtitle: effect.subtitle,
      description: effect.description,
      rarity: effect.rarity,
      glyph: effect.glyph,
      art: cardArt(effect.id),
      theme: effect.theme as ThemeId,
      nature: effect.nature,
      power: effect.power,
      playerId: null,
      playerSlug: null,
    };
  }

  const item = db.collectibles.find((c) => c.id === cardId);
  if (!item) return null;
  const player = item.playerId ? db.players.find((p) => p.id === item.playerId) : undefined;
  return fromCollectible(item, player);
}

/** Toutes les cartes du pool, dans un ordre stable : effets, puis joueurs, puis moments. */
export function allCards(db: Database): ResolvedCard[] {
  const effects = getEffectPool();
  const collection = db.collectibles
    .slice()
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'fr'))
    .map((item) =>
      fromCollectible(
        item,
        item.playerId ? db.players.find((p) => p.id === item.playerId) : undefined,
      ),
    );
  return [...effects, ...collection];
}

/** Cartes à effet, résolues. */
export function getEffectPool(): ResolvedCard[] {
  return EFFECT_CARDS.map((effect) => ({
    id: effect.id,
    kind: 'EFFET' as CardKind,
    name: effect.name,
    subtitle: effect.subtitle,
    description: effect.description,
    rarity: effect.rarity,
    glyph: effect.glyph,
    art: cardArt(effect.id),
    theme: effect.theme as ThemeId,
    nature: effect.nature,
    power: effect.power,
    playerId: null,
    playerSlug: null,
  }));
}

/** Identifiants de cartes de collection d'une rareté donnée, pour le tirage. */
export function collectionIdsByRarity(db: Database, rarity: Rarity): string[] {
  return db.collectibles.filter((c) => c.rarity === rarity).map((c) => c.id);
}

/** Raretés effectivement représentées dans le pool de collection. */
export function collectionRarities(db: Database): Set<Rarity> {
  return new Set(db.collectibles.map((c) => c.rarity));
}

/* ---------------------------- Cartes Joueur ------------------------------ */

/**
 * Crée la carte d'un participant, si elle n'existe pas déjà.
 *
 * Appelée à l'inscription : un joueur qui rejoint la ligue entre du même coup
 * dans le pool de cartes. Idempotente, pour qu'une reconnexion Twitch ne crée
 * pas de doublon.
 */
export function ensurePlayerCard(
  db: Database,
  player: Player,
  rarity: Rarity = DEFAULT_PLAYER_RARITY,
): Collectible {
  const id = `${JOUEUR_PREFIX}${player.slug}`;
  const existing = db.collectibles.find((c) => c.id === id);
  if (existing) {
    // Le pseudo peut changer — la carte suit, mais pas sa rareté.
    existing.name = player.pseudo;
    return existing;
  }

  const card: Collectible = {
    id,
    kind: 'JOUEUR',
    name: player.pseudo,
    subtitle: 'Participant de la saison',
    description:
      'Carte de collection. Aucun effet en jeu — sa valeur, c’est le marché qui la fait.',
    rarity,
    glyph: '🎴',
    art: null,
    playerId: player.id,
    createdAt: new Date().toISOString(),
  };
  db.collectibles.push(card);
  return card;
}

/* ---------------------------- Cartes Moment ------------------------------ */

export function createMomentCard(
  db: Database,
  input: { name: string; subtitle: string; description: string; rarity: Rarity; glyph: string },
): Collectible {
  // Un suffixe unique évite la collision entre deux moments homonymes — deux
  // records de kills peuvent tomber dans la même saison.
  const slug = input.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  const card: Collectible = {
    id: `${MOMENT_PREFIX}${slug}-${newId().slice(0, 6)}`,
    kind: 'MOMENT',
    name: input.name,
    subtitle: input.subtitle,
    description: input.description,
    rarity: input.rarity,
    glyph: input.glyph,
    art: null,
    playerId: null,
    createdAt: new Date().toISOString(),
  };
  db.collectibles.push(card);
  return card;
}

/* --------------------------- Vue d'ensemble ------------------------------ */

export interface PoolOverview {
  total: number;
  effets: number;
  joueurs: number;
  moments: number;
  parRarete: Record<Rarity, number>;
}

export function poolOverview(db: Database): PoolOverview {
  const cards = allCards(db);
  const parRarete = { C: 0, PC: 0, R: 0, SR: 0, UR: 0, L: 0 } as Record<Rarity, number>;
  for (const card of cards) parRarete[card.rarity] += 1;

  return {
    total: cards.length,
    effets: cards.filter((c) => c.kind === 'EFFET').length,
    joueurs: cards.filter((c) => c.kind === 'JOUEUR').length,
    moments: cards.filter((c) => c.kind === 'MOMENT').length,
    parRarete,
  };
}
