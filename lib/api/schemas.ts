/**
 * Schémas de validation des entrées d'API.
 *
 * Rien n'entre dans le domaine sans être passé par ici. Les bornes reprennent
 * celles de `lib/domain/rules` : une valeur acceptée par Zod est donc toujours
 * une valeur que le moteur sait traiter.
 */

import { z } from 'zod';
import { MANCHES_POSSIBLES } from '@/lib/domain/bataille';
import { DUEL, GAME_LIMITS } from '@/lib/domain/rules';
import { PACK_IDS } from '@/lib/domain/types';

const packIds = PACK_IDS as unknown as [string, ...string[]];

export const uuid = z.string().uuid('Identifiant invalide.');

/**
 * Un texte libre — une note de game, un motif d'attribution. React l'échappe
 * à l'affichage ; on en retire en plus les caractères de contrôle et ceux qui
 * retournent le sens de lecture : ils servent à faire lire au journal autre
 * chose que ce qui y est écrit.
 */
const INVISIBLES = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu;
const texteLibre = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((t) => t.replace(INVISIBLES, '').trim())
    .pipe(z.string().max(max));

/** Pseudo : lettres, chiffres, tirets et underscores. Pas de HTML possible. */
export const pseudo = z
  .string()
  .trim()
  .min(2, 'Deux caractères minimum.')
  .max(24, 'Vingt-quatre caractères maximum.')
  .regex(/^[\p{L}\p{N}_\-. ]+$/u, 'Caractères non autorisés dans le pseudo.');

/**
 * Pseudo Activision : le nom en jeu, avec ou sans son suffixe numérique
 * (« Pseudo#1234567 »). Le dièse est permis ici, et nulle part ailleurs.
 */
export const activisionId = z
  .string()
  .trim()
  .min(2, 'Deux caractères minimum.')
  .max(40, 'Quarante caractères maximum.')
  .regex(/^[\p{L}\p{N}_\-. ]+(#\d{2,10})?$/u, 'Caractères non autorisés dans le pseudo Activision.');

/** Le joueur renseigne son propre pseudo Activision. */
export const monActivisionSchema = z.object({ activisionId });

/** La modération corrige celui d'un joueur. */
export const activisionJoueurSchema = z.object({ playerId: uuid, activisionId: activisionId.nullable() });

export const loginSchema = z.object({
  password: z.string().min(1).max(256),
});

export const rarity = z.enum(['C', 'PC', 'R', 'SR', 'UR', 'L']);

export const createPlayerSchema = z.object({
  pseudo,
  twitchLogin: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,25}$/, 'Pseudo Twitch invalide.')
    .optional()
    .nullable(),
  activisionId: activisionId.optional().nullable(),
});

export const gameSchema = z.object({
  playerId: uuid,
  kills: z.number().int().min(GAME_LIMITS.minKills).max(GAME_LIMITS.maxKills),
  /** 1, 2, 3 ou aucun classement. */
  placement: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  note: texteLibre(140).optional().nullable(),
  /**
   * Les kills du meilleur tueur de la partie, lus sur la même capture. C'est
   * une donnée de jeu, comme les kills : elle ne sert qu'à la carte « Clone
   * kill du meilleur », qui la borne.
   */
  meilleurKills: z
    .number()
    .int()
    .min(GAME_LIMITS.minKills)
    .max(GAME_LIMITS.maxKills)
    .optional()
    .nullable(),
  /**
   * Ni multiplicateur ni bonus ne sont acceptés du client : ils ne peuvent
   * venir que d'une carte de pack, résolue côté serveur à la saisie.
   */
});

export const updateGameSchema = z.object({
  gameId: uuid,
  skipped: z.boolean().optional(),
  note: texteLibre(140).optional().nullable(),
});

export const deleteGameSchema = z.object({ gameId: uuid });

/* -------------------------------- Packs ---------------------------------- */

/**
 * Ouvrir un pack : soit un pack de la file, soit un pack à la main.
 *
 * La clé d'idempotence est fournie par le client : deux envois de la même
 * ouverture (double clic, reprise réseau) ne tirent qu'une fois, et le rail
 * rejoue exactement la même carte.
 */
export const ouvrirPackSchema = z
  .object({
    packDuId: uuid.optional(),
    packId: z.enum(packIds).optional(),
    joueurId: uuid.optional(),
    idempotencyKey: z.string().uuid(),
  })
  .refine((v) => v.packDuId !== undefined || v.packId !== undefined, {
    message: 'Précise un pack de la file, ou un pack à ouvrir.',
    path: ['packId'],
  });

/**
 * Réglage de la table d'un pack.
 *
 * `null` veut dire « remets la table du catalogue ». Les poids ne sont pas
 * validés ici : leur somme doit valoir exactement 100 000, et un message
 * indiquant de combien on s'écarte vaut mieux qu'un refus de schéma.
 */
export const adminPackSchema = z.object({
  packId: z.enum(packIds),
  weights: z.record(z.string(), z.number()).nullable(),
});

/* ------------------------------- Batailles ------------------------------- */

export const createBatailleSchema = z.object({
  mise: z.number().int().min(DUEL.miseMin).max(DUEL.miseMax),
  // Toujours une seule manche. Le champ reste accepté, pour ne pas refuser
  // un écran resté ouvert, mais il ne peut valoir que 1.
  manches: z.literal(MANCHES_POSSIBLES[0]).default(MANCHES_POSSIBLES[0]),
});

export const batailleSchema = z.object({ batailleId: uuid });

/* --------------------------------- Twitch -------------------------------- */

/**
 * Un message EventSub, lu après la vérification de sa signature. Seul ce dont
 * le site se sert est décrit ; l'évènement lui-même est lu avec prudence, champ
 * par champ (`lib/domain/twitchSubs.ts`).
 */
export const eventSubSchema = z.object({
  challenge: z.string().min(1).max(512).optional(),
  subscription: z.object({
    type: z.string().max(100),
    status: z.string().max(100).optional(),
  }),
  event: z.record(z.string(), z.unknown()).optional(),
});

/* --------------------------------- Admin --------------------------------- */

export const adminConfigSchema = z.object({
  maxGamesPerPlayer: z.number().int().min(1).max(100).optional(),
});

export const adminGrantSchema = z.object({
  playerId: uuid,
  snowflakes: z.number().int().min(-1_000_000).max(1_000_000),
  reason: texteLibre(140).pipe(z.string().min(1, 'Un motif est obligatoire.')),
});

/** Saisie des subs : au compteur de la saison, au compte d'un joueur, ou remise à zéro. */
export const adminSubsSchema = z.union([
  z.object({ action: z.literal('remise-a-zero') }),
  z.object({ action: z.literal('subs'), delta: z.number().int().min(1).max(10_000) }),
  z.object({
    action: z.literal('subs-joueur'),
    playerId: uuid,
    delta: z.number().int().min(1).max(10_000),
  }),
]);

/**
 * Changement de rôle.
 *
 * La validation s'arrête ici à la forme : c'est la route qui refuse à un
 * administrateur de se retirer son propre rôle, parce que cette règle a besoin
 * de savoir qui parle.
 */
export const adminRoleSchema = z.object({
  playerId: uuid,
  role: z.enum(['joueur', 'admin']),
});

export type GameInput = z.infer<typeof gameSchema>;
