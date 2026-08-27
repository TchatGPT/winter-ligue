import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, ok } from '@/lib/api/respond';
import type { Database } from '@/lib/db/entities';
import { getStore, SCHEMA_VERSION } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Export complet de la base, au format JSON. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'admin-backup', role: 'admin' });
  if (!g.ok) return g.response;

  const snapshot = await getStore().read((db) => db);
  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="winter-ligue-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}

/**
 * Restauration d'une sauvegarde.
 *
 * On ne valide que l'ossature : les tableaux attendus et la version de schéma.
 * Une restauration reste une opération destructive, réservée à la modération et
 * tracée au journal.
 */
const restoreSchema = z.object({
  version: z.number().int().max(SCHEMA_VERSION),
  config: z.object({}).passthrough(),
  players: z.array(z.object({}).passthrough()),
  games: z.array(z.object({}).passthrough()),
  cards: z.array(z.object({}).passthrough()),
  discoveries: z.array(z.object({}).passthrough()),
  openings: z.array(z.object({}).passthrough()),
  effects: z.array(z.object({}).passthrough()),
  ledger: z.array(z.object({}).passthrough()),
  listings: z.array(z.object({}).passthrough()),
  bids: z.array(z.object({}).passthrough()),
  sales: z.array(z.object({}).passthrough()),
  events: z.array(z.object({}).passthrough()),
  audit: z.array(z.object({}).passthrough()),
});

export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-restore',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: restoreSchema,
  });
  if (!g.ok) return g.response;

  const store = getStore();
  await store.replace(g.body as unknown as Database);
  await store.transaction((db) => {
    audit(db, 'admin', 'RESTAURATION', null, `${db.players.length} joueurs restaurés`);
  });

  return ok({ restaure: true });
}
