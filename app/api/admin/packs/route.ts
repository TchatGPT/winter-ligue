import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { guard, ok } from '@/lib/api/respond';
import { adminPackSchema, ouvrirPackSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import type { PackId } from '@/lib/domain/types';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';
import {
  dernieresOuvertures,
  fileDesPacks,
  ouvrePack,
  reglagePack,
  resolvedPacks,
  vueOuverture,
} from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** La file des packs à ouvrir, les packs réglés, et les dernières ouvertures. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'admin-packs-read', role: 'moderateur' });
  if (!g.ok) return g.response;

  const data = await getStore().read((db) => ({
    file: fileDesPacks(db),
    packs: resolvedPacks(db).map((p) => ({
      id: p.id,
      name: p.name,
      portee: p.portee,
      weights: p.weights,
      modifie: db.reglagesPacks.some((r) => r.packId === p.id),
    })),
    ouvertures: dernieresOuvertures(db, 12),
  }));

  return ok(data);
}

/**
 * Ouvre un pack, à l'antenne.
 *
 * Réservé à la modération : c'est elle qui fait vivre la saison. Le tirage a
 * lieu ici, dans la transaction ; le rail ne fait que révéler la carte qu'on
 * lui renvoie. Relancer la même requête — même clé — rend la même ouverture.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-packs-ouvrir',
    role: 'moderateur',
    limit: LIMITS.mutation,
    schema: ouvrirPackSchema,
  });
  if (!g.ok) return g.response;

  try {
    const vue = await getStore().transaction((db) => {
      const ouverture = ouvrePack(
        db,
        {
          packDuId: g.body.packDuId,
          packId: g.body.packId as PackId | undefined,
          joueurId: g.body.joueurId,
          idempotencyKey: g.body.idempotencyKey,
        },
        g.session?.sub ?? 'admin',
      );
      return vueOuverture(db, ouverture);
    });
    return ok(vue);
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * Réglage de la table d'un pack.
 *
 * Réservé aux administrateurs : c'est la règle de la saison qui se joue ici,
 * pas son animation quotidienne. Un modérateur ouvre les packs, il ne peut pas
 * rendre les légendaires dix fois plus fréquentes.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-packs-regler',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminPackSchema,
  });
  if (!g.ok) return g.response;

  try {
    const pack = await getStore().transaction((db) => {
      const resultat = reglagePack(db, g.body.packId, g.body.weights);
      audit(
        db,
        g.session?.sub ?? 'admin',
        'PACK_REGLE',
        g.body.packId,
        g.body.weights === null ? 'retour au catalogue' : `L ${resultat.weights.L}/100000`,
      );
      return resultat;
    });
    return ok({ id: pack.id, name: pack.name, weights: pack.weights });
  } catch (error) {
    return toResponse(error);
  }
}
