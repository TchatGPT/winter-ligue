import { EcranPacks, type JoueurPack, type PackAdmin } from '@/components/admin/EcranPacks';
import { getSession } from '@/lib/auth/session';
import { getStore } from '@/lib/db/store';
import { cartesDuPack } from '@/lib/domain/catalog';
import { chanceDe } from '@/lib/domain/rules';
import { dernieresOuvertures, fileDesPacks, resolvedPacks } from '@/lib/services/packs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packs — Administration' };

export default async function AdminPacksPage() {
  const session = await getSession();
  const estAdmin = session?.role === 'admin';

  const data = await getStore().read((db) => ({
    file: fileDesPacks(db),
    packs: resolvedPacks(db).map(
      (p): PackAdmin => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        declencheur: p.declencheur,
        portee: p.portee,
        pourQui: p.pourQui,
        weights: p.weights,
        modifie: db.reglagesPacks.some((r) => r.packId === p.id),
        cartes: cartesDuPack(p.id).map((c) => ({
          cardId: c.id,
          name: c.name,
          rarity: c.rarity,
          glyph: c.glyph,
          description: c.description,
          power: c.power,
          nature: c.nature,
        })),
      }),
    ),
    ouvertures: dernieresOuvertures(db, 12),
    joueurs: db.players
      .filter((p) => p.active)
      .map(
        (p): JoueurPack => ({
          id: p.id,
          pseudo: p.pseudo,
          snowflakes: p.snowflakes,
          chance: chanceDe(p.snowflakes),
        }),
      )
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
  }));

  return (
    <EcranPacks
      file={data.file}
      packs={data.packs}
      ouvertures={data.ouvertures}
      joueurs={data.joueurs}
      estAdmin={estAdmin}
    />
  );
}
