import { PackOpening, type JoueurOuverture, type PackVitrine } from '@/components/PackOpening';
import { getSession } from '@/lib/auth/session';
import { exigeSession } from '@/lib/auth/acces';
import { getStore } from '@/lib/db/store';
import { cartesDuPack } from '@/lib/domain/catalog';
import { chanceDe } from '@/lib/domain/rules';
import { fileDesPacks, resolvedPacks } from '@/lib/services/packs';
import { TitreGlace } from '@/components/TitreGlace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Boosters' };

/**
 * Les boosters : la même page qu'avant, à une différence près — personne
 * n'achète. Le bouton d'ouverture et le choix du joueur n'apparaissent
 * qu'à la modération ; la route d'API revérifie le rôle de son côté.
 */
export default async function PacksPage(){
  await exigeSession();
  const session = await getSession();
  const moderateur = session?.role === 'admin' || session?.role === 'moderateur';

  const { packs, file, joueurs } = await getStore().read((db) => ({
    // Les taux réglés par l'administration, pas ceux du catalogue : la page
    // doit annoncer ce que le serveur appliquera.
    packs: resolvedPacks(db).map(
      (p): PackVitrine => ({
        ...p,
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
    file: fileDesPacks(db),
    // La liste des joueurs ne quitte le serveur que pour la modération.
    joueurs: moderateur
      ? db.players
          .filter((p) => p.active)
          .map(
            (p): JoueurOuverture => ({
              id: p.id,
              pseudo: p.pseudo,
              snowflakes: p.snowflakes,
              chance: chanceDe(p.snowflakes),
            }),
          )
          .sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'))
      : [],
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <TitreGlace taille="page">Les boosters</TitreGlace>
        <p className="text-[15px] text-muted">
          Une carte par booster, ouverte à l’antenne, posée sur ta prochaine game.
        </p>
      </header>

      <PackOpening packs={packs} file={file} joueurs={joueurs} moderateur={moderateur} />
    </div>
  );
}
