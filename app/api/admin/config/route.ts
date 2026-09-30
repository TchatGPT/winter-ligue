import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { adminConfigSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Réglages de saison : la limite de games par joueur. C'est une règle de la
 * saison, pas son animation : réservé aux administrateurs.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-config',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminConfigSchema,
  });
  if (!g.ok) return g.response;

  const config = await getStore().transaction((db) => {
    if (g.body.maxGamesPerPlayer !== undefined) {
      db.config.maxGamesPerPlayer = g.body.maxGamesPerPlayer;
    }
    audit(db, g.session?.sub ?? 'admin', 'CONFIG_MODIFIEE', null, JSON.stringify(g.body));
    return db.config;
  });

  return ok(config);
}
