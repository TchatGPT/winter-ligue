import { NextResponse } from 'next/server';
import { guard, ok } from '@/lib/api/respond';
import { adminConfigSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Réglages de saison : limite de games, ouverture de la boutique et du marché. */
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
    if (g.body.shopOpen !== undefined) db.config.shopOpen = g.body.shopOpen;
    if (g.body.marketOpen !== undefined) db.config.marketOpen = g.body.marketOpen;
    audit(db, 'admin', 'CONFIG_MODIFIEE', null, JSON.stringify(g.body));
    return db.config;
  });

  return ok(config);
}
