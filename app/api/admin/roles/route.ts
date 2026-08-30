import { NextResponse } from 'next/server';
import { fail, guard, ok } from '@/lib/api/respond';
import { adminRoleSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Attribution d'un rôle à un joueur.
 *
 * Réservé aux administrateurs, et pas aux modérateurs : un modérateur qui peut
 * distribuer les rôles peut se promouvoir, et la distinction entre les deux
 * échelons ne veut alors plus rien dire.
 *
 * ## Le dernier administrateur ne peut pas se retirer
 *
 * Deux garde-fous, et ils ne se recouvrent pas. On refuse d'abord qu'un
 * administrateur se rétrograde lui-même : c'est l'erreur de manipulation la
 * plus banale, et elle est irréversible depuis l'interface. On refuse ensuite de
 * retirer le dernier administrateur, quel qu'il soit — sans quoi deux admins
 * peuvent se rétrograder l'un l'autre et laisser la ligue sans personne pour
 * toucher aux règles.
 *
 * Il resterait le mot de passe de secours pour se rattraper, mais compter
 * là-dessus revient à transformer une faute de clic en incident.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-roles',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminRoleSchema,
  });
  if (!g.ok) return g.response;

  const acteur = g.session?.sub ?? 'admin';

  try {
    const resultat = await getStore().transaction((db) => {
      const joueur = db.players.find((p) => p.id === g.body.playerId);
      if (!joueur) return { erreur: 'Joueur introuvable.', joueur: null, inchange: false };

      if (joueur.role === g.body.role) {
        return { erreur: null, joueur, inchange: true };
      }

      if (g.body.role !== 'admin') {
        if (joueur.id === acteur) {
          return { erreur: 'Tu ne peux pas retirer ton propre rôle d’administrateur.', joueur: null, inchange: false };
        }
        const admins = db.players.filter((p) => p.role === 'admin');
        if (admins.length <= 1 && joueur.role === 'admin') {
          return { erreur: 'Il doit rester au moins un administrateur.', joueur: null, inchange: false };
        }
      }

      const avant = joueur.role;
      joueur.role = g.body.role;
      audit(db, acteur, 'ROLE_MODIFIE', joueur.id, `${avant} → ${joueur.role}`);
      return { erreur: null, joueur, inchange: false };
    });

    if (resultat.erreur || !resultat.joueur) {
      return fail('REQUETE_INVALIDE', resultat.erreur ?? 'Joueur introuvable.');
    }
    return ok({
      playerId: resultat.joueur.id,
      pseudo: resultat.joueur.pseudo,
      role: resultat.joueur.role,
      inchange: resultat.inchange,
    });
  } catch {
    return fail('ERREUR_SERVEUR', 'Le changement de rôle a échoué.');
  }
}
