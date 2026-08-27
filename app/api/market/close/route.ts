import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { fail, ok } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { closeExpiredListings } from '@/lib/services/market';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clôture des ventes échues, destinée à un cron (Vercel Cron, GitHub Actions…).
 *
 * Protégée par `CRON_SECRET` en en-tête `authorization: Bearer …`, comparé à
 * temps constant. Sans secret configuré, la route est fermée : mieux vaut une
 * clôture paresseuse à la visite qu'un endpoint ouvert.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail('INTROUVABLE', 'Route indisponible.');

  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return fail('NON_AUTORISE', 'Secret de cron invalide.');
  }

  const closed = await getStore().transaction((db) => closeExpiredListings(db));
  return ok({ closed });
}
