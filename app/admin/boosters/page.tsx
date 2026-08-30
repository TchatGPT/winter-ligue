import { redirect } from 'next/navigation';
import { EcranBoosters, type ReglageBooster } from '@/components/admin/EcranBoosters';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { resolvedBoosters } from '@/lib/services/boosters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boosters — Administration' };

export default async function AdminBoostersPage() {
  // La mise en page laisse entrer les modérateurs ; cette section-ci ne les
  // concerne pas. La route d'API refuserait de toute façon, mais afficher un
  // écran dont chaque bouton échoue est une façon désagréable de le dire.
  const session = await getSession();
  if (session?.role !== 'admin') redirect('/admin');

  const boosters = await getStore().read((db) =>
    resolvedBoosters(db).map(
      (b): ReglageBooster => ({
        id: b.id,
        name: b.name,
        price: b.price,
        weights: b.weights,
        slots: b.slots,
        modifie: db.boosterSettings.some((r) => r.boosterId === b.id),
      }),
    ),
  );

  return <EcranBoosters boosters={boosters} />;
}
