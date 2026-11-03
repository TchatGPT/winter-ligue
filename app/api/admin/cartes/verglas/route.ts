import { NextResponse } from 'next/server';
import { toResponse } from '@/lib/api/errors';
import { fail, guard, ok } from '@/lib/api/respond';
import { verglasSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { getCard } from '@/lib/domain/catalog';
import { joueEchangeCible, joueVerglas } from '@/lib/services/effects';
import { audit } from '@/lib/services/ledger';
import { joueursEnLice } from '@/lib/services/packs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Joue une carte gardée qui vise un joueur : le joueur qui la garde a choisi
 * sa cible, la modération valide. Un Verglas (ou l'Éboulement du Finisseur) :
 * la victime perd les points de la carte sur son total, tout de suite. Un Troc
 * des Neiges (Finisseur) : la pire game libre du porteur et la meilleure de la
 * cible échangent leur score — une fois par joueur, sauf la revanche.
 *
 * Le serveur vérifie tout : la carte est bien un Verglas encore gardé, la
 * victime est en lice (ni la streameuse, ni un compte inactif) et n'est pas
 * le joueur lui-même. Un membre de la modération peut jouer le Verglas qu'il
 * garde (décidé le 02/11/2026) : la carte est sortie d'un tirage du serveur,
 * et le journal garde qui a joué quoi, sur qui.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-cartes-verglas',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: verglasSchema,
  });
  if (!g.ok) return g.response;

  try {
    const resultat = await getStore().transaction((db) => {
      const carte = db.cartesEnAttente.find((c) => c.id === g.body.carteId);
      if (!carte) return 'CARTE' as const;
      const cible = joueursEnLice(db).find((p) => p.id === g.body.cibleId);
      if (!cible) return 'CIBLE' as const;
      const card = getCard(carte.cardId);
      const troc = card?.effect.kind === 'echange_cible';
      const joue = troc ? joueEchangeCible(db, carte.id, cible) : joueVerglas(db, carte.id, cible);
      if (typeof joue === 'string') return joue;
      const porteur = db.players.find((p) => p.id === carte.joueurId)?.pseudo ?? '?';
      audit(
        db,
        g.session?.sub ?? 'admin',
        troc ? 'TROC_JOUE' : 'VERGLAS_JOUE',
        cible.id,
        `${card?.name ?? 'Carte'} de ${porteur} sur ${cible.pseudo} : ${joue.resultat}`,
      );
      return joue;
    });
    if (resultat === 'CARTE') return fail('INTROUVABLE', 'Cette carte n’est plus en main : elle a déjà été jouée.');
    if (resultat === 'CIBLE') return fail('CONFLIT', 'Ce joueur ne peut pas être visé par cette carte.');
    if (resultat === 'IMMUNISE') return fail('CONFLIT', 'Ce joueur est immunisé : il ne peut pas être visé.');
    if (resultat === 'DEJA') {
      return fail('CONFLIT', 'Le Troc des Neiges ne se joue qu’une fois par joueur — sauf en revanche, contre qui l’a visé.');
    }
    if (resultat === 'GAMES') return fail('CONFLIT', 'Il faut une game libre de chaque côté pour cet échange.');
    return ok(resultat);
  } catch (error) {
    return toResponse(error);
  }
}
