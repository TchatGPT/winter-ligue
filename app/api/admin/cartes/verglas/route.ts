import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { verglasSchema } from '@/lib/api/schemas';
import { playerIdOf } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { joueVerglas } from '@/lib/services/effects';
import { audit } from '@/lib/services/ledger';
import { joueursEnLice } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Joue un Verglas : le joueur qui le garde a choisi sa victime, la modération
 * valide. La victime reçoit −20 pts sur sa prochaine game.
 *
 * Le serveur vérifie tout : la carte est bien un Verglas encore gardé, la
 * victime est en lice (ni la streameuse, ni un compte inactif) et n'est pas
 * le joueur lui-même. Un membre de la modération ne joue pas le Verglas qu'il
 * garde lui-même : un autre le fait pour lui. Le journal garde qui a joué
 * quoi, sur qui.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-cartes-verglas',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: verglasSchema,
  });
  if (!g.ok) return g.response;
  const moi = playerIdOf(g.session);

  try {
    const resultat = await getStore().transaction((db) => {
      const carte = db.cartesEnAttente.find((c) => c.id === g.body.carteId);
      if (!carte) return 'CARTE' as const;
      if (moi && carte.joueurId === moi) return 'SOI' as const;
      const cible = joueursEnLice(db).find((p) => p.id === g.body.cibleId);
      if (!cible) return 'CIBLE' as const;
      const joue = joueVerglas(db, carte.id, cible);
      if (typeof joue === 'string') return joue;
      const porteur = db.players.find((p) => p.id === carte.joueurId)?.pseudo ?? '?';
      audit(db, g.session?.sub ?? 'admin', 'VERGLAS_JOUE', cible.id, `Verglas de ${porteur} sur ${cible.pseudo} : ${joue.resultat}`);
      return joue;
    });
    if (resultat === 'CARTE') return fail('INTROUVABLE', 'Ce Verglas n’est plus en main : il a déjà été joué.');
    if (resultat === 'SOI') {
      return fail('CONFLIT', 'Tu ne joues pas un Verglas que tu gardes toi-même : un autre membre de la modération le fera.');
    }
    if (resultat === 'CIBLE') return fail('CONFLIT', 'Ce joueur ne peut pas recevoir ce Verglas.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
