import { NextResponse } from 'next/server';
import { fail, guard, ok } from '@/lib/api/respond';
import { adminBoosterSchema } from '@/lib/api/schemas';
import { getStore } from '@/lib/db/store';
import { LIMITS } from '@/lib/security/ratelimit';
import { BoosterError, reglageBooster, resolvedBoosters } from '@/lib/services/boosters';
import { audit } from '@/lib/services/ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Les boosters tels qu'ils sont vendus, réglages appliqués. */
export async function GET(request: Request): Promise<NextResponse> {
  const g = await guard(request, { scope: 'admin-boosters-read', role: 'admin' });
  if (!g.ok) return g.response;

  const data = await getStore().read((db) => ({
    boosters: resolvedBoosters(db as never).map((b) => ({
      id: b.id,
      name: b.name,
      price: b.price,
      weights: b.weights,
      slots: b.slots,
      guaranteed: b.guaranteed,
    })),
    regles: (db as never as { boosterSettings: { boosterId: string }[] }).boosterSettings.map(
      (r) => r.boosterId,
    ),
  }));

  return ok(data);
}

/**
 * Réglage du prix et des taux d'un booster.
 *
 * Réservé aux administrateurs : c'est l'économie de la saison qui se joue ici,
 * pas son animation quotidienne. Un modérateur peut ouvrir la boutique, il ne
 * peut pas rendre les légendaires dix fois plus fréquentes.
 *
 * La validation vit dans `lib/services/boosters.ts` et non ici. C'est
 * volontaire : la règle « la table totalise exactement 100 000 » est une règle
 * de jeu, pas une règle de transport, et elle doit valoir pour tout appelant —
 * une future commande d'administration, un script de saison — et pas seulement
 * pour cette route.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const g = await guard(request, {
    scope: 'admin-boosters',
    role: 'admin',
    limit: LIMITS.mutation,
    schema: adminBoosterSchema,
  });
  if (!g.ok) return g.response;

  if (g.body.price === undefined && g.body.weights === undefined) {
    return fail('REQUETE_INVALIDE', 'Précise un prix ou une table de raretés.');
  }

  try {
    const booster = await getStore().transaction((db) => {
      const resultat = reglageBooster(db, g.body.boosterId, {
        price: g.body.price,
        weights: g.body.weights,
      });
      audit(
        db,
        g.session?.sub ?? 'admin',
        'BOOSTER_REGLE',
        g.body.boosterId,
        `prix ${resultat.price} — L ${resultat.weights.L}/100000`,
      );
      return resultat;
    });

    return ok({
      id: booster.id,
      name: booster.name,
      price: booster.price,
      weights: booster.weights,
    });
  } catch (error) {
    if (error instanceof BoosterError) return fail('REQUETE_INVALIDE', error.message);
    return fail('ERREUR_SERVEUR', 'Le réglage a échoué.');
  }
}
