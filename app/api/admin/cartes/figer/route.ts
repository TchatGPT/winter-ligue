import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { figerSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { joueFigeGarde } from '@/lib/services/effects';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Joue une Cryogénisation (Folie) : le joueur qui la garde dit quand, la
 * modération la joue. Le serveur choisit la game — sa meilleure encore sans
 * carte, jamais sa pire — et la fige. Un membre de la modération peut jouer la
 * sienne, comme le Verglas : la carte vient d'un tirage du serveur.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-cartes-figer',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: figerSchema,
  });
  if (!g.ok) return g.response;

  try {
    const resultat = await getStore().transaction((db) => {
      const carte = db.cartesEnAttente.find((c) => c.id === g.body.carteId);
      const joue = joueFigeGarde(db, g.body.carteId);
      if (typeof joue === 'string') return joue;
      const porteur = db.players.find((p) => p.id === carte?.joueurId)?.pseudo ?? '?';
      audit(db, g.session?.sub ?? 'admin', 'CRYOGENISATION_JOUEE', carte?.joueurId ?? null, `${porteur} : ${joue.resultat}`);
      return joue;
    });
    if (resultat === 'CARTE') return fail('INTROUVABLE', 'Cette carte n’est plus en main : elle a déjà été jouée.');
    if (resultat === 'GAMES') {
      return fail('CONFLIT', 'Aucune game à figer : il faut une game sans carte, qui ne soit pas sa pire. La carte reste en main.');
    }
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
