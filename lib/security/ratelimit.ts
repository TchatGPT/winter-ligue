import 'server-only';

/**
 * Limitation de débit par seau à jetons, en mémoire.
 *
 * Elle protège contre le forçage du mot de passe admin, le spam d'enchères et
 * l'ouverture en boucle de boosters. Sur un déploiement multi-instances il
 * faudra la déporter (Redis/Upstash) : le contrat de `consume()` est fait pour
 * que ce remplacement soit local. Voir `docs/SECURITE.md`.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Nettoyage paresseux pour éviter que la table grossisse indéfiniment. */
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > windowMs * 4) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Secondes avant la prochaine tentative autorisée. */
  retryAfter: number;
  remaining: number;
}

/**
 * Consomme un jeton pour `key`. `limit` requêtes autorisées par `windowMs`,
 * réapprovisionnées progressivement plutôt qu'en une fois — un pic ne peut donc
 * pas passer juste après la remise à zéro d'une fenêtre.
 */
export function consume(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key);
  const refillRate = limit / windowMs;

  if (!bucket) {
    buckets.set(key, { tokens: limit - 1, updatedAt: now });
    return { ok: true, retryAfter: 0, remaining: limit - 1 };
  }

  const refilled = Math.min(limit, bucket.tokens + (now - bucket.updatedAt) * refillRate);
  bucket.updatedAt = now;

  if (refilled < 1) {
    bucket.tokens = refilled;
    return {
      ok: false,
      retryAfter: Math.ceil((1 - refilled) / refillRate / 1000),
      remaining: 0,
    };
  }

  bucket.tokens = refilled - 1;
  return { ok: true, retryAfter: 0, remaining: Math.floor(bucket.tokens) };
}

/** Barèmes par famille d'action. */
export const LIMITS = {
  /** Connexion admin : volontairement très strict. */
  login: { limit: 5, windowMs: 15 * 60_000 },
  /** Écritures de jeu (cartes, boosters). */
  mutation: { limit: 30, windowMs: 60_000 },
  /** Enchères : plus permissif, une fin de vente est nerveuse. */
  bid: { limit: 60, windowMs: 60_000 },
  /** Lectures d'API. */
  read: { limit: 240, windowMs: 60_000 },
} as const;

/** Remet à zéro le compteur d'une clé (après une connexion réussie). */
export function reset(key: string): void {
  buckets.delete(key);
}
