import { EcranCartes, type LigneCollectible } from '@/components/admin/EcranCartes';
import { getStore } from '@/lib/db/store';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cartes — Administration' };

export default async function AdminCartesPage() {
  const collectibles = await getStore().read((db) =>
    [...db.collectibles]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(
        (c): LigneCollectible => ({
          id: c.id,
          kind: c.kind,
          name: c.name,
          subtitle: c.subtitle,
          rarity: c.rarity,
          glyph: c.glyph,
          createdAt: c.createdAt,
        }),
      ),
  );

  return <EcranCartes collectibles={collectibles} />;
}
