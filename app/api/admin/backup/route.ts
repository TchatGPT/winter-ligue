import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/respond';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Export complet de la base, au format JSON, journal compris.
 *
 * Réservé aux administrateurs, et borné en débit : c'est la route qui fait
 * sortir le plus de données d'un coup. Il n'y a plus de restauration par le
 * site — elle remplaçait toute la base, journal compris, d'une seule requête :
 * de quoi effacer une saison et ses traces. Une restauration se fait à la
 * main, sur la base, par qui y a accès.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'admin-backup', role: 'admin', limit: LIMITS.login });
  if (!g.ok) return g.response;

  const store = getStore();
  const [base, journal] = await Promise.all([store.read((db) => db), store.journal(1_000_000)]);
  const snapshot = { ...base, audit: [...journal].reverse() };
  const jour = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'content-disposition': 'attachment; filename="winter-ligue-' + jour + '.json"',
    },
  });
}
