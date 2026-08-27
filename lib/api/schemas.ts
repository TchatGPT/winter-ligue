/**
 * Schémas de validation des entrées d'API.
 *
 * Rien n'entre dans le domaine sans être passé par ici. Les bornes reprennent
 * celles de `lib/domain/rules` : une valeur acceptée par Zod est donc toujours
 * une valeur que le moteur de score sait traiter.
 */

import { z } from 'zod';
import { BOOSTERS, CARDS } from '@/lib/domain/catalog';
import { GAME_LIMITS, MARKET } from '@/lib/domain/rules';

const cardIds = CARDS.map((c) => c.id) as [string, ...string[]];
const boosterIds = BOOSTERS.map((b) => b.id) as [string, ...string[]];

export const uuid = z.string().uuid('Identifiant invalide.');

/** Pseudo : lettres, chiffres, tirets et underscores. Pas de HTML possible. */
export const pseudo = z
  .string()
  .trim()
  .min(2, 'Deux caractères minimum.')
  .max(24, 'Vingt-quatre caractères maximum.')
  .regex(/^[\p{L}\p{N}_\-. ]+$/u, 'Caractères non autorisés dans le pseudo.');

export const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export const rarity = z.enum(['C', 'PC', 'R', 'SR', 'UR', 'L']);

export const createPlayerSchema = z.object({
  pseudo,
  /**
   * Rareté de la carte Joueur, figée à l'inscription et jamais modifiée
   * ensuite : une carte échangeable dont la rareté bougerait en cours de
   * saison ferait varier son foil, son taux de tirage et son prix sous les
   * pieds de ceux qui l'ont achetée.
   */
  cardRarity: rarity.optional(),
  twitchLogin: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,25}$/, 'Pseudo Twitch invalide.')
    .optional()
    .nullable(),
});

export const gameSchema = z.object({
  playerId: uuid,
  kills: z.number().int().min(GAME_LIMITS.minKills).max(GAME_LIMITS.maxKills),
  /** 1, 2, 3 ou aucun classement. */
  placement: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  note: z.string().trim().max(140).optional().nullable(),
  /**
   * Ni multiplicateur ni bonus ne sont acceptés du client : ils ne peuvent
   * venir que d'une carte jouée, résolue côté serveur.
   */
});

export const updateGameSchema = z.object({
  gameId: uuid,
  skipped: z.boolean().optional(),
  note: z.string().trim().max(140).optional().nullable(),
});

export const deleteGameSchema = z.object({ gameId: uuid });

export const purchaseSchema = z.object({
  boosterId: z.enum(boosterIds),
  /**
   * Clé d'idempotence fournie par le client : deux envois du même achat (double
   * clic, reprise réseau) ne débitent qu'une fois.
   */
  idempotencyKey: z.string().uuid(),
});

export const playCardSchema = z
  .object({
    cardInstanceId: uuid,
    /** Requis pour les cartes ciblant une de tes games. */
    gameId: uuid.optional(),
    /** Requis pour les malus. */
    targetPlayerId: uuid.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

/* ----------------------------- Hôtel des ventes -------------------------- */

export const createListingSchema = z
  .object({
    cardInstanceId: uuid,
    startPrice: z.number().int().min(MARKET.minPrice).max(MARKET.maxPrice),
    buyoutPrice: z.number().int().min(MARKET.minPrice).max(MARKET.maxPrice).nullable().optional(),
    durationHours: z.union(
      MARKET.durationsHours.map((h) => z.literal(h)) as unknown as [
        z.ZodLiteral<number>,
        z.ZodLiteral<number>,
        ...z.ZodLiteral<number>[],
      ],
    ),
  })
  .refine((v) => v.buyoutPrice == null || v.buyoutPrice > v.startPrice, {
    message: 'L’achat immédiat doit être supérieur au prix de départ.',
    path: ['buyoutPrice'],
  });

export const bidSchema = z.object({
  listingId: uuid,
  amount: z.number().int().min(MARKET.minPrice).max(MARKET.maxPrice),
});

export const buyoutSchema = z.object({ listingId: uuid });

export const cancelListingSchema = z.object({ listingId: uuid });

export const marketQuerySchema = z.object({
  cardId: z.enum(cardIds).optional(),
  rarity: z.enum(['C', 'PC', 'R', 'SR', 'UR', 'L']).optional(),
  theme: z.enum(['glace', 'tempete', 'aurore', 'solstice']).optional(),
  sort: z.enum(['fin', 'prix_asc', 'prix_desc', 'recent']).default('fin'),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

/* --------------------------------- Admin --------------------------------- */

export const adminConfigSchema = z.object({
  maxGamesPerPlayer: z.number().int().min(1).max(100).optional(),
  shopOpen: z.boolean().optional(),
  marketOpen: z.boolean().optional(),
});

export const adminGrantSchema = z.object({
  playerId: uuid,
  snowflakes: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  cardId: z.enum(cardIds).optional(),
  reason: z.string().trim().min(1).max(140),
});

export const eventSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  published: z.boolean().default(true),
});

export type GameInput = z.infer<typeof gameSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type BidInput = z.infer<typeof bidSchema>;
export type PlayCardInput = z.infer<typeof playCardSchema>;

/** Création d'une carte Moment par la modération. */
export const momentSchema = z.object({
  name: z.string().trim().min(2).max(48),
  subtitle: z.string().trim().max(64).default(''),
  description: z.string().trim().max(240).default(''),
  rarity,
  glyph: z.string().trim().min(1).max(8).default('🏅'),
});
